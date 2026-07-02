import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, getEnvStatus } from "./config.js";
import { getDb } from "./db/index.js";
import { router as apiRouter } from "./routes/api.js";
import { briefRouter } from "./routes/brief.js";
import { emailRouter } from "./routes/email.js";
import { telegramRouter } from "./routes/telegram.js";
import { profileRouter } from "./routes/profile.js";
import { startScheduler } from "./services/scheduler.js";
import { startTelegramBot } from "./telegram/bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize database
getDb();

// API routes (root paths per spec)
app.use("/", apiRouter);
app.use("/brief", briefRouter);
app.use("/email", emailRouter);
app.use("/telegram", telegramRouter);
app.use("/", profileRouter);

// Serve dashboard in production
const dashboardDist = path.join(rootDir, "dist");
app.use(express.static(dashboardDist));
app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/chat") ||
    req.path.startsWith("/capture") ||
    req.path.startsWith("/projects") ||
    req.path.startsWith("/tasks") ||
    req.path.startsWith("/reminders") ||
    req.path.startsWith("/watch") ||
    req.path.startsWith("/updates") ||
    req.path.startsWith("/messages") ||
    req.path.startsWith("/health") ||
    req.path.startsWith("/brief") ||
    req.path.startsWith("/email") ||
    req.path.startsWith("/telegram") ||
    req.path.startsWith("/profile") ||
    req.path.startsWith("/knowledge")
  ) {
    next();
    return;
  }
  res.sendFile(path.join(dashboardDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(config.port, () => {
  const envStatus = getEnvStatus();
  console.log(`Life Planner Agent running at http://localhost:${config.port}`);
  console.log(`Health: http://localhost:${config.port}/health`);
  if (envStatus.env_file) {
    console.log(`[config] Loaded .env from ${envStatus.env_file}`);
  } else {
    console.warn("[config] No .env file found — create one at project root (copy .env.example)");
  }
  console.log(
    `[config] OPENAI_API_KEY: ${envStatus.openai_api_key_configured ? "configured" : "MISSING"}`
  );
  console.log(
    `[config] TELEGRAM_BOT_TOKEN: ${envStatus.telegram_bot_token_configured ? "configured" : "not set"}`
  );
  console.log(
    `[config] TELEGRAM_ALLOWED_USER_IDS: ${envStatus.telegram_allowed_users_configured ? "configured" : "not set"}`
  );
  if (!config.openai.apiKey) {
    console.warn("WARNING: OPENAI_API_KEY not set — chat will fail until configured");
  }
  startScheduler();
  startTelegramBot();
});
