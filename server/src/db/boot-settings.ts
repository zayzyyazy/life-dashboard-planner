import { config } from "../config.js";
import { getSetting, setSetting } from "./index.js";
import { enableReminders } from "../services/reminders.js";
import { ensureMissingKnowledgeSeed, seedProfileIfEmpty } from "../services/profile.js";
import { seedProjectKnowledgeIfEmpty } from "../services/agent-knowledge.js";

/** Ensure reminders on by default; brief only if explicitly enabled in env. */
export function ensureBootSettings(): void {
  if (config.reminders.enabledByDefault && getSetting("reminders_enabled") !== "true") {
    enableReminders();
    console.log("[boot] Reminders enabled");
  }
  if (config.brief.enabledByDefault) {
    if (getSetting("daily_brief_enabled") !== "true") {
      setSetting("daily_brief_enabled", "true");
      console.log("[boot] Daily brief enabled");
    }
  } else if (getSetting("daily_brief_enabled") === "true") {
    setSetting("daily_brief_enabled", "false");
    console.log("[boot] Daily brief disabled (opt-in only)");
  }
  const added = ensureMissingKnowledgeSeed();
  if (added > 0) {
    console.log(`[boot] Added ${added} knowledge seed entries`);
  }
  const projectAdded = seedProjectKnowledgeIfEmpty();
  if (projectAdded > 0) {
    console.log(`[boot] Seeded ${projectAdded} project knowledge entries (Marie/MCP/etc.)`);
  }
}

/** Async boot tasks that need DB writes */
export async function ensureBootProfile(): Promise<void> {
  try {
    if (await seedProfileIfEmpty()) {
      console.log("[boot] Personal profile seeded");
    }
  } catch (err) {
    console.error("[boot] Profile seed failed:", err);
  }
}
