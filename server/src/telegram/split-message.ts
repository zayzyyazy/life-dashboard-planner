/** Split long text for Telegram — prefer paragraphs, sentences, then words (never mid-word with …). */
export function splitMessage(text: string, maxLen: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    const splitAt = findSplitPoint(remaining, maxLen);
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

function findSplitPoint(text: string, maxLen: number): number {
  const window = text.slice(0, maxLen);

  let at = window.lastIndexOf("\n\n");
  if (at > maxLen * 0.35) return at;

  at = window.lastIndexOf("\n");
  if (at > maxLen * 0.35) return at;

  // Last sentence ending in window (. ! ?)
  for (let i = window.length - 1; i >= maxLen * 0.35; i--) {
    const c = window[i];
    if ((c === "." || c === "!" || c === "?") && (i === window.length - 1 || window[i + 1] === " ")) {
      return i + 1;
    }
  }

  at = window.lastIndexOf(" ");
  if (at > maxLen * 0.35) return at;

  return maxLen;
}
