import fs from "node:fs";
import OpenAI from "openai";
import { config } from "../config.js";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!client) {
    if (!config.openai.apiKey) {
      throw new Error("OPENAI_API_KEY is not set. Add it to your .env file.");
    }
    client = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return client;
}

export type ModelTier = "default" | "planning";

export function getModel(tier: ModelTier = "default"): string {
  return tier === "planning" ? config.openai.planningModel : config.openai.defaultModel;
}

export async function chatCompletion(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: { tier?: ModelTier; temperature?: number; json?: boolean } = {}
): Promise<string> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: getModel(options.tier ?? "default"),
    messages,
    temperature: options.temperature ?? 0.3,
    response_format: options.json ? { type: "json_object" } : undefined,
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

export async function transcribeAudio(filePath: string): Promise<string> {
  // Prefer Groq (free whisper-large-v3-turbo) when configured
  if (config.groq.apiKey) {
    const groq = new OpenAI({
      apiKey: config.groq.apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    const response = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: config.groq.transcriptionModel,
    });
    return response.text.trim();
  }

  const openai = getOpenAI();
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: config.openai.transcriptionModel,
  });
  return response.text.trim();
}
