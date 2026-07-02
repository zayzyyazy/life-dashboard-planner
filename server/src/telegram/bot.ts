import TelegramBot, { type Message } from "node-telegram-bot-api";
import { config } from "../config.js";
import { getLastTelegramMessageAt } from "../services/memory.js";
import {
  handleBriefCommand,
  handleProfileCommand,
  handleProjectsCommand,
  handleRemindersCommand,
  handleTasksCommand,
  handleTextMessage,
  handleVoiceTranscript,
  handleWatchRepoCommand,
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
import { registerTelegramNotifier } from "./notify.js";

let bot: TelegramBot | null = null;

export interface TelegramStatus {
  enabled: boolean;
  token_configured: boolean;
  allowed_users_configured: boolean;
  voice_enabled: boolean;
  text_enabled: boolean;
  commands_enabled: boolean;
  last_message_at: string | null;
}

export function getTelegramStatus(): TelegramStatus {
  const tokenConfigured = Boolean(config.telegram.botToken);
  const allowedConfigured = config.telegram.allowedUserIds.length > 0;
  return {
    enabled: Boolean(bot) && tokenConfigured && allowedConfigured,
    token_configured: tokenConfigured,
    allowed_users_configured: allowedConfigured,
    voice_enabled: config.telegram.enableVoice,
    text_enabled: config.telegram.enableText,
    commands_enabled: config.telegram.enableCommands,
    last_message_at: getLastTelegramMessageAt(),
  };
}

export function startTelegramBot(): TelegramBot | null {
  if (!config.telegram.botToken) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN not set — Telegram disabled");
    return null;
  }

  if (config.telegram.allowedUserIds.length === 0) {
    console.warn(
      "[telegram] TELEGRAM_ALLOWED_USER_IDS not set — bot will log incoming user IDs but reject messages"
    );
  }

  bot = new TelegramBot(config.telegram.botToken, { polling: true });
  console.log("[telegram] Bot started (polling)");

  registerTelegramNotifier(async (chatId, text) => {
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
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ETELEGRAM") || message.includes("401")) {
      console.error("[telegram] Polling error — check TELEGRAM_BOT_TOKEN");
    } else {
      console.error("[telegram] Polling error:", message);
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
    const reply = await handleTextMessage(msg.text, chatId, msg.message_id);
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
    case "/tasks":
      reply = handleTasksCommand();
      break;
    case "/reminders":
      reply = handleRemindersCommand();
      break;
    case "/watchrepo":
      reply = await handleWatchRepoCommand(args);
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
  const chunks = splitMessage(text, 4000);
  for (const chunk of chunks) {
    await bot.sendMessage(chatId, chunk);
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}

export function stopTelegramBot() {
  if (bot) {
    bot.stopPolling();
    bot = null;
  }
}
