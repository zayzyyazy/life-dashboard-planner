import { config } from "../config.js";

/** Ensure Date parsing and SQLite time align with user's configured timezone. */
export function applyProcessTimezone(): void {
  process.env.TZ = config.brief.timezone;
}

/** Status/availability — NOT a reminder request. */
export function looksLikeStatusUpdate(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (t.length > 200) return false;
  if (/^remind\s+me\b/.test(t) || /\bremind\s+me\s+(to|at|in|on)\b/.test(t)) return false;
  if (/\btask\s*:/.test(t) || /\badd\s+task\b/.test(t)) return false;

  return (
    /\b(in|at)\s+(uni|university|school|campus|work|office|home|the office)\b/.test(t) ||
    /\b(busy|free|available|unavailable)\b/.test(t) ||
    /\buntil\s+\d{1,2}(?::\d{2})?\b/.test(t) ||
    (/\b(today|tomorrow)\b/.test(t) &&
      /\b(in|at|until|from|back|done|finished)\b/.test(t) &&
      !/\b(remind|reminder)\b/.test(t))
  );
}

/** Parse natural-language due times — handles in X min, at 23:30, on Thursday, etc. */
export function parseDueDate(message: string, now = new Date()): string | null {
  if (looksLikeStatusUpdate(message)) return null;

  const text = message.toLowerCase();

  const inMin = text.match(/\bin\s+(\d+)\s*(min|mins?|minutes?)\b/);
  if (inMin) {
    const d = new Date(now);
    d.setMinutes(d.getMinutes() + parseInt(inMin[1], 10));
    return d.toISOString();
  }

  if (/\bin\s+half\s+an?\s+hour\b/.test(text) || /\bin\s+a\s+half\s+hour\b/.test(text)) {
    const d = new Date(now);
    d.setMinutes(d.getMinutes() + 30);
    return d.toISOString();
  }

  if (/\btomorrow\s+morning\b/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }

  if (/\btomorrow\s+evening\b/.test(text) || /\btomorrow\s+night\b/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(20, 0, 0, 0);
    return d.toISOString();
  }

  if (/\bnext\s+week\b/.test(text)) {
    const weekday = text.match(
      /\bnext\s+week\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
    );
    if (weekday) {
      const d = resolveWeekday(weekday[1], true, now);
      d.setDate(d.getDate() + 7);
      const at = parseAtTime(message, d);
      return at.toISOString();
    }
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

  if (/\btoday\b/.test(text) && /\b(remind|reminder|ping me|notify)\b/.test(text)) {
    const d = new Date(now);
    const at = parseAtTime(message, d);
    return at.toISOString();
  }

  // "remind me 12pm" / "remind me at noon"
  if (/\b(remind|reminder|ping me|notify)\b/.test(text)) {
    const remindTime =
      text.match(/\b(?:remind\s+me\s+|at\s+)(\d{1,2})\s*(am|pm)\b/i) ??
      text.match(/\b(?:remind\s+me\s+|at\s+)(noon|midnight)\b/i);
    if (remindTime) {
      const d = new Date(now);
      if (remindTime[1]?.toLowerCase() === "noon") {
        d.setHours(12, 0, 0, 0);
      } else if (remindTime[1]?.toLowerCase() === "midnight") {
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 1);
      } else {
        let hours = parseInt(remindTime[1], 10);
        const ampm = remindTime[2]?.toLowerCase();
        if (ampm === "pm" && hours < 12) hours += 12;
        if (ampm === "am" && hours === 12) hours = 0;
        d.setHours(hours, 0, 0, 0);
      }
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
  }

  // "at 23:30" without today/tomorrow — only when clearly scheduling
  if (/\b(remind|reminder|ping me|notify)\b/.test(text) && /\bat\s+\d{1,2}/i.test(message)) {
    const d = new Date(now);
    let at = parseAtTime(message, d);
    if (at.getTime() <= now.getTime()) {
      at = new Date(at);
      at.setDate(at.getDate() + 1);
    }
    return at.toISOString();
  }

  const bare = parseBareDateTime(message, now);
  if (bare) return bare;

  return null;
}

/** "23:36", "Jul 2nd 23:35", "2 Jul 23:35" */
export function parseBareDateTime(text: string, now = new Date()): string | null {
  const t = text.trim();

  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const d = new Date(now);
    d.setHours(parseInt(hm[1], 10), parseInt(hm[2], 10), 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }

  const ampm = t.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (ampm) {
    const d = new Date(now);
    let hours = parseInt(ampm[1], 10);
    if (ampm[2].toLowerCase() === "pm" && hours < 12) hours += 12;
    if (ampm[2].toLowerCase() === "am" && hours === 12) hours = 0;
    d.setHours(hours, 0, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }

  if (/^noon$/i.test(t)) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }

  const m1 = t.match(/^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{1,2}):(\d{2})$/i);
  if (m1) {
    return dateFromMonthDay(m1[1], parseInt(m1[2], 10), parseInt(m1[3], 10), parseInt(m1[4], 10), now);
  }

  const m2 = t.match(/^(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?\s+(\d{1,2}):(\d{2})$/i);
  if (m2) {
    const year = m2[3] ? parseInt(m2[3], 10) : now.getFullYear();
    return dateFromMonthDay(m2[2], parseInt(m2[1], 10), parseInt(m2[4], 10), parseInt(m2[5], 10), now, year);
  }

  const wdOnly = t.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i);
  if (wdOnly) {
    const d = resolveWeekday(wdOnly[1], false, now);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }

  return null;
}

