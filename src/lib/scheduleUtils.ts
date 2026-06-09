import type { SuggestedTask, Task } from "../types/task";

export const DAY_START = "06:00";
export const DAY_END = "23:00";
export const SLOT_MINUTES = 30;
export const MIN_BREAK_MINUTES = 30;

export type TimetableEntry =
  | { type: "task"; task: Task; startTime: string; endTime: string }
  | { type: "break"; startTime: string; endTime: string; minutes: number };

export function formatTimeRange(start: string, end: string): string {
  return `${start}–${end}`;
}

export function timeToMinutes(time: string): number {
  if (!time || typeof time !== "string") return timeToMinutes(DAY_START);
  const parts = time.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return timeToMinutes(DAY_START);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function findNextSlotOnDay(
  tasksOnDay: Task[],
  _date: string,
  hours: number
): { startTime: string; endTime: string } {
  const duration = Math.round(hours * 60);
  const timed = tasksOnDay
    .filter((t) => t.startTime && t.endTime)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  let cursor = timeToMinutes(DAY_START);
  for (const t of timed) {
    const start = timeToMinutes(t.startTime!);
    const end = timeToMinutes(t.endTime!);
    if (cursor + duration <= start) break;
    cursor = Math.max(cursor, end);
  }

  const endMin = Math.min(timeToMinutes(DAY_END), cursor + duration);
  return {
    startTime: minutesToTime(cursor),
    endTime: minutesToTime(endMin),
  };
}

export function generateTimeSlots(): string[] {
  const slots: string[] = [];
  let cur = timeToMinutes(DAY_START);
  const end = timeToMinutes(DAY_END);
  while (cur <= end) {
    slots.push(minutesToTime(cur));
    cur += SLOT_MINUTES;
  }
  return slots;
}

export function taskDurationMinutes(task: Task): number {
  if (task.startTime && task.endTime) {
    return Math.max(SLOT_MINUTES, timeToMinutes(task.endTime) - timeToMinutes(task.startTime));
  }
  return (task.estimatedHours ?? 1) * 60;
}

export function tasksWithTime(tasks: Task[], date: string): Task[] {
  return tasks
    .filter((t) => t.date === date && t.kind !== "reminder" && t.startTime && t.endTime)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

export function tasksWithoutTime(tasks: Task[], date: string): Task[] {
  return tasks.filter(
    (t) => t.date === date && t.kind === "task" && (!t.startTime || !t.endTime)
  );
}

export function remindersForDay(tasks: Task[], date: string): Task[] {
  return tasks.filter((t) => t.date === date && t.kind === "reminder");
}

export function buildDaySchedule(tasks: Task[], date: string): TimetableEntry[] {
  const timed = tasksWithTime(tasks, date);
  const entries: TimetableEntry[] = [];

  for (let i = 0; i < timed.length; i++) {
    const task = timed[i];
    const startTime = task.startTime!;
    const endTime = task.endTime!;

    if (i > 0) {
      const prev = timed[i - 1];
      const gapStart = prev.endTime!;
      const gapEnd = startTime;
      const gapMin = timeToMinutes(gapEnd) - timeToMinutes(gapStart);
      if (gapMin >= MIN_BREAK_MINUTES) {
        entries.push({ type: "break", startTime: gapStart, endTime: gapEnd, minutes: gapMin });
      }
    }

    entries.push({ type: "task", task, startTime, endTime });
  }

  return entries;
}

export function slotRowSpan(startTime: string, endTime: string): number {
  const mins = timeToMinutes(endTime) - timeToMinutes(startTime);
  return Math.max(1, Math.round(mins / SLOT_MINUTES));
}

export function slotOffsetFromStart(time: string): number {
  const diff = timeToMinutes(time) - timeToMinutes(DAY_START);
  return Math.max(0, Math.round(diff / SLOT_MINUTES));
}

const DEFAULT_SLOT_STARTS = ["09:00", "11:00", "14:00", "16:00", "19:00"];

function to24h(hour: number, minute: number, ampm?: string): string {
  let h = hour;
  if (ampm) {
    const ap = ampm.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Parse natural language times like "8 am to 5pm" or "10:00-18:00" from task text */
export function parseTimeRangeFromText(text: string): {
  startTime: string;
  endTime: string;
  estimatedHours: number;
} | null {
  const clock = text.match(
    /(\d{1,2}):(\d{2})\s*(am|pm)?\s*(?:to|-|–|until)\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i
  );
  if (clock) {
    const startTime = to24h(Number(clock[1]), Number(clock[2]), clock[3]);
    const endTime = to24h(Number(clock[4]), Number(clock[5]), clock[6] ?? clock[3]);
    const mins = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (mins > 0) {
      return { startTime, endTime, estimatedHours: Math.round((mins / 60) * 10) / 10 };
    }
  }

  const verbal = text.match(
    /(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:to|-|–|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
  );
  if (verbal) {
    const startTime = to24h(Number(verbal[1]), Number(verbal[2] ?? 0), verbal[3]);
    const endTime = to24h(Number(verbal[4]), Number(verbal[5] ?? 0), verbal[6]);
    const mins = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (mins > 0) {
      return { startTime, endTime, estimatedHours: Math.round((mins / 60) * 10) / 10 };
    }
  }

  const bareWork = text.match(
    /(?:from\s+)?(\d{1,2})\s*(?:to|-|–|until)\s*(\d{1,2})(?:\s*(am|pm))?/i
  );
  if (bareWork) {
    const startH = Number(bareWork[1]);
    const endH = Number(bareWork[2]);
    const startTime = to24h(startH, 0, startH < 8 ? "am" : bareWork[3] ?? (startH <= 12 ? "am" : undefined));
    let endAmpm = bareWork[3];
    if (!endAmpm) {
      endAmpm = endH >= 1 && endH <= 7 ? "pm" : endH < 12 ? "pm" : "pm";
      if (endH <= 12 && endH > startH) endAmpm = endH <= 6 ? "pm" : "pm";
    }
    const endTime = to24h(endH, 0, endAmpm);
    const mins = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (mins > 0) {
      return { startTime, endTime, estimatedHours: Math.round((mins / 60) * 10) / 10 };
    }
  }

  const hourRange = text.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\b/);
  if (hourRange) {
    const startH = Number(hourRange[1]);
    const endH = Number(hourRange[2]);
    if (endH > startH && endH <= 23) {
      const startTime = `${String(startH).padStart(2, "0")}:00`;
      const endTime = `${String(endH).padStart(2, "0")}:00`;
      return {
        startTime,
        endTime,
        estimatedHours: endH - startH,
      };
    }
  }

  return null;
}

/** Assign staggered time blocks when AI/user omitted startTime/endTime */
export function enrichSuggestionsWithTimes(suggestions: SuggestedTask[]): SuggestedTask[] {
  const byDate: Record<string, SuggestedTask[]> = {};
  for (const s of suggestions) {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  }

  const result: SuggestedTask[] = [];
  for (const items of Object.values(byDate)) {
    items.forEach((s, i) => {
      const parsed = parseTimeRangeFromText(`${s.title} ${s.notes ?? ""}`);
      if (parsed) {
        result.push({ ...s, ...parsed });
        return;
      }
      if (s.startTime && s.endTime) {
        result.push(s);
        return;
      }
      const hours = s.estimatedHours ?? 1;
      const start = DEFAULT_SLOT_STARTS[i % DEFAULT_SLOT_STARTS.length];
      const endMin = timeToMinutes(start) + Math.round(hours * 60);
      result.push({
        ...s,
        startTime: start,
        endTime: minutesToTime(Math.min(timeToMinutes(DAY_END), endMin)),
      });
    });
  }
  return result;
}

function isDefaultOneHourSlot(start?: string, end?: string): boolean {
  return start === "09:00" && (end === "10:00" || end === "11:00");
}

/** Re-parse day/time from title+notes and fix wrong default slots on load */
export function repairTaskFromText(task: Task): Task {
  const text = `${task.title} ${task.notes ?? ""}`;
  const parsed = parseTimeRangeFromText(text);
  const shouldReplaceTimes =
    parsed &&
    (!task.startTime ||
      !task.endTime ||
      isDefaultOneHourSlot(task.startTime, task.endTime));

  return {
    ...task,
    ...(parsed && shouldReplaceTimes
      ? {
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          estimatedHours: parsed.estimatedHours,
        }
      : {}),
  };
}

/** Repair parsed times from text only — no auto-backfill of missing slots */
export function enrichLoadedTasksWithTimes(tasks: Task[]): Task[] {
  return tasks.map(repairTaskFromText);
}
