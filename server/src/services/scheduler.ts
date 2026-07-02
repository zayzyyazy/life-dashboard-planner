import cron from "node-cron";
import { config } from "../config.js";
import { getSetting } from "../db/index.js";
import { generateDailyBrief, markBriefSent } from "./brief.js";
import { sendEmail } from "./email.js";
import { checkAllRepos } from "./github.js";
import { checkAllFolders, startFolderWatcher } from "./folder.js";

export function startScheduler() {
  startFolderWatcher();

  // Check repos every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    checkAllRepos().catch(console.error);
  });

  // Check folders every 15 minutes (backup to chokidar)
  cron.schedule("*/15 * * * *", () => {
    checkAllFolders().catch(console.error);
  });

  // Daily brief
  cron.schedule(
    config.brief.cron,
    async () => {
      const enabled = getSetting("daily_brief_enabled");
      if (enabled !== "true") return;
      try {
        const brief = await generateDailyBrief();
        await sendEmail({
          subject: `Daily Brief — ${new Date().toLocaleDateString()}`,
          text: brief,
          html: brief.replace(/\n/g, "<br>"),
        });
        markBriefSent();
        console.log("Daily brief sent");
      } catch (err) {
        console.error("Daily brief failed:", err);
      }
    },
    { timezone: config.brief.timezone }
  );

  console.log(`Scheduler started (brief cron: ${config.brief.cron}, tz: ${config.brief.timezone})`);
}
