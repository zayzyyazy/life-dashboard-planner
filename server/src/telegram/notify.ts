import { config } from "../config.js";
import { splitMessage } from "./split-message.js";

let sendFn: ((chatId: string, text: string) => Promise<void>) | null = null;

export function registerTelegramNotifier(
  fn: (chatId: string, text: string) => Promise<void>
) {
  sendFn = fn;
}

/** Register a notifier that splits long proactive messages into multiple bubbles. */
export function registerTelegramNotifierSplit(
  sendChunk: (chatId: string, text: string) => Promise<void>
) {
  sendFn = async (chatId, text) => {
    const chunks = splitMessage(text, config.telegram.messageChunkSize);
    for (const chunk of chunks) {
      await sendChunk(chatId, chunk);
    }
  };
}

export async function notifyTelegramUsers(message: string): Promise<void> {
  if (!sendFn || config.telegram.allowedUserIds.length === 0) return;
  for (const userId of config.telegram.allowedUserIds) {
    try {
      await sendFn(userId, message);
    } catch (err) {
      console.error(`[telegram] Notify failed for ${userId}:`, err);
    }
  }
}
