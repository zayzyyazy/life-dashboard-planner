import TelegramBot, { type Message } from "node-telegram-bot-api";
import { config } from "../config.js";
import { getLastTelegramMessageAt } from "../services/memory.js";
import {
  handleBriefCommand,
  handleProfileCommand,
  handleKnowledgeCommand,
  handleProjectsCommand,
  handleRemindersCommand,
  handleTasksCommand,
  handleTextMessage,
  handleVoiceTranscript,
  handleGitHubCommand,
  handleWatchRepoCommand,
  handleVaultCommand,
  handleSearchCommand,
  handleAskCommand,
  HELP_MESSAGE,
  isAuthorized,
  logBlockedUser,
  logUnknownUser,
  START_MESSAGE,
} from "./handlers.js";
import {
  cleanupVoiceFile,
  downloadVoiceFile,
  shortTranscriptPreview,
  transcribeVoiceFile,
} from "./voice.js";
import { registerTelegramNotifierSplit } from "./notify.js";
import { splitMessage } from "./split-message.js";

let bot: TelegramBot | null = null;
let lastPollingError = "";
let pollingErrorCount = 0;

export interface TelegramStatus {
  enabled: boolean;
  token_configured: boolean;
  token_valid: boolean | null;
  bot_username: string | null;
  allowed_users_configured: boolean;
  voice_enabled: boolean;
  text_enabled: boolean;
  commands_enabled: boolean;
  last_message_at: string | null;
  last_error: string | null;
}

let cachedBotUsername: string | null = null;
let tokenValid: boolean | null = null;
let lastError: string | null = null;

export function getTelegramStatus(): TelegramStatus {
  const tokenConfigured = Boolean(config.telegram.botToken);
  const allowedConfigured = config.telegram.allowedUserIds.length > 0;
  return {
    enabled: Boolean(bot) && tokenValid === true && allowedConfigured,
    token_configured: tokenConfigured,
    token_valid: tokenValid,
    bot_username: cachedBotUsername,
    allowed_users_configured: allowedConfigured,
    voice_enabled: config.telegram.enableVoice,
    text_enabled: config.telegram.enableText,
    commands_enabled: config.telegram.enableCommands,
    last_message_at: getLastTelegramMessageAt(),
    last_error: lastError,
  };
}

function isValidTokenFormat(token: string): boolean {
  return /^\d+:[A-Za-z0-9_-]+$/.test(token);
}

export async function validateBotToken(token: string): Promise<{
  ok: boolean;
  username?: string;
  error?: string;
}> {
  if (!isValidTokenFormat(token)) {
    return {
      ok: false,
      error: "Token format invalid. Should look like: 123456789:ABCdefGHI... (no spaces or quotes)",
    };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: { username: string };
    };
    if (!data.ok) {
      return { ok: false, error: data.description ?? "Invalid token" };
    }
    return { ok: true, username: data.result?.username };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

function parsePollingError(err: unknown): { code: string; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const body = (err as { response?: { body?: { error_code?: number; description?: string } } })
    ?.response?.body;
  const code = body?.error_code ? String(body.error_code) : "";
  const desc = body?.description ?? raw;
  return { code, message: desc };
}

export async function startTelegramBot(): Promise<TelegramBot | null> {
  if (!config.telegram.botToken) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN not set — Telegram disabled");
    return null;
  }

  const validation = await validateBotToken(config.telegram.botToken);
  tokenValid = validation.ok;
  if (!validation.ok) {
    lastError = validation.error ?? "Invalid token";
    console.error(`[telegram] ❌ ${lastError}`);
    console.error("[telegram] Fix: open @BotFather → /mybots → your bot → API Token → copy fresh token to .env");
    return null;
  }

  cachedBotUsername = validation.username ?? null;
  console.log(`[telegram] ✓ Token valid — bot @${cachedBotUsername}`);

  if (config.telegram.allowedUserIds.length === 0) {
    console.warn(
      "[telegram] TELEGRAM_ALLOWED_USER_IDS not set — messages will be rejected until you add your ID"
    );
  }

  bot = new TelegramBot(config.telegram.botToken, { polling: true });
  console.log("[telegram] Bot started (polling)");

  // Register command menu so Telegram's "/" popup shows current commands
  bot
    .setMyCommands([
      { command: "vault", description: "Obsidian vault stats" },
      { command: "search", description: "Search your notes" },
      { command: "ask", description: "Ask over your notes" },
      { command: "brief", description: "Today's brief" },
      { command: "tasks", description: "Open tasks" },
      { command: "reminders", description: "Upcoming reminders" },
      { command: "projects", description: "Saved projects" },
      { command: "github", description: "Live GitHub activity" },
      { command: "profile", description: "What I know about you" },
      { command: "knowledge", description: "Loaded data summary" },
      { command: "help", description: "Examples and commands" },
    ])
    .then(() => console.log("[telegram] Command menu registered"))
    .catch((err: unknown) =>
      console.warn("[telegram] setMyCommands failed:", err instanceof Error ? err.message : err)
    );

  registerTelegramNotifierSplit(async (chatId, text) => {
    await bot!.sendMessage(chatId, text);
  });

  bot.on("message", async (msg) => {
    try {
      await onMessage(msg);
    } catch (err) {
      console.error("[telegram] Message handler error:", err instanceof Error ? err.message : err);
      if (msg.chat?.id) {
        await safeReply(msg.chat.id, "Something went wrong. Please try again.");
      }
    }
  });

  bot.on("polling_error", (err) => {
    const { code, message } = parsePollingError(err);
    pollingErrorCount++;

    // Log once per error type, then every 30th repeat
    if (message !== lastPollingError || pollingErrorCount % 30 === 1) {
      lastPollingError = message;
      lastError = message;

      if (code === "409" || message.includes("Conflict")) {
        console.error("[telegram] ❌ 409 Conflict — TWO processes using this bot token.");
        console.error("[telegram]    Fix: lsof -ti :3847 | xargs kill -9");
        console.error("[telegram]    Then run ONLY ONE: bash scripts/restart-mac.sh");
        bot?.stopPolling();
      } else if (code === "401" || message.includes("Unauthorized")) {
        console.error("[telegram] ❌ Invalid token. Get new token from @BotFather → paste in .env → restart");
        bot?.stopPolling();
      } else {
        console.error(`[telegram] Polling error (${code || "?"}): ${message}`);
      }
    }
  });

  return bot;
}

