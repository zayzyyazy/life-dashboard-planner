import { config } from "./config.js";
import { getDb, getSetting, setSetting } from "./db/index.js";
import { syncUserRepos, getGitHubUser } from "./services/github.js";
import { bootGitHub } from "./services/github-context.js";
import { enableReminders } from "./services/reminders.js";
import { seedProfileIfEmpty } from "./services/profile.js";

export async function runSetup(): Promise<void> {
  console.log("[setup] Running Life Planner Agent setup…");
  getDb();

  if (await seedProfileIfEmpty()) {
    console.log("[setup] Personal profile seeded (About you)");
  }

  if (config.brief.enabledByDefault) {
    setSetting("daily_brief_enabled", "true");
    console.log("[setup] Daily brief enabled");
  }

  if (config.reminders.enabledByDefault) {
    enableReminders();
    console.log("[setup] Reminder notifications enabled");
  }

  if (config.github.token) {
    const user = await getGitHubUser();
    if (user) {
      console.log(`[setup] GitHub authenticated as ${user.login}`);
    }
    if (config.github.autoSync) {
      try {
        const result = await syncUserRepos();
        console.log(`[setup] Watching ${result.total} GitHub repo(s)`);
      } catch (err) {
        console.error("[setup] GitHub sync failed:", err instanceof Error ? err.message : err);
      }
    }
  } else if (config.github.watchRepos.length > 0) {
    const result = await syncUserRepos();
    console.log(`[setup] Watching ${result.total} repo(s) from GITHUB_WATCH_REPOS`);
  } else {
    console.warn("[setup] No GITHUB_TOKEN — add one to auto-watch your repos");
  }

  setSetting("setup_complete", "true");
  setSetting("setup_at", new Date().toISOString());
  console.log("[setup] Done. Run npm run dev to start.");
}

export async function runBootTasks(): Promise<void> {
  await bootGitHub();
}
