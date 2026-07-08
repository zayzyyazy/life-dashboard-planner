import { config } from "../config.js";
import { getDb, getSetting, setSetting } from "../db/index.js";
import { sendEmail } from "./email.js";
import { notifyTelegramUsers } from "../telegram/notify.js";

export interface DueReminder {
  id: number;
  message: string;
  due_at: string;
  project_name: string | null;
}

export function getDueReminders(): DueReminder[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.message, r.due_at, p.name as project_name
       FROM reminders r
       LEFT JOIN projects p ON p.id = r.project_id
       WHERE r.status = 'pending'
         AND r.notified_at IS NULL
       ORDER BY r.due_at`
    )
    .all() as DueReminder[];

  const now = Date.now();
  return rows.filter((r) => {
    const due = new Date(r.due_at).getTime();
    return !Number.isNaN(due) && due <= now;
  });
}

export async function processDueReminders(): Promise<number> {
  if (getSetting("reminders_enabled") !== "true") return 0;

  const due = getDueReminders();
  if (due.length === 0) return 0;

  let sent = 0;
  for (const reminder of due) {
    const when = new Date(reminder.due_at).toLocaleString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: config.brief.timezone,
    });
    const text = `${reminder.message}${reminder.project_name ? ` (${reminder.project_name})` : ""}`;

    try {
      if (config.email.to) {
        await sendEmail({
          subject: `Reminder — ${reminder.message.slice(0, 60)}`,
          text: `Reminder: ${text}`,
        });
      }
      await notifyTelegramUsers(`⏰ Reminder (${when}): ${text}`);
      getDb()
        .prepare(
          "UPDATE reminders SET notified_at = datetime('now'), status = 'sent' WHERE id = ?"
        )
        .run(reminder.id);
      sent++;
      console.log(`[reminders] Sent reminder ${reminder.id}: ${text}`);
    } catch (err) {
      console.error(`[reminders] Failed for ${reminder.id}:`, err);
    }
  }
  return sent;
}

export interface DueTask {
  id: number;
  title: string;
  due_date: string;
  project_name: string | null;
}

export function getDueTasks(): DueTask[] {
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.title, t.due_date, p.name as project_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status IN ('open', 'blocked')
         AND t.due_date IS NOT NULL
         AND t.notified_at IS NULL
       ORDER BY t.due_date`
    )
    .all() as DueTask[];

  const now = Date.now();
  return rows.filter((t) => {
    const due = new Date(t.due_date).getTime();
    return !Number.isNaN(due) && due <= now;
  });
}

/** Notify when open tasks pass their due date (separate from explicit reminders). */
export async function processDueTasks(): Promise<number> {
  if (getSetting("reminders_enabled") !== "true") return 0;

  const due = getDueTasks();
  if (due.length === 0) return 0;

  let sent = 0;
  for (const task of due) {
    const text = `Task due: ${task.title}${
      task.project_name ? ` (${task.project_name})` : ""
    }`;

    try {
      if (config.email.to) {
        await sendEmail({
          subject: `Task due — ${task.title.slice(0, 60)}`,
          text,
        });
      }
      await notifyTelegramUsers(`📌 ${text}`);
      getDb()
        .prepare("UPDATE tasks SET notified_at = datetime('now') WHERE id = ?")
        .run(task.id);
      sent++;
      console.log(`[tasks] Due notification sent for task ${task.id}`);
    } catch (err) {
      console.error(`[tasks] Due notification failed for ${task.id}:`, err);
    }
  }
  return sent;
}

export function enableReminders() {
  setSetting("reminders_enabled", "true");
}
