/** Turn thrown errors into something useful in Telegram instead of "Something went wrong." */
export function formatTelegramError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (/429|quota|rate.?limit|billing/i.test(msg)) {
    return (
      "OpenAI quota exceeded — I can't think right now.\n\n" +
      "Fix: add credits at platform.openai.com → Billing.\n\n" +
      "Reminders still work if you reply with just a time (e.g. `12pm`, `in 5 min`)."
    );
  }

  if (/OPENAI_API_KEY|api key/i.test(msg)) {
    return "OPENAI_API_KEY missing or invalid in .env — restart after fixing.";
  }

  if (/ENOTFOUND|fetch failed|network/i.test(msg)) {
    return "Network error — I'll retry when connection is back. Try again in a minute.";
  }

  return "Something went wrong. Please try again.";
}