async function onMessage(msg: Message) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!userId) return;

  const username = msg.from?.username;

  if (!isAuthorized(userId)) {
    logBlockedUser(chatId, userId, username);
    if (config.telegram.allowedUserIds.length === 0) {
      logUnknownUser(chatId, userId, username);
      await safeReply(
        chatId,
        `Not authorized. Your Telegram user ID is ${userId}. Add it to TELEGRAM_ALLOWED_USER_IDS in .env and restart.`
      );
    } else {
      await safeReply(chatId, "Not authorized.");
    }
    return;
  }

  if (msg.text?.startsWith("/") && config.telegram.enableCommands) {
    await handleCommand(msg);
    return;
  }

  if (msg.voice && config.telegram.enableVoice) {
    await handleVoice(msg);
    return;
  }

  if (msg.text && config.telegram.enableText) {
    const replyTo = msg.reply_to_message?.text ?? undefined;
    const reply = await handleTextMessage(msg.text, chatId, msg.message_id, replyTo);
    await safeReply(chatId, reply);
    return;
  }
}

async function handleCommand(msg: Message) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim() ?? "";
  const [command, ...rest] = text.split(/\s+/);
  const args = rest.join(" ").trim();

  let reply: string;
  switch (command.toLowerCase()) {
    case "/start":
      reply = START_MESSAGE;
      break;
    case "/help":
      reply = HELP_MESSAGE;
      break;
    case "/brief":
      reply = await handleBriefCommand();
      break;
    case "/projects":
      reply = handleProjectsCommand();
      break;
    case "/profile":
      reply = handleProfileCommand();
      break;
    case "/knowledge":
      reply = handleKnowledgeCommand();
      break;
    case "/tasks":
      reply = handleTasksCommand();
      break;
    case "/reminders":
      reply = handleRemindersCommand();
      break;
    case "/watchrepo":
      reply = await handleWatchRepoCommand(args);
      break;
    case "/github":
      reply = await handleGitHubCommand();
      break;
    case "/vault":
      reply = await handleVaultCommand();
      break;
    case "/search":
      reply = await handleSearchCommand(args);
      break;
    case "/ask":
      reply = await handleAskCommand(args);
      break;
    default:
      reply = "Unknown command. Try /help";
  }

  await safeReply(chatId, reply);
}

async function handleVoice(msg: Message) {
  const chatId = msg.chat.id;
  const voice = msg.voice;
  if (!voice || !bot) return;

  let filePath: string | null = null;
  try {
    filePath = await downloadVoiceFile((id) => bot!.getFile(id), voice.file_id);
    const transcript = await transcribeVoiceFile(filePath);
    if (!transcript.trim()) {
      await safeReply(
        chatId,
        "I received the voice note but couldn't transcribe it. Please resend as text."
      );
      return;
    }
    const preview = shortTranscriptPreview(transcript);
    const reply = await handleVoiceTranscript(
      transcript,
      chatId,
      msg.message_id,
      preview
    );
    await safeReply(chatId, reply);
  } catch (err) {
    console.error("[telegram] Voice processing failed:", err instanceof Error ? err.message : err);
    await safeReply(
      chatId,
      "I received the voice note but couldn't transcribe it. Please resend as text."
    );
  } finally {
    if (filePath) cleanupVoiceFile(filePath);
  }
}

async function safeReply(chatId: number, text: string) {
  if (!bot) return;
  const chunks = splitMessage(text, config.telegram.messageChunkSize);
  for (const chunk of chunks) {
    await bot.sendMessage(chatId, chunk);
  }
}

export function stopTelegramBot() {
  if (bot) {
    bot.stopPolling();
    bot = null;
  }
}
