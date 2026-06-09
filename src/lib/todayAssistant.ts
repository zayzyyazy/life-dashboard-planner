import { addDays, parseDate, toDateString, todayString, weekDays } from "./dateUtils";
import type { Task } from "../types/task";

export function dayTasks(tasks: Task[], date: string): Task[] {
  return tasks
    .filter((t) => t.date === date && t.startTime)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

export function weekTaskDates(tasks: Task[], weekStart: string): Task[] {
  const days = weekDays(parseDate(weekStart)).map(toDateString);
  return tasks
    .filter((t) => days.includes(t.date) && t.startTime)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

function formatBlock(t: Task): string {
  const time = t.endTime ? `${t.startTime}–${t.endTime}` : t.startTime!;
  const status = t.done ? " ✓" : "";
  return `${time} ${t.title}${status}`;
}

function overlapNote(blocks: Task[]): string | null {
  const timed = blocks.filter((t) => t.startTime && t.endTime);
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (a.startTime! < b.endTime! && b.startTime! < a.endTime!) {
        return "Some blocks overlap (e.g. a call inside a work shift) — that's normal for breaks and meetings.";
      }
    }
  }
  return null;
}

export function summarizeToday(tasks: Task[], date = todayString()): string {
  const blocks = dayTasks(tasks, date);
  if (!blocks.length) {
    return `Nothing timed on ${date} yet. Plan your day on the calendar, then ask me for reminders.`;
  }
  const lines = blocks.map(formatBlock);
  const note = overlapNote(blocks);
  const pending = blocks.filter((t) => !t.done).length;
  let out = `Here's ${date}:\n${lines.map((l) => `• ${l}`).join("\n")}`;
  if (pending < blocks.length) {
    out += `\n\n${blocks.length - pending} done, ${pending} still to go.`;
  }
  if (note) out += `\n\n${note}`;
  return out;
}

export function summarizeWeek(tasks: Task[], weekStart: string): string {
  const blocks = weekTaskDates(tasks, weekStart);
  if (!blocks.length) {
    return "No timed blocks this week yet.";
  }
  const byDay = new Map<string, Task[]>();
  for (const t of blocks) {
    const list = byDay.get(t.date) ?? [];
    list.push(t);
    byDay.set(t.date, list);
  }
  const lines: string[] = [];
  for (const [date, dayBlocks] of [...byDay.entries()].sort()) {
    const label = dayBlocks.map(formatBlock).join(", ");
    lines.push(`• ${date}: ${label}`);
  }
  return `This week:\n${lines.join("\n")}`;
}

export function whatsNext(tasks: Task[], date = todayString()): string {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const blocks = dayTasks(tasks, date).filter((t) => !t.done);

  if (!blocks.length) {
    return date === todayString()
      ? "No more blocks today — you're clear!"
      : `Nothing left on ${date}.`;
  }

  const toMins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const upcoming = blocks.find((t) => toMins(t.startTime!) >= nowMins);
  if (upcoming) {
    return `Next up: ${upcoming.title} at ${upcoming.startTime}${upcoming.endTime ? `–${upcoming.endTime}` : ""}.`;
  }

  const current = blocks.find(
    (t) => t.endTime && toMins(t.startTime!) <= nowMins && nowMins < toMins(t.endTime)
  );
  if (current) {
    const nested = blocks.filter(
      (t) =>
        t.id !== current.id &&
        t.startTime! >= current.startTime! &&
        t.endTime! <= current.endTime!
    );
    if (nested.length) {
      return `You're in ${current.title} (${current.startTime}–${current.endTime}). Also on the calendar: ${nested.map((n) => n.title).join(", ")} — nested calls during work are fine.`;
    }
    return `You're in ${current.title} until ${current.endTime}.`;
  }

  return `Today's blocks are done or past. Last was ${blocks[blocks.length - 1].title}.`;
}

export function generateTodayAssistantReply(
  message: string,
  tasks: Task[],
  weekStart: string
): string {
  const msg = message.toLowerCase().trim();
  const today = todayString();

  if (!msg || /^(hi|hello|hey|yo)$/.test(msg)) {
    return summarizeToday(tasks, today);
  }

  if (/what.*(today|have|on)|today'?s plan|remind.*today|schedule today/.test(msg)) {
    return summarizeToday(tasks, today);
  }

  if (/what'?s next|coming up|next block|what now/.test(msg)) {
    return whatsNext(tasks, today);
  }

  if (/this week|week ahead|rest of.*week|upcoming week/.test(msg)) {
    return summarizeWeek(tasks, weekStart);
  }

  if (/tomorrow/.test(msg)) {
    return summarizeToday(tasks, addDays(today, 1));
  }

  if (/overlap|conflict|double|two at/.test(msg)) {
    const note = overlapNote(dayTasks(tasks, today));
    return (
      note ??
      "Overlapping blocks usually mean calls or breaks inside a longer work block — not a problem unless you want to change the calendar."
    );
  }

  if (/break|unpaid|zoom|call|meeting/.test(msg)) {
    return (
      "Breaks and calls inside a work block are normal — your calendar can show Work 10–18 with Zoom 11–12 inside it. I won't flag that as a conflict.\n\n" +
      summarizeToday(tasks, today)
    );
  }

  return (
    "I can tell you what's on today, what's next, or this week's schedule. Try: \"What's today?\", \"What's next?\", or \"This week\".\n\n" +
    summarizeToday(tasks, today)
  );
}

export function buildTodayScheduleContext(tasks: Task[], weekStart: string): string {
  return `TODAY (${todayString()}):\n${summarizeToday(tasks)}\n\nWEEK:\n${summarizeWeek(tasks, weekStart)}`;
}
