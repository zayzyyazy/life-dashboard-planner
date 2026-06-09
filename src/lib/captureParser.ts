import { parseDayMentionFromText, todayString, type DayParseOptions } from "./dateUtils";
import { parseTimeRangeFromText } from "./scheduleUtils";
import { inferPriority, inferTag } from "./taskUtils";
import type { SuggestedTask, TaskKind } from "../types/task";

const DAY_WORDS =
  "monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";

const MULTI_DAY_RE = new RegExp(
  `\\b(?:next\\s+week\\s+)?(?:${DAY_WORDS})\\b`,
  "gi"
);

const ACTIVITY_PREFIX = /\b(work|uni|university|gym|study|lecture|meeting|class|shift)\s*$/i;

function splitByWeekdays(text: string): string[] | null {
  const matches = [...text.matchAll(MULTI_DAY_RE)];
  if (matches.length <= 1) return null;

  const clauseStartAt = (dayIndex: number): number => {
    const dayStart = matches[dayIndex].index!;
    const prefix = text.slice(0, dayStart);
    const activity = prefix.match(ACTIVITY_PREFIX);
    return activity ? dayStart - activity[0].length : dayStart;
  };

  const clauses: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const clauseStart = clauseStartAt(i);
    const clauseEnd = i + 1 < matches.length ? clauseStartAt(i + 1) : text.length;
    const clause = text.slice(clauseStart, clauseEnd).trim();
    if (clause.length > 1) clauses.push(clause);
  }

  return clauses.length > 1 ? clauses : null;
}

function splitCaptureClauses(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const byWeekdays = splitByWeekdays(trimmed);
  if (byWeekdays) return byWeekdays;

  const chunks = trimmed.split(/\n|;/).map((s) => s.trim()).filter((s) => s.length > 1);
  const source = chunks.length ? chunks : [trimmed];
  const splitRe = new RegExp(
    `\\.\\s*(?=(?:next\\s+(?:week\\s+)?)?(?:${DAY_WORDS})\\b)`,
    "i"
  );

  const clauses: string[] = [];
  for (const chunk of source) {
    const byDaysInChunk = splitByWeekdays(chunk);
    if (byDaysInChunk) {
      clauses.push(...byDaysInChunk);
      continue;
    }
    const parts = chunk.split(splitRe).map((s) => s.replace(/^\.+/, "").trim());
    for (const part of parts) {
      if (part.length > 1) clauses.push(part);
    }
  }

  return clauses.length ? clauses : [trimmed];
}

function parseHours(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(?:h|hour|hours)/i);
  return m ? Number(m[1]) : undefined;
}

export function inferKind(text: string, hasTime: boolean): TaskKind {
  const lower = text.toLowerCase();
  if (/\b(remind\s+me|don't forget|do not forget|remember\s+to)\b/.test(lower)) {
    return "reminder";
  }
  if (
    hasTime &&
    /\b(work|shift|uni|university|lecture|class|meeting|appointment|gym|training)\b/.test(
      lower
    )
  ) {
    return "event";
  }
  if (hasTime && /\b(from|until|to)\b/.test(lower)) {
    return "event";
  }
  if (/\b(finish|submit|complete|write|buy|call|send|prepare|review)\b/.test(lower)) {
    return "task";
  }
  return hasTime ? "event" : "task";
}

function buildTitle(segment: string): string {
  const lower = segment.toLowerCase();
  if (/\bwork\b/.test(lower)) return "Work";
  if (/\buni\b|university/.test(lower)) return "Uni";
  if (/\blecture\b/.test(lower)) return "Lecture";
  if (/\bmeeting\b/.test(lower)) return "Meeting";
  if (/\bclass\b/.test(lower)) return "Class";
  if (/\bgym\b|workout/.test(lower)) return "Gym";
  if (/\bstudy\b/.test(lower)) return "Study";

  const cleaned = segment
    .replace(
      /\b(next\s+week|next|this|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|tomorrow|today)\b/gi,
      ""
    )
    .replace(/\b(i have|i've got|from|to|until)\b/gi, "")
    .replace(/\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:to|-|–)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, "")
    .replace(/\b\d{1,2}\s*-\s*\d{1,2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length > 2) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1, 60);
  }
  return segment.trim().slice(0, 60) || "Captured item";
}

function parseClause(
  clause: string,
  fallbackDate: string,
  dayOptions?: DayParseOptions
): SuggestedTask {
  const date = parseDayMentionFromText(clause, dayOptions) ?? fallbackDate;
  const times = parseTimeRangeFromText(clause);
  const kind = inferKind(clause, Boolean(times));
  const title = buildTitle(clause);

  return {
    title,
    date,
    tag: inferTag(clause),
    priority: inferPriority(clause),
    kind,
    estimatedHours: times?.estimatedHours ?? parseHours(clause),
    startTime: times?.startTime,
    endTime: times?.endTime,
    notes: clause.trim(),
  };
}

export type CaptureParseOptions = DayParseOptions;

/** Parse free text into multiple smart suggestions (events, tasks, reminders) */
export function parseCaptureText(text: string, options?: CaptureParseOptions): SuggestedTask[] {
  const fallbackDate = todayString();
  const clauses = splitCaptureClauses(text);
  return clauses.map((clause) => parseClause(clause, fallbackDate, options));
}

/** True when message looks like schedule details, not a vague plan request */
export function hasScheduleDetails(text: string): boolean {
  const lower = text.toLowerCase();
  if (parseTimeRangeFromText(text)) return true;
  if (parseDayMentionFromText(text)) return true;
  if (/\b(work|uni|lecture|meeting|class|gym)\b/.test(lower) && /\d/.test(lower)) {
    return true;
  }
  if (splitCaptureClauses(text).length > 1) return true;
  return false;
}
