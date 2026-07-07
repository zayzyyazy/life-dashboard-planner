/**
 * Mirror SQLite tasks/reminders into Obsidian daily notes.
 */
import { appendVaultDailyLog, appendVaultDailyTask } from "./obsidian-brain.js";
import { projectSlugFromName } from "./project-resolve.js";

export async function appendObsidianTask(params: {
  title: string;
  dueDate?: string | null;
  projectName?: string | null;
}): Promise<void> {
  try {
    await appendVaultDailyTask({
      title: params.title,
      dueDate: params.dueDate,
      projectTag: params.projectName ? projectSlugFromName(params.projectName) : undefined,
    });
  } catch (err) {
    console.warn("[obsidian-tasks] append failed:", err);
  }
}

export async function appendObsidianLog(line: string): Promise<void> {
  try {
    await appendVaultDailyLog(line);
  } catch (err) {
    console.warn("[obsidian-tasks] log append failed:", err);
  }
}
