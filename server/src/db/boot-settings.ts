import { config } from "../config.js";
import { getSetting, setSetting } from "./index.js";
import { enableReminders } from "../services/reminders.js";
import { ensureMissingKnowledgeSeed } from "../services/profile.js";

/** Ensure reminders/brief are on even if setup never completed. */
export function ensureBootSettings(): void {
  if (config.reminders.enabledByDefault && getSetting("reminders_enabled") !== "true") {
    enableReminders();
    console.log("[boot] Reminders enabled");
  }
  if (config.brief.enabledByDefault && getSetting("daily_brief_enabled") !== "true") {
    setSetting("daily_brief_enabled", "true");
    console.log("[boot] Daily brief enabled");
  }
  const added = ensureMissingKnowledgeSeed();
  if (added > 0) {
    console.log(`[boot] Added ${added} knowledge seed entries`);
  }
}
