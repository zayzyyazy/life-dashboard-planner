import { formatTimeRange } from "./scheduleUtils";
import { tasksInBucket } from "./bucketUtils";
import { todayString } from "./dateUtils";
import type { Project } from "../types/project";
import type { Task } from "../types/task";

export type DailyBriefing = {
  greeting: string;
  summary: string;
  highlights: string[];
  nextUp?: string;
  stats: {
    mustDo: number;
    scheduledToday: number;
    later: number;
    projects: number;
    doneToday: number;
  };
};

function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function buildDailyBriefing(tasks: Task[], projects: Project[]): DailyBriefing {
  const today = todayString();
  const mustDo = tasksInBucket(tasks, "now");
  const scheduled = tasksInBucket(tasks, "scheduled").filter((t) => t.date === today);
  const later = tasksInBucket(tasks, "later");
  const activeProjects = projects.filter((p) => p.status === "active");
  const doneToday = tasks.filter((t) => t.done && t.date === today).length;

  const timedToday = scheduled
    .filter((t) => t.startTime)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  const nextTask = timedToday.find((t) => {
    if (!t.startTime) return false;
    const [h, m] = t.startTime.split(":").map(Number);
    const now = new Date();
    const taskMin = h * 60 + m;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return taskMin >= nowMin;
  }) ?? timedToday[0] ?? mustDo[0];

  let nextUp: string | undefined;
  if (nextTask) {
    const time = nextTask.startTime && nextTask.endTime
      ? formatTimeRange(nextTask.startTime, nextTask.endTime)
      : undefined;
    nextUp = time ? `${nextTask.title} at ${time}` : nextTask.title;
  }

  const highlights: string[] = [];
  if (mustDo.length > 0) {
    highlights.push(`${mustDo.length} must-do${mustDo.length === 1 ? "" : "s"} waiting`);
  }
  if (scheduled.length > 0) {
    highlights.push(`${scheduled.length} on today's schedule`);
  }
  if (later.length > 0) {
    highlights.push(`${later.length} coming up later`);
  }
  if (activeProjects.length > 0) {
    highlights.push(`${activeProjects.length} active project${activeProjects.length === 1 ? "" : "s"}`);
  }
  if (highlights.length === 0) {
    highlights.push("Your slate is clear — chat to plan your day");
  }

  const summary =
    mustDo.length === 0 && scheduled.length === 0
      ? "Nothing urgent on your plate. Tell the planner what you want to accomplish."
      : `You have ${mustDo.length} priority item${mustDo.length === 1 ? "" : "s"} and ${scheduled.length} scheduled for today.`;

  return {
    greeting: timeGreeting(),
    summary,
    highlights,
    nextUp,
    stats: {
      mustDo: mustDo.length,
      scheduledToday: scheduled.length,
      later: later.length,
      projects: activeProjects.length,
      doneToday,
    },
  };
}

const LAST_BRIEFING_KEY = "ldp_last_briefing_date";

export function shouldShowDailyUpdate(): boolean {
  return localStorage.getItem(LAST_BRIEFING_KEY) !== todayString();
}

export function markDailyUpdateShown(): void {
  localStorage.setItem(LAST_BRIEFING_KEY, todayString());
}

export function requestDailyNotification(briefing: DailyBriefing): void {
  if (!shouldShowDailyUpdate()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const body = briefing.nextUp
    ? `Next: ${briefing.nextUp}`
    : briefing.highlights.slice(0, 2).join(" · ");

  try {
    new Notification(`${briefing.greeting}!`, { body, tag: "ldp-daily-briefing" });
    markDailyUpdateShown();
  } catch {
    // Notifications unavailable in some environments
  }
}
