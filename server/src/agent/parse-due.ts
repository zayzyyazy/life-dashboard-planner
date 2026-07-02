import { config } from "../config.js";

/** Parse natural-language due times — handles in X min, at 23:30, on Thursday, etc. */
export function parseDueDate(message: string, now = new Date()): string | null {
  const text = message.toLowerCase();

  const inMin = text.match(/\bin\s+(\d+)\s*(min|mins|minute|minutes)\b/);
  if (inMin) {
    const d = new Date(now);
    d.setMinutes(d.getMinutes() + parseInt(inMin[1], 10));
    return d.toISOString();
  }

  const inHours = text.match(/\bin\s+(\d+)\s*(hour|hours|hr|hrs)\b/);
  if (inHours) {
    const d = new Date(now);
    d.setHours(d.getHours() + parseInt(inHours[1], 10));
    return d.toISOString();
  }

  const weekday = text.match(
    /\b(?:on\s+)?(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  );
  if (weekday) {
    const d = resolveWeekday(weekday[2], Boolean(weekday[1]), now);
    const at = parseAtTime(message, d);
    return at.toISOString();
  }

  if (/\btomorrow\b/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    const at = parseAtTime(message, d);
    return at.toISOString();
  }

  if (/\btoday\b/.test(text)) {
    const d = new Date(now);
    const at = parseAtTime(message, d);
    return at.toISOString();
  }

  // "at 23:30" / "at 11pm" without today/tomorrow → today if still ahead, else tomorrow
  if (/\bat\s+\d{1,2}/i.test(message)) {
    const d = new Date(now);
    let at = parseAtTime(message, d);
    if (at.getTime() <= now.getTime()) {
      at = new Date(at);
      at.setDate(at.getDate() + 1);
    }
    return at.toISOString();
  }

  return null;
}

function parseAtTime(message: string, base: Date): Date {
  const d = new Date(base);
  const match = message.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) {
    if (d.getHours() === 0 && d.getMinutes() === 0) {
      d.setHours(9, 0, 0, 0);
    }
    return d;
  }
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase();
  // 24h: 23:30 without am/pm
  if (!ampm && hours <= 23) {
    d.setHours(hours, minutes, 0, 0);
    return d;
  }
  if (ampm === "pm" && hours < 12) hours += 12;
  if (ampm === "am" && hours === 12) hours = 0;
  d.setHours(hours, minutes, 0, 0);
  return d;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function resolveWeekday(name: string, forceNext: boolean, now: Date): Date {
  const target = WEEKDAYS[name.toLowerCase()] ?? 1;
  const d = new Date(now);
  const current = d.getDay();
  let delta = target - current;
  if (delta < 0) delta += 7;
  if (forceNext && delta === 0) delta = 7;
  // Same weekday (e.g. "Thursday" on Thursday) → today, not next week
  d.setDate(d.getDate() + delta);
  return d;
}

export function normalizeDueAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function formatDueForUser(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: config.brief.timezone,
    });
  } catch {
    return iso.slice(0, 16);
  }
}

export function extractReminderContent(message: string): string {
  return message
    .replace(/^remind\s+me\s+(to\s+)?/i, "")
    .replace(/\b(?:on\s+)?(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\b(?:tomorrow|today)\b/gi, "")
    .replace(/\bin\s+\d+\s*(?:min|mins|minute|minutes|hour|hours|hr|hrs)\b/gi, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, "")
    .replace(/^\s*to\s+/i, "")
    .trim() || message.trim();
}

export function looksLikeReminder(message: string): boolean {
  const t = message.toLowerCase();
  return (
    /^remind\s+me\b/.test(t) ||
    /\bremind\s+me\s+(to|about|at|in|on)\b/.test(t) ||
    (/\b(remind|remember)\b/.test(t) && (/\bin\s+\d+\s*min/.test(t) || /\bat\s+\d/.test(t))) ||
    (/\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(t) &&
      /\bat\s+\d{1,2}/.test(t))
  );
}

export function looksLikeReminderComplaint(message: string): boolean {
  const t = message.toLowerCase();
  return (
    /\b(didn't|didnt|never|hasn't|havent)\s+remind/.test(t) ||
    /\bu\s+didnt\s+remind/.test(t) ||
    /\bno\s+reminder\b/.test(t) ||
    /\bwhere('s| is)\s+my\s+reminder/.test(t)
  );
}
