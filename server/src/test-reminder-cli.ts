import { getDb } from "./db/index.js";
import { enableReminders } from "./services/reminders.js";
import { normalizeDueAt } from "./agent/parse-due.js";

getDb();
enableReminders();

const dueAt = normalizeDueAt(new Date(Date.now() + 2 * 60 * 1000).toISOString())!;

getDb()
  .prepare("INSERT INTO reminders (message, due_at) VALUES (?, ?)")
  .run("Test reminder — if you see this on Telegram, reminders work!", dueAt);

console.log(`✓ Test reminder scheduled for ${dueAt}`);
console.log("  Wait ~2-5 minutes. Daemon must be running.");
console.log("  Check: curl http://127.0.0.1:3847/health");
