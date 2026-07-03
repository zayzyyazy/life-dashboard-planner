import type OpenAI from "openai";
import { classifyMessage, type ClassificationResult } from "../agent/classifier.js";
import { AGENT_VOICE, actionReplyAddon, telegramVoiceAddon } from "../agent/voice.js";
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
  actionContext?: string
): string {
  const mode = replyStyle === "short" ? `\n\n${telegramVoiceAddon()}` : "";

  const actionBlock = actionContext ? actionReplyAddon(actionContext) : "";

  return `${AGENT_VOICE}${mode}

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
    classification === "decision"
  );
}

const TELEGRAM_MAX_REPLY = 1200;

export async function processChat(
  message: string,
  options: ProcessChatOptions = {}
): Promise<ChatResult> {
  const source = options.source ?? "api";
  const replyStyle = options.replyStyle ?? (source === "telegram" ? "short" : "normal");
  const updateSource = source === "telegram" ? "telegram" : "chat";

  const historyBefore = getRecentConversation(config.chat.classifierHistoryLimit, {
    excludeLatest: false,
  });
  if (options.replyToText?.trim()) {
    historyBefore.push({ role: "user", content: options.replyToText.trim() });
  }

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

  const today = new Date().toISOString().slice(0, 10);
  const classification = await classifyMessage(message, today, historyBefore);
  const handled = await handleClassification(message, classification, {
    replyStyle,
    updateSource,
  });

  let reply = handled.reply;
  if (!reply) {
    const context = await buildContext();
    const personal = formatPersonalContextForPrompt();
    const systemPrompt = buildSystemPrompt(
      personal,
      context,
      replyStyle,
      handled.actionContext
    );

    const conversationHistory = getRecentConversation(config.chat.historyLimit, {
      excludeLatest: true,
    });

    reply = await chatCompletion(
      [{ role: "system", content: systemPrompt }, ...toChatMessages(conversationHistory, message)],
      {
        tier: usesPlanningModel(classification.classification, Boolean(handled.actionContext))
          ? "planning"
          : "default",
      }
    );

    const maxLen = replyStyle === "short" ? TELEGRAM_MAX_REPLY : 4000;
    if (reply.length > maxLen) {
      reply = reply.slice(0, maxLen - 1) + "…";
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
