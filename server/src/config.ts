import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(rootDir, ".env") });

export const config = {
  port: Number(process.env.PORT ?? 3847),
  dataDir: process.env.DATA_DIR ?? path.join(rootDir, "data"),
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
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
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    allowedUserIds: (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    enableVoice: process.env.TELEGRAM_ENABLE_VOICE !== "false",
    enableText: process.env.TELEGRAM_ENABLE_TEXT !== "false",
    enableCommands: process.env.TELEGRAM_ENABLE_COMMANDS !== "false",
  },
};
