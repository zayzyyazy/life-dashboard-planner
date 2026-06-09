import type { PlannerResponse, WeekReview } from "../types/planner";
import type { SuggestedTask, Task, TaskTag } from "../types/task";
import {
  addDays,
  endOfWeek,
  parseDayMentionFromText,
  startOfWeek,
  todayString,
  toDateString,
  weekDays,
} from "./dateUtils";
import { hasScheduleDetails, parseCaptureText } from "./captureParser";
import { inferPriority, inferTag } from "./taskUtils";

type AssistantContext = Record<string, string>;

function reply(text: string, extra?: Partial<PlannerResponse>): PlannerResponse {
  return { reply: text, suggestions: [], ...extra };
}

const STUDY_SLOTS = ["14:00-16:00", "10:00-12:00", "16:00-18:00", "09:00-11:00"];

function parseSlot(slot: string): { startTime: string; endTime: string } {
  const [startTime, endTime] = slot.split("-");
  return { startTime, endTime };
}

function distributeHours(total: number, days: string[], label: string, tag: TaskTag): SuggestedTask[] {
  const per = Math.max(1, Math.round(total / days.length));
  return days.map((date, i) => {
    const slot = parseSlot(STUDY_SLOTS[i % STUDY_SLOTS.length]);
    const endH = parseInt(slot.startTime) + per;
    return {
      title: label,
      date,
      tag,
      priority: "medium" as const,
      kind: "event" as const,
      estimatedHours: per,
      startTime: slot.startTime,
      endTime: `${String(Math.min(endH, 23)).padStart(2, "0")}:${slot.endTime.split(":")[1]}`,
    };
  });
}

function parseHours(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(?:h|hour|hours)/i);
  return m ? Number(m[1]) : undefined;
}

const parseDayMention = parseDayMentionFromText;

function studyBlocks(ctx: AssistantContext): SuggestedTask[] {
  const hours = Number(ctx.hours || 6);
  const subject = ctx.subject || "Study session";
  const deadline = ctx.deadline || addDays(todayString(), 3);
  const days = weekDays().map(toDateString).filter((d) => d <= deadline).slice(0, 4);
  return distributeHours(hours, days.length ? days : [addDays(todayString(), 1)], subject, "uni");
}

function gymBlocks(ctx: AssistantContext): SuggestedTask[] {
  const count = Number(ctx.gymCount || 3);
  const slots = weekDays()
    .map(toDateString)
    .filter((_, i) => i % 2 === 0)
    .slice(0, count);
  return slots.map((date) => ({
    title: "Gym session",
    date,
    tag: "health" as const,
    priority: "medium" as const,
    kind: "event" as const,
    estimatedHours: 1,
    startTime: "07:00",
    endTime: "08:00",
  }));
}

export function parsePhoneCapture(text: string): SuggestedTask[] {
  return parseCaptureText(text);
}

