import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function resolveEnvPath(): string | null {
  const candidates = [
    process.env.LIFE_PLANNER_ENV_FILE,
    path.join(projectRoot, ".env"),
    path.join(process.cwd(), ".env"),
    path.join(projectRoot, "server", ".env"),
    path.join(process.cwd(), "server", ".env"),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}

export const envFilePath = resolveEnvPath();

if (envFilePath) {
  const result = dotenv.config({ path: envFilePath });
  if (result.error) {
    console.error(`[config] Failed to load .env from ${envFilePath}:`, result.error.message);
  }
} else {
  console.warn(
    `[config] No .env file found. Checked project root (${projectRoot}) and cwd (${process.cwd()}).`
  );
  dotenv.config();
}

function cleanEnv(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

export const config = {
  projectRoot,
  envFilePath,
  port: Number(process.env.PORT ?? 3847),
  dataDir: process.env.DATA_DIR ?? path.join(projectRoot, "data"),
  openai: {
    apiKey: cleanEnv(process.env.OPENAI_API_KEY),
    defaultModel: process.env.OPENAI_DEFAULT_MODEL ?? "gpt-4o-mini",
    planningModel: process.env.OPENAI_PLANNING_MODEL ?? "gpt-4o",
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1",
  },
  email: {
    provider: (process.env.EMAIL_PROVIDER ?? "smtp") as "smtp" | "resend",
    from: process.env.EMAIL_FROM ?? "",
    to: process.env.EMAIL_TO ?? "",
    smtp: {
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
    resendApiKey: process.env.RESEND_API_KEY ?? "",
  },
  github: {
    token: process.env.GITHUB_TOKEN ?? "",
  },
  brief: {
    cron: process.env.DAILY_BRIEF_CRON ?? "0 7 * * *",
    timezone: process.env.TZ ?? "America/New_York",
  },
  security: {
    allowShell: process.env.ALLOW_SHELL === "true",
  },
  telegram: {
    botToken: cleanEnv(process.env.TELEGRAM_BOT_TOKEN),
    allowedUserIds: cleanEnv(process.env.TELEGRAM_ALLOWED_USER_IDS)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    enableVoice: process.env.TELEGRAM_ENABLE_VOICE !== "false",
    enableText: process.env.TELEGRAM_ENABLE_TEXT !== "false",
    enableCommands: process.env.TELEGRAM_ENABLE_COMMANDS !== "false",
  },
};

export function getEnvStatus() {
  return {
    env_file: envFilePath,
    env_file_found: Boolean(envFilePath),
    openai_api_key_configured: Boolean(config.openai.apiKey),
    telegram_bot_token_configured: Boolean(config.telegram.botToken),
    telegram_allowed_users_configured: config.telegram.allowedUserIds.length > 0,
    cwd: process.cwd(),
    project_root: projectRoot,
  };
}
