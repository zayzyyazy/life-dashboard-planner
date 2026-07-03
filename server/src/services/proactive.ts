import { config } from "../config.js";
import { getDb, getSetting, setSetting } from "../db/index.js";
import { generateDailyBrief } from "./brief.js";
import { getProfile } from "./profile.js";
import { notifyTelegramUsers } from "../telegram/notify.js";

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: config.brief.timezone });
}

function alreadySentToday(settingKey: string): boolean {
  return getSetting(settingKey) === todayKey();
}

function markSentToday(settingKey: string) {
  setSetting(settingKey, todayKey());
}

export function getStaleProjects(days: number) {
  return getDb()
    .prepare(
      `SELECT name, updated_at FROM projects
       WHERE status = 'active'
         AND updated_at < datetime('now', ?)
       ORDER BY updated_at`
    )
    .all(`-${days} days`) as { name: string; updated_at: string }[];
}

function getTodayTasks() {
  return getDb()
    .prepare(
      `SELECT t.title, p.name as project FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status IN ('open', 'blocked')
         AND t.due_date IS NOT NULL
         AND date(t.due_date) <= date('now')
       LIMIT 8`
    )
    .all() as { title: string; project: string | null }[];
}

/** Morning Telegram: brief + stale projects + due tasks + ask about the day */
export async function processMorningOutreach(): Promise<boolean> {
  if (!config.proactive.morningEnabled) return false;
  if (!config.telegram.botToken || config.telegram.allowedUserIds.length === 0) return false;
  if (alreadySentToday("morning_outreach_date")) return false;

  const profile = getProfile();
  const name = profile.name ?? "there";
  const stale = getStaleProjects(config.proactive.staleProjectDays);
  const dueToday = getTodayTasks();

  let brief = "";
  try {
    brief = await generateDailyBrief();
  } catch (err) {
    console.error("[proactive] Brief generation failed:", err);
    brief = "Could not generate full brief — check logs.";
  }

  const parts = [`Good morning ${name}! ☀️`, "", brief];

  if (dueToday.length > 0) {
    parts.push("", "⏰ Due today:");
    for (const t of dueToday) {
      parts.push(`• ${t.title}${t.project ? ` (${t.project})` : ""}`);
    }
  }

  if (stale.length > 0) {
    parts.push(
      "",
      `👀 Projects quiet for ${config.proactive.staleProjectDays}+ days: ${stale.map((p) => p.name).join(", ")}`
    );
  }

  parts.push("", "What's the priority today?");

  const msg = parts.join("\n");
  await notifyTelegramUsers(msg.length > 4000 ? msg.slice(0, 3997) + "…" : msg);
  markSentToday("morning_outreach_date");
  setSetting("daily_brief_enabled", "true");
  console.log("[proactive] Morning outreach sent");
  return true;
}

/** Evening check-in — ask how the day went */
export async function processEveningCheckIn(): Promise<boolean> {
  if (!config.proactive.eveningEnabled) return false;
  if (!config.telegram.botToken || config.telegram.allowedUserIds.length === 0) return false;
  if (alreadySentToday("evening_checkin_date")) return false;

  const profile = getProfile();
  const name = profile.name ?? "there";

  const openTasks = getDb()
    .prepare(`SELECT COUNT(*) as c FROM tasks WHERE status IN ('open', 'blocked')`)
    .get() as { c: number };

  const updatesToday = getDb()
    .prepare(`SELECT COUNT(*) as c FROM project_updates WHERE date(created_at) = date('now')`)
    .get() as { c: number };

  let msg = `Evening check-in, ${name}.`;
  if (updatesToday.c > 0) {
    msg += ` ${updatesToday.c} project update(s) logged today.`;
  }
  if (openTasks.c > 0) {
    msg += ` ${openTasks.c} task(s) still open.`;
  }
  msg += " Worth carrying anything to tomorrow?";

  await notifyTelegramUsers(msg);
  markSentToday("evening_checkin_date");
  console.log("[proactive] Evening check-in sent");
  return true;
}

/** Midday nudge for stale projects only */
export async function processStaleProjectNudge(): Promise<boolean> {
  if (!config.proactive.staleNudgeEnabled) return false;
  if (!config.telegram.botToken || config.telegram.allowedUserIds.length === 0) return false;
  if (alreadySentToday("stale_project_nudge_date")) return false;

  const stale = getStaleProjects(config.proactive.staleProjectDays);
  if (stale.length === 0) return false;

  const names = stale.map((p) => p.name).join(", ");
  await notifyTelegramUsers(
    `Quick check-in — you haven't updated ${names} in ${config.proactive.staleProjectDays}+ days. Still active? Send a quick status or say "mark X done".`
  );
  markSentToday("stale_project_nudge_date");
  console.log("[proactive] Stale project nudge sent");
  return true;
}
