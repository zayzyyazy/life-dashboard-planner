import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

const brainEnv = path.join(process.env.HOME ?? "", ".brain", ".env");
dotenv.config({ path: brainEnv });
dotenv.config();

export const MAIN_CATEGORIES = [
  "Uni",
  "Job",
  "Personal",
  "Research",
  "Building",
  "Learning",
] as const;

export type MainCategory = (typeof MAIN_CATEGORIES)[number];

export const config = {
  vaultPath:
    process.env.VAULT_PATH ??
    path.join(process.env.HOME ?? "", "Documents", "Brain-Vault"),
  brainDataDir:
    process.env.BRAIN_DATA_DIR ??
    path.join(process.env.HOME ?? "", ".brain"),
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  aiProvider: (process.env.AI_PROVIDER ?? "openai") as "openai" | "anthropic",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
  excludePaths: (process.env.EXCLUDE_PATHS ?? "05-Archive/Private")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean),
  maxNoteCharsForLlm: Number(process.env.MAX_NOTE_CHARS_FOR_LLM ?? 2000),
  searchLimit: Number(process.env.SEARCH_LIMIT ?? 15),
  jaccardDuplicateThreshold: Number(process.env.JACCARD_DUPLICATE_THRESHOLD ?? 0.35),
};

export function getIndexDbPath(): string {
  return path.join(config.brainDataDir, "index.db");
}

export function getPreviewsDir(): string {
  return path.join(config.brainDataDir, "previews");
}

export function getAuditLogPath(): string {
  return path.join(config.brainDataDir, "audit.log");
}

export async function ensureBrainDirs(): Promise<void> {
  await fs.mkdir(config.brainDataDir, { recursive: true });
  await fs.mkdir(getPreviewsDir(), { recursive: true });
}

export function isExcluded(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  return config.excludePaths.some((ex) => {
    if (ex.endsWith("/**")) {
      return normalized.startsWith(ex.slice(0, -3));
    }
    return normalized.startsWith(ex) || normalized.includes(`/${ex}/`);
  });
}

export function assertVaultPath(): void {
  if (!config.vaultPath) {
    throw new Error("VAULT_PATH is not configured");
  }
}

export function assertAiKey(): void {
  if (config.aiProvider === "anthropic") {
    if (!config.anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
  } else if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
}
