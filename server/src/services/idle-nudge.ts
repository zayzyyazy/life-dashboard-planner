import { config } from "../config.js";
import { getSetting, setSetting } from "../db/index.js";
import { getLastUserActivityAt } from "./memory.js";
import { notifyTelegramUsers } from "../telegram/notify.js";

const NUDGE_MESSAGE =
  "You've been quiet — if something's in progress, a quick status helps me keep the picture accurate.";

export async function processIdleNudge(): Promise<boolean> {
  if (!config.idleNudge.enabled) return false;
  if (!config.telegram.botToken || config.telegram.allowedUserIds.length === 0) return false;

  const lastActivity = getLastUserActivityAt();
  if (!lastActivity) return false;

  const idleMs = Date.now() - new Date(lastActivity).getTime();
  if (idleMs < config.idleNudge.idleHours * 60 * 60 * 1000) return false;

  const lastNudgeAt = getSetting("idle_nudge_sent_at");
  if (lastNudgeAt) {
    const sinceNudge = Date.now() - new Date(lastNudgeAt).getTime();
    if (sinceNudge < config.idleNudge.cooldownHours * 60 * 60 * 1000) return false;
  }

  await notifyTelegramUsers(NUDGE_MESSAGE);
  setSetting("idle_nudge_sent_at", new Date().toISOString());
  console.log("[idle-nudge] Sent check-in after idle period");
  return true;
}
