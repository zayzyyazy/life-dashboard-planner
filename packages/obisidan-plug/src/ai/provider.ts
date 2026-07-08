import fs from "node:fs/promises";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  json?: boolean;
  temperature?: number;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<string> {
  if (config.aiProvider === "anthropic" && config.anthropicApiKey) {
    return anthropicCompletion(messages, options);
  }
  return openaiCompletion(messages, options);
}

async function openaiCompletion(
  messages: ChatMessage[],
  options: CompletionOptions
): Promise<string> {
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const res = await client.chat.completions.create({
    model: config.openaiModel,
    messages,
    temperature: options.temperature ?? 0.4,
    ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
  });
  return res.choices[0]?.message?.content ?? "";
}

async function anthropicCompletion(
  messages: ChatMessage[],
  options: CompletionOptions
): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const res = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 4096,
    system: options.json ? `${system}\n\nRespond with valid JSON only.` : system,
    messages: chatMessages,
    temperature: options.temperature ?? 0.4,
  });

  const block = res.content[0];
  return block.type === "text" ? block.text : "";
}

export async function auditLog(action: string, detail: string): Promise<void> {
  const line = `${new Date().toISOString()}\t${action}\t${detail}\n`;
  const { getAuditLogPath } = await import("../config.js");
  await fs.appendFile(getAuditLogPath(), line, "utf8").catch(() => {});
}
