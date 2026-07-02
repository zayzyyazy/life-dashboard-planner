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
import { runBootTasks } from "./setup.js";
import { startTelegramBot } from "./telegram/bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

const API_PREFIXES = [
  "/chat",
  "/capture",
  "/projects",
  "/tasks",
  "/reminders",
  "/watch",
  "/updates",
  "/messages",
  "/health",
  "/brief",
  "/email",
  "/telegram",
  "/profile",
  "/knowledge",
  "/github",
];

function isApiPath(pathname: string): boolean {
  return API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const app = express();
app.use(cors());
app.use(express.json());

// Initialize database
getDb();

// Health first — always responds even if other routes fail
app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), env: getEnvStatus() });
});

// API routes
app.use("/", apiRouter);
app.use("/brief", briefRouter);
app.use("/email", emailRouter);
app.use("/telegram", telegramRouter);
app.use("/", profileRouter);

// Dashboard (production build only)
const dashboardDist = path.join(rootDir, "dist");
app.use(express.static(dashboardDist));
app.get("*", (req, res) => {
  if (isApiPath(req.path)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(path.join(dashboardDist, "index.html"), (err) => {
    if (err) res.status(404).send("Dashboard not built. Run: npm run dev");
  });
});

process.on("uncaughtException", (err) => {
  console.error("[fatal]", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[fatal]", err);
});

const host = process.env.HOST ?? "127.0.0.1";
app.listen(config.port, host, () => {
  const envStatus = getEnvStatus();
  console.log(`Life Planner Agent running at http://${host}:${config.port}`);
  console.log(`Health: http://${host}:${config.port}/health`);
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
  runBootTasks().catch(console.error);
});
