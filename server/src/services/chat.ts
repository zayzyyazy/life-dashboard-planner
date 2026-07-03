import type OpenAI from "openai";
import { classifyMessage, type ClassificationResult } from "../agent/classifier.js";
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
  replyStyle: ReplyStyle
): string {
  const core = `You are a personal life/project planner for ONE specific user — sharp, warm, and actually paying attention. You have memory of prior messages in this thread plus structured data below.

Conversation style:
- Text like a real person who knows their projects, not a command menu or FAQ bot
- Mirror their energy — casual if they're casual, direct if they're direct
- Use their name when you know it
- After they share an update or you save something, ask ONE natural follow-up when it helps (goal, blocker, priority, timeline)
- Reference today's tasks, reminders, and recent updates when relevant — be specific
- Never reply with "Try: remind me…" command lists or feature menus unless they explicitly ask what you can do
- Keep personal work and university separate
- When they report finishing work, acknowledge it and tie it to momentum
- If they're over-researching or circling, gently nudge one concrete next action
- Match their style: systems thinking, practical, honest — not motivational fluff
- Do not claim to run shell commands or delete files`;

  if (replyStyle === "short") {
    return `${core}

Telegram mode: 2-4 short sentences. Natural texting voice. One follow-up question is encouraged when it moves things forward. No bullet lists of example commands.

${personal}

Current state:
${context}`;
  }

  return `${core}

${personal}

Current state:
${context}

You help track projects, tasks, reminders, and daily planning. Ask before destructive actions.`;
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

function usesConversationalModel(classification: ClassificationResult["classification"]): boolean {
  return (
    classification === "question" ||
    classification === "general" ||
    classification === "greeting"
  );
}

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
    const systemPrompt = buildSystemPrompt(personal, context, replyStyle);

    const conversationHistory = getRecentConversation(config.chat.historyLimit, {
      excludeLatest: true,
    });

    reply = await chatCompletion(
      [{ role: "system", content: systemPrompt }, ...toChatMessages(conversationHistory, message)],
      { tier: usesConversationalModel(classification.classification) ? "planning" : "default" }
    );

    if (replyStyle === "short" && reply.length > 500) {
      reply = reply.slice(0, 497) + "…";
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
