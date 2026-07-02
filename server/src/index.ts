import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { getDb } from "./db/index.js";
import { router as apiRouter } from "./routes/api.js";
import { briefRouter } from "./routes/brief.js";
import { emailRouter } from "./routes/email.js";
import { telegramRouter } from "./routes/telegram.js";
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
    req.path.startsWith("/telegram")
  ) {
    next();
    return;
  }
  res.sendFile(path.join(dashboardDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(config.port, () => {
  console.log(`Life Planner Agent running at http://localhost:${config.port}`);
  console.log(`Health: http://localhost:${config.port}/health`);
  if (!config.openai.apiKey) {
    console.warn("WARNING: OPENAI_API_KEY not set — chat will fail until configured");
  }
  startScheduler();
  startTelegramBot();
});
