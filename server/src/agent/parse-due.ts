/** Quick relative date parsing — no LLM needed for common patterns. */
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

  if (/\btoday\b/.test(text)) {
    const d = new Date(now);
    const at = parseAtTime(message, d);
    return at.toISOString();
  }

  if (/\btomorrow\b/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    const at = parseAtTime(message, d);
    return at.toISOString();
  }

  const weekday = text.match(
    /\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  );
  if (weekday) {
    const d = nextWeekday(weekday[2], Boolean(weekday[1]), now);
    const at = parseAtTime(message, d);
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

function nextWeekday(name: string, forceNext: boolean, now: Date): Date {
  const target = WEEKDAYS[name.toLowerCase()] ?? 1;
  const d = new Date(now);
  const current = d.getDay();
  let delta = target - current;
  if (delta <= 0 || forceNext) delta += 7;
  if (!forceNext && delta === 0) delta = 7;
  d.setDate(d.getDate() + delta);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function normalizeDueAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
