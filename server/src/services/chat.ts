import type OpenAI from "openai";
import { classifyMessage, type ClassificationResult } from "../agent/classifier.js";
import { AGENT_VOICE, actionReplyAddon, pendingSaveAddon, telegramVoiceAddon, voiceMessageAddon } from "../agent/voice.js";
import { config } from "../config.js";
import { chatCompletion } from "./openai.js";
import {
  buildContext,
  getRecentConversation,
  handleClassification,
  saveAgentMessage,
  type AgentMessageInput,
  type MessageSource,
  type MessageType,
  type ReplyStyle,
} from "./memory.js";
import { formatPersonalContextForPrompt } from "./profile.js";
import { askBrain } from "./obsidian-brain.js";
import {
  offerObsidianSave,
  autoSaveToObsidian,
  tryHandleObsidianPending,
} from "./obsidian-save.js";
import { syncProfileToObsidian } from "./profile-obsidian.js";
import { tryVaultFastPath } from "./vault-fast-path.js";
import { autoRecallContext, recallAddon } from "./recall-context.js";
import { inferActiveProjectFromMessage } from "./project-resolve.js";
import {
  shouldOfferObsidianSave,
  shouldAutoSaveToObsidian,
  shouldConfirmObsidianSave,
  stripFalseSaveClaims,
  stripSaveFooters,
  normalizeProjectName,
  extractProjectNameFromThread,
  buildThreadActionContext,
} from "./save-context.js";

export interface ChatResult {
  reply: string;
  classification: ClassificationResult;
  actions: string[];
}

export interface ProcessChatOptions {
  source?: MessageSource;
  messageType?: MessageType;
  replyStyle?: ReplyStyle;
  telegramChatId?: string;
  telegramMessageId?: string;
  transcriptText?: string;
  rawText?: string;
  replyToText?: string;
  skipUserSave?: boolean;
}

function messageInput(
  opts: ProcessChatOptions,
  overrides: Pick<AgentMessageInput, "role" | "content"> & Partial<AgentMessageInput>
): AgentMessageInput {
  return {
    source: opts.source ?? "api",
    messageType: opts.messageType ?? "text",
    telegramChatId: opts.telegramChatId,
    telegramMessageId: opts.telegramMessageId,
    transcriptText: opts.transcriptText,
    rawText: opts.rawText,
    ...overrides,
  };
}

function buildSystemPrompt(
  personal: string,
  context: string,
  replyStyle: ReplyStyle,
  options: {
    actionContext?: string;
    isVoice?: boolean;
    recallExcerpt?: string | null;
    willOfferSave?: boolean;
    willAutoSave?: boolean;
  } = {}
): string {
  let mode = replyStyle === "short" ? `\n\n${telegramVoiceAddon()}` : "";
  if (options.isVoice) {
    mode += `\n\n${voiceMessageAddon()}`;
  }

  const actionBlock = options.actionContext ? actionReplyAddon(options.actionContext) : "";
  if (options.willAutoSave) {
    mode += `\n\nAfter your reply, the conversation will be AUTO-SAVED to Obsidian (Projects + Building). You may briefly confirm what was captured — do NOT ask the user to say yes/no.`;
  } else if (options.willOfferSave) {
    mode += `\n\n${pendingSaveAddon().trim()}`;
  }
  const recallBlock = recallAddon(options.recallExcerpt ?? null);

  return `${AGENT_VOICE}${mode}${recallBlock}

${personal}

Current state:
${context}${actionBlock}`;
}

function toChatMessages(
  history: { role: string; content: string }[],
  currentMessage: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  for (const turn of history) {
    if (turn.role === "user" || turn.role === "assistant") {
      msgs.push({ role: turn.role, content: turn.content });
    }
  }
  msgs.push({ role: "user", content: currentMessage });
  return msgs;
}

function usesPlanningModel(
  classification: ClassificationResult["classification"],
  hasActionContext: boolean
): boolean {
  if (hasActionContext) return true;
  return (
    classification === "question" ||
    classification === "general" ||
    classification === "greeting" ||
    classification === "project_update" ||
    classification === "decision" ||
    classification === "general_memory"
  );
}

function historyLimit(source: MessageSource, messageType?: MessageType): number {
  const base = config.chat.historyLimit;
  if (source === "telegram" && messageType === "voice") {
    return Math.max(base, 28);
  }
  if (source === "telegram") {
    return Math.max(base, 24);
  }
  return base;
}

function stubClassification(kind: string): ClassificationResult {
  return {
    classification: kind as ClassificationResult["classification"],
    project_name: null,
    life_domain: null,
    confidence: 1,
    extracted: {},
    needs_clarification: false,
    clarification_question: null,
  };
}

