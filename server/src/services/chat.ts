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
  const core = `You are a personal life/project planner for ONE specific user. You have memory of prior messages in this thread plus structured data below.

Behaviors:
- Use recent conversation to resolve "that", "it", "the Marie thing", follow-ups
- Keep personal work and university separate
- Be specific — cite actual tasks, projects, and updates from Current state
- When they report finishing work, acknowledge and suggest marking tasks done if relevant
- If they are over-researching or circling, gently nudge one concrete next action (execution over endless learning)
- Match their style: systems thinking, practical, honest — not motivational fluff
- Do not claim to run shell commands or delete files`;

  if (replyStyle === "short") {
    return `${core}

Telegram mode: 1-3 sentences max. Direct and useful.

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

    const isPlanning =
      classification.classification === "question" ||
      classification.classification === "general";

    reply = await chatCompletion(
      [{ role: "system", content: systemPrompt }, ...toChatMessages(conversationHistory, message)],
      { tier: isPlanning ? "planning" : "default" }
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