function dateFromMonthDay(
  monthStr: string,
  day: number,
  hours: number,
  minutes: number,
  now: Date,
  year = now.getFullYear()
): string | null {
  const months: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
    dec: 11, december: 11,
  };
  const m = months[monthStr.toLowerCase().slice(0, 3)];
  if (m === undefined) return null;
  const d = new Date(year, m, day, hours, minutes, 0, 0);
  return d.toISOString();
}

function parseAtTime(message: string, base: Date): Date {
  const d = new Date(base);

  // "until 17" or "until 17:30" when scheduling
  const untilMatch = message.match(/\buntil\s+(\d{1,2})(?::(\d{2}))?\b/i);
  if (untilMatch) {
    let hours = parseInt(untilMatch[1], 10);
    const minutes = untilMatch[2] ? parseInt(untilMatch[2], 10) : 0;
    if (hours <= 23) {
      d.setHours(hours, minutes, 0, 0);
      return d;
    }
  }

  const match =
    message.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i) ||
    message.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!match) {
    if (d.getHours() === 0 && d.getMinutes() === 0) {
      d.setHours(9, 0, 0, 0);
    }
    return d;
  }
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase();
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

/** Human confirmation: local time + timezone + "in X min" for short reminders */
export function formatReminderConfirmation(iso: string): string {
  const due = new Date(iso);
  const now = new Date();
  const mins = Math.round((due.getTime() - now.getTime()) / 60_000);
  const when = formatDueForUser(iso);
  const tz = config.brief.timezone;
  if (mins > 0 && mins <= 180) {
    return `${when} (${tz}) — ping in ~${mins} min`;
  }
  return `${when} (${tz})`;
}

export function extractReminderContent(message: string): string {
  return message
    .replace(/^remind\s+me\s+(to\s+)?/i, "")
    .replace(/\b(?:on\s+)?(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\b(?:tomorrow|today)\b/gi, "")
    .replace(/\bin\s+\d+\s*(?:min|mins|minute|minutes|hour|hours|hr|hrs)\b/gi, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, "")
    .replace(/\buntil\s+\d{1,2}(?::\d{2})?\b/gi, "")
    .replace(/\b\d{1,2}:\d{2}\b/g, "")
    .replace(/^\s*to\s+/i, "")
    .trim() || message.trim();
}

export function looksLikeReminder(message: string): boolean {
  if (looksLikeStatusUpdate(message)) return false;

  const t = message.toLowerCase();
  const hasClock = /\b\d{1,2}:\d{2}\b/.test(t) || /\bat\s+\d{1,2}\b/.test(t);
  const hasWeekday = /\b(?:on\s+)?(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(t);
  return (
    /^remind\s+me\b/.test(t) ||
    /\bremind\s+me\s+(to|about|at|in|on)\b/.test(t) ||
    (/\b(remind|remember)\b/.test(t) && /\bin\s+\d+\s*min/.test(t)) ||
    (hasWeekday && hasClock && /\b(remind|reminder)\b/.test(t)) ||
    (/\b(call|text|ping)\b/.test(t) && (hasWeekday || hasClock) && /\b(remind|at|on)\b/.test(t))
  );
}

export function looksLikeTimeFollowUp(message: string): boolean {
  const t = message.trim();
  if (t.length > 60) return false;
  return (
    /^\d{1,2}:\d{2}$/.test(t) ||
    /^\d{1,2}\s*(am|pm)$/i.test(t) ||
    /^(noon|midnight)$/i.test(t) ||
    /^in\s+\d+\s*(min|mins?|minutes?|hours?|hrs?)\b/i.test(t) ||
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(t) ||
    /^(\w+\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{1,2}:\d{2})$/i.test(t) ||
    /^(\d{1,2}\s+\w+\s+\d{1,2}:\d{2})$/i.test(t)
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