export async function processChat(
  message: string,
  options: ProcessChatOptions = {}
): Promise<ChatResult> {
  const source = options.source ?? "api";
  const messageType = options.messageType ?? "text";
  const replyStyle = options.replyStyle ?? (source === "telegram" ? "short" : "normal");
  const updateSource = source === "telegram" ? "telegram" : "chat";

  if (!options.skipUserSave) {
    saveAgentMessage(
      messageInput(options, {
        role: "user",
        content: message,
        rawText: options.rawText ?? message,
        transcriptText: options.transcriptText,
      })
    );
  }

  // Pending Obsidian save confirmation (yes / no / edit)
  const pendingReply = await tryHandleObsidianPending(message);
  if (pendingReply !== null) {
    saveAgentMessage(
      messageInput(options, {
        role: "assistant",
        content: pendingReply,
        classification: "general",
      })
    );
    return {
      reply: pendingReply,
      classification: stubClassification("general"),
      actions: ["obsidian_save_handled"],
    };
  }

  // Vault-specific fast paths (search, save:, ask)
  const vaultFast = await tryVaultFastPath(message);
  if (vaultFast?.handled) {
    saveAgentMessage(
      messageInput(options, {
        role: "assistant",
        content: vaultFast.reply,
        classification: "general",
      })
    );
    return {
      reply: vaultFast.reply,
      classification: stubClassification("general"),
      actions: ["vault_fast_path"],
    };
  }

  const historyBefore = getRecentConversation(config.chat.classifierHistoryLimit, {
    excludeLatest: true,
  });
  if (options.replyToText?.trim()) {
    historyBefore.push({ role: "user", content: options.replyToText.trim() });
  }

  const today = new Date().toISOString().slice(0, 10);
  const classification = await classifyMessage(message, today, historyBefore);
  const handled = await handleClassification(message, classification, {
    replyStyle,
    updateSource,
    recentTurns: historyBefore,
  });

  let reply = handled.reply;
  let vaultExcerpt: string | null = null;
  let recallExcerpt: string | null = null;

  try {
    recallExcerpt = await autoRecallContext(message, classification.classification);
  } catch (err) {
    console.warn("[recall] autoRecall failed:", err);
  }

  if (classification.classification === "question" && config.openai.apiKey) {
    try {
      vaultExcerpt = await askBrain(message);
    } catch (err) {
      console.warn("[obsidian] askBrain failed:", err);
    }
  }

  const conversationForSave = getRecentConversation(historyLimit(source, messageType), {
    excludeLatest: true,
  });

  const threadProject = normalizeProjectName(
    extractProjectNameFromThread(message, conversationForSave) ??
      inferActiveProjectFromMessage(message) ??
      classification.project_name
  );

  const shouldAutoSave = shouldAutoSaveToObsidian(
    classification.classification,
    message,
    conversationForSave,
    handled.actions
  );

  const shouldConfirmSave =
    !shouldAutoSave &&
    (shouldConfirmObsidianSave(handled.actions) ||
      shouldOfferObsidianSave(
        classification.classification,
        message,
        conversationForSave,
        handled.actions
      ));

  if (!reply) {
    const context = await buildContext({
      source,
      vaultExcerpt,
      recallExcerpt,
    });
    const personal = formatPersonalContextForPrompt();
    const systemPrompt = buildSystemPrompt(personal, context, replyStyle, {
      actionContext: handled.actionContext,
      isVoice: messageType === "voice",
      recallExcerpt,
      willAutoSave: shouldAutoSave,
      willOfferSave: shouldConfirmSave,
    });

    reply = await chatCompletion(
      [{ role: "system", content: systemPrompt }, ...toChatMessages(conversationForSave, message)],
      {
        tier: usesPlanningModel(classification.classification, Boolean(handled.actionContext))
          ? "planning"
          : "default",
        temperature: messageType === "voice" ? 0.4 : 0.5,
      }
    );
  }

  if ((shouldAutoSave || shouldConfirmSave) && reply && !shouldAutoSave) {
    reply = stripFalseSaveClaims(reply);
  }

  const saveParams = {
    userMessage: message,
    conversationTurns: conversationForSave,
    actionContext:
      handled.actionContext ??
      buildThreadActionContext(message, conversationForSave, threadProject),
    activeProject: threadProject,
    projectName: threadProject,
    saveIntent: (handled.actions.includes("saved_project_update") ||
    handled.actions.includes("evolving_project")
      ? "project_log"
      : "capture") as "capture" | "project_log",
  };

  if (shouldAutoSave) {
    const saved = await autoSaveToObsidian(saveParams);
    if (saved) {
      reply = stripSaveFooters(stripFalseSaveClaims(reply ?? ""));
      reply = reply ? `${reply}\n\n${saved.message}` : saved.message;
      handled.actions.push("auto_saved_obsidian");
    } else {
      reply = reply
        ? `${reply}\n\n(Couldn't auto-save to Obsidian — try: save: your notes here)`
        : "Couldn't auto-save to Obsidian.";
    }
  } else if (shouldConfirmSave) {
    const offer = await offerObsidianSave(saveParams);
    if (offer) {
      reply = reply ? `${reply}\n\n${offer.offerLine}` : offer.offerLine;
    }
  }

  if (handled.actions.includes("saved_profile_memory")) {
    try {
      const paths = await syncProfileToObsidian();
      const personalPaths = paths.filter((p) => p.includes("02-Areas/Personal"));
      const note =
        personalPaths.length > 0
          ? `📝 Saved to your profile in Obsidian:\n${personalPaths.map((p) => `- ${p}`).join("\n")}`
          : "📝 Saved to your agent profile (Obsidian Personal folder).";
      reply = reply ? `${reply}\n\n${note}` : note;
    } catch (err) {
      console.warn("[profile-obsidian] chat sync failed:", err);
    }
  }

  saveAgentMessage(
    messageInput(options, {
      role: "assistant",
      content: reply,
      classification: classification.classification,
      metadata: { actions: handled.actions },
    })
  );

  return { reply, classification, actions: handled.actions };
}

export async function processCapture(
  text: string,
  options: ProcessChatOptions = {}
): Promise<ChatResult> {
  return processChat(text, { ...options, source: options.source ?? "api" });
}
