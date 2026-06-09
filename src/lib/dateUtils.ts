/** Local calendar date as YYYY-MM-DD (never use toISOString — it shifts days in US timezones). */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayString(): string {
  return toDateString(new Date());
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatHeaderDate(date = new Date()): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function getWeekNumber(date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(date = new Date()): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function weekDays(date = new Date()): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function dayName(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

export function shortDayName(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export function isSameDay(a: string, b: string): boolean {
  return a === b;
}

export function isOverdue(dateStr: string, done: boolean): boolean {
  return !done && dateStr < todayString();
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

export function daysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const last = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= last; i++) {
    days.push(new Date(year, month, i));
  }
  return days;
}

export function monthLabel(date = new Date()): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const WEEKDAY_ALIASES: [RegExp, number][] = [
  [/\bmon(?:day)?\b/, 0],
  [/\btues?(?:day)?\b/, 1],
  [/\bwed(?:nesday)?\b/, 2],
  [/\bthu(?:rsday)?\b/, 3],
  [/\bfri(?:day)?\b/, 4],
  [/\bsat(?:urday)?\b/, 5],
  [/\bsun(?:day)?\b/, 6],
];

function weekdayDate(weekdayIndex: number, weekOffset: number): string {
  const start = startOfWeek();
  const d = new Date(start);
  d.setDate(start.getDate() + weekdayIndex + weekOffset * 7);
  return toDateString(d);
}

function weekdayIndexFromText(lower: string): number | undefined {
  for (let i = 0; i < WEEKDAY_NAMES.length; i++) {
    const name = WEEKDAY_NAMES[i];
    if (lower.includes(name) || new RegExp(`\\bnext\\s+${name}\\b`).test(lower)) {
      return i;
    }
  }
  for (const [re, idx] of WEEKDAY_ALIASES) {
    if (re.test(lower)) return idx;
  }
  return undefined;
}

export type DayParseOptions = {
  /** When set, bare weekday names resolve to that calendar week (0=this, 1=next) */
  defaultWeekOffset?: number;
};

/** Parse "Monday", "next week Monday", "wed", "tomorrow", etc. into YYYY-MM-DD */
export function parseDayMentionFromText(text: string, options?: DayParseOptions): string | undefined {
  const lower = text.toLowerCase();
  const today = todayString();
  const nextWeek = /\bnext\s+week\b/.test(lower);
  const weekdayIndex = weekdayIndexFromText(lower);

  if (weekdayIndex !== undefined) {
    const name = WEEKDAY_NAMES[weekdayIndex];
    const explicitNext = new RegExp(`\\bnext\\s+${name}\\b`).test(lower);

    if (nextWeek || explicitNext) {
      return weekdayDate(weekdayIndex, 1);
    }

    const forcedOffset = options?.defaultWeekOffset;
    if (forcedOffset !== undefined && forcedOffset > 0) {
      return weekdayDate(weekdayIndex, forcedOffset);
    }

    const thisWeekDate = weekdayDate(weekdayIndex, 0);
    if (thisWeekDate < today) {
      return weekdayDate(weekdayIndex, 1);
    }
    return thisWeekDate;
  }

  if (lower.includes("tomorrow")) return addDays(today, 1);
  if (lower.includes("today")) return today;
  return undefined;
}

/** Fix AI/human dates: day names → this week, stale years → current year */
export function normalizeTaskDate(raw: string): string {
  const today = todayString();
  const currentYear = new Date().getFullYear();
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return today;

  const lower = trimmed.toLowerCase();
  const days = weekDays();
  for (let i = 0; i < WEEKDAY_NAMES.length; i++) {
    if (lower === WEEKDAY_NAMES[i] || lower.startsWith(WEEKDAY_NAMES[i])) {
      return toDateString(days[i]);
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    let year = parseInt(trimmed.slice(0, 4), 10);
    let normalized = trimmed;
    let yearFixed = false;
    if (year < currentYear) {
      normalized = `${currentYear}${trimmed.slice(4)}`;
      year = currentYear;
      yearFixed = true;
    }
    // Only bump stale-year fixes; keep intentional past days in the current week
    if (yearFixed && normalized < today) {
      return today;
    }
    return normalized;
  }

  return today;
}
