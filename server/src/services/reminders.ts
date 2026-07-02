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
  return getDb()
    .prepare(
      `SELECT r.id, r.message, r.due_at, p.name as project_name
       FROM reminders r
       LEFT JOIN projects p ON p.id = r.project_id
       WHERE r.status = 'pending'
         AND r.due_at <= datetime('now')
         AND r.notified_at IS NULL
       ORDER BY r.due_at`
    )
    .all() as DueReminder[];
}

export async function processDueReminders(): Promise<number> {
  if (getSetting("reminders_enabled") !== "true") return 0;

  const due = getDueReminders();
  if (due.length === 0) return 0;

  let sent = 0;
  for (const reminder of due) {
    const text = `Reminder: ${reminder.message}${
      reminder.project_name ? ` (${reminder.project_name})` : ""
    }`;

    try {
      if (config.email.to) {
        await sendEmail({
          subject: `Reminder — ${reminder.message.slice(0, 60)}`,
          text,
        });
      }
      await notifyTelegramUsers(`⏰ ${text}`);
      getDb()
        .prepare(
          "UPDATE reminders SET notified_at = datetime('now'), status = 'sent' WHERE id = ?"
        )
        .run(reminder.id);
      sent++;
      console.log(`[reminders] Sent reminder ${reminder.id}`);
    } catch (err) {
      console.error(`[reminders] Failed for ${reminder.id}:`, err);
    }
  }
  return sent;
}

export function enableReminders() {
  setSetting("reminders_enabled", "true");
}
