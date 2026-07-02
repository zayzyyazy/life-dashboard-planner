import { config } from "../config.js";

let sendFn: ((chatId: string, text: string) => Promise<void>) | null = null;

export function registerTelegramNotifier(
  fn: (chatId: string, text: string) => Promise<void>
) {
  sendFn = fn;
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
