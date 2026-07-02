import cron from "node-cron";
import { config } from "../config.js";
import { getSetting } from "../db/index.js";
import { generateDailyBrief, markBriefSent } from "./brief.js";
import { sendEmail } from "./email.js";
import { checkAllRepos } from "./github.js";
import { checkAllFolders, startFolderWatcher } from "./folder.js";
import { processDueReminders, processDueTasks } from "./reminders.js";
import { processIdleNudge } from "./idle-nudge.js";
import {
  processEveningCheckIn,
  processMorningOutreach,
  processStaleProjectNudge,
} from "./proactive.js";
import { notifyTelegramUsers } from "../telegram/notify.js";

export function startScheduler() {
  startFolderWatcher();

  // Reminders: every 15 seconds (reliable for "in 3 minutes")
  setInterval(() => {
    processDueReminders().catch(console.error);
    processDueTasks().catch(console.error);
  }, 15_000);

  // GitHub: check every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    checkAllRepos().catch(console.error);
  });

  // Folders: backup scan every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    checkAllFolders().catch(console.error);
  });

  // Reminders + due tasks: check every 5 minutes
  cron.schedule(config.reminders.checkCron, () => {
    processDueReminders().catch(console.error);
    processDueTasks().catch(console.error);
  });

  // Idle check-in: nudge on Telegram after no updates for a while
  cron.schedule(config.idleNudge.checkCron, () => {
    processIdleNudge().catch(console.error);
  });

  // Morning outreach: brief + stale projects + ask about the day
  cron.schedule(
    config.proactive.morningCron,
    () => {
      processMorningOutreach().catch(console.error);
    },
    { timezone: config.brief.timezone }
  );

  // Midday stale project nudge
  cron.schedule(
    config.proactive.staleNudgeCron,
    () => {
      processStaleProjectNudge().catch(console.error);
    },
    { timezone: config.brief.timezone }
  );

  // Evening check-in
  cron.schedule(
    config.proactive.eveningCron,
    () => {
      processEveningCheckIn().catch(console.error);
    },
    { timezone: config.brief.timezone }
  );

  // Daily brief (legacy 7am — morning outreach includes brief; keep for email-only users)
  cron.schedule(
    config.brief.cron,
    async () => {
      const enabled = getSetting("daily_brief_enabled");
      if (enabled !== "true") return;
      try {
        const brief = await generateDailyBrief();
        const subject = `Daily Brief — ${new Date().toLocaleDateString()}`;
        if (config.email.to) {
          await sendEmail({
            subject,
            text: brief,
            html: brief.replace(/\n/g, "<br>"),
          });
        }
        const preview = brief.length > 3500 ? brief.slice(0, 3497) + "…" : brief;
        await notifyTelegramUsers(`📋 ${subject}\n\n${preview}`);
        markBriefSent();
        console.log("[brief] Daily brief sent");
      } catch (err) {
        console.error("[brief] Daily brief failed:", err);
      }
    },
    { timezone: config.brief.timezone }
  );

  console.log(
    `[scheduler] brief=${config.brief.cron} morning=${config.proactive.morningCron} evening=${config.proactive.eveningCron} reminders=${config.reminders.checkCron} github=every30m tz=${config.brief.timezone}`
  );
}
