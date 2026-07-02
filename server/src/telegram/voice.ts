import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { transcribeAudio } from "../services/openai.js";

export async function downloadVoiceFile(
  getFile: (fileId: string) => Promise<{ file_path?: string }>,
  fileId: string
): Promise<string> {
  const file = await getFile(fileId);
  if (!file.file_path) {
    throw new Error("Telegram did not return a file path");
  }

  const tmpDir = path.join(config.dataDir, "telegram-tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const dest = path.join(tmpDir, `${fileId}.ogg`);

  const url = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download voice file: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  return dest;
}

export async function transcribeVoiceFile(filePath: string): Promise<string> {
  return transcribeAudio(filePath);
}

export function cleanupVoiceFile(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup errors
  }
}

export function shortTranscriptPreview(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1) + "…";
}
