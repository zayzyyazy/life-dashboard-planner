import { classifyMessage, type ClassificationResult } from "../agent/classifier.js";
import { chatCompletion } from "./openai.js";
import {
  buildContext,
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

export async function processChat(
  message: string,
  options: ProcessChatOptions = {}
): Promise<ChatResult> {
  const source = options.source ?? "api";
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

  const today = new Date().toISOString().slice(0, 10);
  const classification = await classifyMessage(message, today);
  const handled = await handleClassification(message, classification, {
    replyStyle,
    updateSource,
  });

  let reply = handled.reply;
  if (!reply) {
    const context = await buildContext();
    const personal = formatPersonalContextForPrompt();
    const systemPrompt =
      replyStyle === "short"
        ? `You are a personal life/project planner assistant on Telegram for ONE specific user. Be very concise (1-3 sentences).

${personal}

Current state:
${context}

Do not claim to run shell commands or delete files. Keep personal work and university separate.`
        : `You are a personal life/project planner assistant for ONE specific user. Be concise and practical.

${personal}

Current state:
${context}

You help track projects, tasks, reminders, and daily planning.
Keep personal work and university separate. Do not claim to run shell commands or delete files. Ask before destructive actions.`;

    reply = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      { tier: classification.classification === "question" ? "planning" : "default" }
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