export function generateResponse(
  userMessage: string,
  context: AssistantContext,
  existingTasks: Task[]
): PlannerResponse {
  const msg = userMessage.toLowerCase().trim();
  const updates: AssistantContext = { ...context };

  if (context.awaiting) {
    const key = context.awaiting;
    updates[key] = userMessage.trim();
    delete updates.awaiting;

    if (key === "deadline" && !updates.hours) {
      return reply("How many hours do you estimate for this?", {
        followUp: "hours",
        contextUpdates: { ...updates, awaiting: "hours" },
      });
    }
    if (key === "hours" && context.topic?.includes("study")) {
      return reply("Should I split this into multiple study blocks across the week?", {
        followUp: "split",
        suggestions: studyBlocks({ ...context, ...updates }),
        contextUpdates: updates,
      });
    }
    if (key === "hours") {
      return reply("Here is a draft schedule based on what you told me. Review and approve when ready.", {
        suggestions: studyBlocks({ ...context, ...updates }),
        contextUpdates: updates,
      });
    }
    if (key === "plan-details") {
      const target = context.planTarget || "today";
      const weekOffset = context.nextWeek === "true" ? 1 : 0;
      const parseOptions = weekOffset > 0 ? { defaultWeekOffset: weekOffset } : undefined;
      const suggestions = parseCaptureText(userMessage, parseOptions);

      const label =
        target === "week"
          ? "week plan"
          : target === "tomorrow"
            ? "tomorrow's plan"
            : "plan";

      if (suggestions.length > 0) {
        return reply(
          `I found ${suggestions.length} item(s) for your ${label}. Review and approve when ready.`,
          { suggestions, contextUpdates: updates }
        );
      }

      return reply(
        "I couldn't parse specific times or days from that. Try something like: work monday 10-18, uni wednesday 16-18.",
        { contextUpdates: updates }
      );
    }
  }

  if (/plan today|organize today|plan my day/.test(msg) && !/tomorrow|week/.test(msg)) {
    updates.planTarget = "today";
    return reply("What do you need to do today? List tasks, meetings, and any fixed times (e.g. work 10–18, gym at 17:00).", {
      followUp: "plan-details",
      contextUpdates: { ...updates, awaiting: "plan-details" },
    });
  }

  if (/plan tomorrow|organize tomorrow/.test(msg)) {
    updates.planTarget = "tomorrow";
    return reply("What do you need to do tomorrow? List your tasks and any time constraints.", {
      followUp: "plan-details",
      contextUpdates: { ...updates, awaiting: "plan-details" },
    });
  }

  if (/plan.*week|this week|organize.*week|plan my week|next week/.test(msg)) {
    updates.planTarget = "week";
    if (/\bnext\s+week\b/.test(msg)) {
      updates.nextWeek = "true";
    }
    return reply("What do you need to fit in this week? Tell me about work, study, gym, deadlines, and fixed appointments.", {
      followUp: "plan-details",
      contextUpdates: { ...updates, awaiting: "plan-details" },
    });
  }

  if (/exam/.test(msg)) {
    const friday = weekDays().find((d) => d.getDay() === 5);
    const deadline = friday ? toDateString(friday) : addDays(todayString(), 4);
    updates.deadline = deadline;
    updates.topic = "study";
    if (!parseHours(msg)) {
      return reply("When is the exam — is Friday correct? How many total study hours this week?", {
        followUp: "hours",
        contextUpdates: { ...updates, awaiting: "hours", subject: "Exam prep" },
      });
    }
    const hours = parseHours(msg) || 6;
    updates.hours = String(hours);
    const days = weekDays().map(toDateString).filter((d) => d < deadline).slice(-3);
    return reply("I split exam prep into study blocks before your deadline.", {
      suggestions: distributeHours(hours, days, "Exam study", "uni"),
      contextUpdates: updates,
    });
  }

  if (/study|revision/.test(msg)) {
    updates.topic = "study";
    updates.subject = userMessage.replace(/study|for|revision/gi, "").trim() || "Study session";
    if (!parseHours(msg)) {
      return reply("When is the deadline?", {
        followUp: "deadline",
        contextUpdates: { ...updates, awaiting: "deadline" },
      });
    }
    updates.hours = String(parseHours(msg));
    return reply("Should I split this into multiple study blocks?", {
      followUp: "split",
      suggestions: studyBlocks(updates),
      contextUpdates: updates,
    });
  }

  if (/gym|workout/.test(msg)) {
    const countMatch = msg.match(/(\d+)\s*times?/);
    updates.gymCount = countMatch ? countMatch[1] : "3";
    return reply(`I'll schedule ${updates.gymCount} gym sessions across the week.`, {
      suggestions: gymBlocks(updates),
      contextUpdates: updates,
    });
  }

  if (/work monday|monday.*tuesday.*work/.test(msg)) {
    const days = weekDays();
    return reply("Blocked work days on your calendar.", {
      suggestions: [
        { title: "Work day", date: toDateString(days[0]), tag: "work", priority: "high", kind: "event", estimatedHours: 8, startTime: "10:00", endTime: "18:00" },
        { title: "Work day", date: toDateString(days[1]), tag: "work", priority: "high", kind: "event", estimatedHours: 8, startTime: "10:00", endTime: "18:00" },
      ],
    });
  }

  if (/balance|overload/.test(msg)) {
    const high = existingTasks.filter((t) => t.priority === "high" && !t.done).length;
    if (high > 5) {
      return reply("You have many high-priority tasks. I suggest moving 2 lower-stakes items to next week.", {
        suggestions: existingTasks
          .filter((t) => t.priority === "high" && !t.done)
          .slice(0, 2)
          .map((t) => ({ ...t, date: addDays(t.date, 7), priority: "medium" as const })),
      });
    }
    return reply("Your schedule looks reasonably balanced. Add a health block if the week feels heavy.");
  }

  if (/review/.test(msg)) {
    const review = reviewWeek(existingTasks);
    return reply(review.insights.join("\n"));
  }

  if (hasScheduleDetails(userMessage)) {
    const weekOffset = /\bnext\s+week\b/i.test(userMessage) ? 1 : 0;
    const suggestions = parseCaptureText(
      userMessage,
      weekOffset > 0 ? { defaultWeekOffset: weekOffset } : undefined
    );
    return reply(
      `I found ${suggestions.length} item(s) — ${suggestions.map((s) => s.kind).join(", ")}. Review and approve to add them.`,
      { suggestions }
    );
  }

  const mentioned = parseDayMention(msg);
  const hours = parseHours(msg);
  if (userMessage.includes("\n") || userMessage.includes(";")) {
    return reply("I parsed your list into task suggestions. Approve to add them.", {
      suggestions: parseCaptureText(userMessage),
    });
  }

  return reply("Tell me more — what's the deadline, how long will it take, and which category (uni, work, personal, health, admin)?", {
    suggestions: [{
      title: userMessage.trim().slice(0, 120),
      date: mentioned || todayString(),
      tag: inferTag(msg),
      priority: inferPriority(msg),
      kind: "task",
      estimatedHours: hours,
    }],
  });
}

