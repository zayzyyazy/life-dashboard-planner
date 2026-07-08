import { getDb } from "../db/index.js";
import { getProfile } from "../services/profile.js";

export function looksLikeGreeting(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length > 80) return false;

  if (/^(hi+|hello+|hey+|he+y+|yo+|sup|gm|gn)\b[!.,?\s]*$/i.test(trimmed)) return true;
  if (/^g+o+o+d\s*morn/i.test(trimmed)) return true;
  if (/^good\s+(morning|afternoon|evening|night)/i.test(trimmed)) return true;
  if (/^(morning|afternoon|evening)\b[!.,?\s]*$/i.test(trimmed)) return true;
  if (/^what'?s\s+up\b/i.test(trimmed)) return true;
  if (/^(howdy|hiya)\b/i.test(trimmed)) return true;

  if (
    trimmed.length <= 50 &&
    /\b(morning|afternoon|evening)\b/i.test(trimmed) &&
    !/\b(remind|task|at \d|in \d+\s*min)/i.test(trimmed)
  ) {
    return true;
  }

  return false;
}

export function getTimeOfDayWord(): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

/** One-line hook from live state — used when we need a quick contextual nudge. */
export function getContextHook(): string | null {
  const db = getDb();
  const openTasks = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM tasks WHERE status IN ('open', 'blocked')`
      )
      .get() as { c: number }
  ).c;

  const dueToday = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM tasks
         WHERE status IN ('open', 'blocked')
           AND due_date IS NOT NULL
           AND date(due_date) <= date('now')`
      )
      .get() as { c: number }
  ).c;

  const nextReminder = db
    .prepare(
      `SELECT message, due_at FROM reminders
       WHERE status = 'pending' AND datetime(due_at) >= datetime('now')
       ORDER BY due_at LIMIT 1`
    )
    .get() as { message: string; due_at: string } | undefined;

  if (dueToday > 0) {
    return dueToday === 1
      ? "You've got 1 task due today."
      : `You've got ${dueToday} tasks due today.`;
  }
  if (nextReminder) {
    const when = new Date(nextReminder.due_at).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Next up: ${nextReminder.message} at ${when}.`;
  }
  if (openTasks > 0) {
    return openTasks === 1
      ? "You've got 1 open task on the board."
      : `You've got ${openTasks} open tasks.`;
  }
  return null;
}

export function userFirstName(): string | null {
  const name = getProfile().name?.trim();
  if (!name) return null;
  return name.split(/\s+/)[0] ?? name;
}