export function generatePlan(intent: string, context: AssistantContext, tasks: Task[]): PlannerResponse {
  return generateResponse(intent, context, tasks);
}

export function reviewWeek(tasks: Task[]): WeekReview {
  const start = toDateString(startOfWeek());
  const end = toDateString(endOfWeek());
  const weekTasks = tasks.filter((t) => t.date >= start && t.date <= end);
  const done = weekTasks.filter((t) => t.done);
  const insights: string[] = [];

  const categories: TaskTag[] = ["uni", "work", "personal", "health", "admin"];
  const counts: Record<string, number> = {};
  categories.forEach((c) => {
    counts[c] = weekTasks.filter((t) => t.tag === c).length;
  });

  if (counts.uni === 0) insights.push("You currently have no university tasks this week.");
  if (counts.health === 0) insights.push("You have not scheduled any health-related activities.");
  if (weekTasks.filter((t) => t.priority === "high" && !t.done).length > 6) {
    insights.push("Your week may be overloaded with high-priority tasks.");
  }
  const overdue = tasks.filter((t) => !t.done && t.date < todayString());
  if (overdue.length > 2) insights.push("You have several overdue tasks requiring attention.");

  const active = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const most = active[0]?.[0] || "none";
  const least = active.filter(([, v]) => v > 0).sort((a, b) => a[1] - b[1])[0]?.[0] || "none";

  const categoryScores: Record<string, number> = {};
  categories.forEach((c) => {
    const catTasks = weekTasks.filter((t) => t.tag === c);
    const completed = catTasks.filter((t) => t.done).length;
    categoryScores[c] = catTasks.length ? Math.round((completed / catTasks.length) * 100) : 0;
  });

  if (insights.length === 0) insights.push("Your week looks balanced. Keep momentum on today's priorities.");

  return {
    insights,
    categoryScores,
    completedThisWeek: done.length,
    completionPercent: weekTasks.length ? Math.round((done.length / weekTasks.length) * 100) : 0,
    mostActiveCategory: most,
    leastActiveCategory: least,
    upcomingDeadlines: tasks
      .filter((t) => !t.done && t.date >= todayString())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5)
      .map((t) => ({ title: t.title, date: t.date })),
    overdueCount: overdue.length,
  };
}
