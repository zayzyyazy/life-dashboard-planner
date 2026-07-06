import { getSetting, setSetting } from "../db/index.js";
import {
  createNoteCommit,
  createNotePreview,
} from "./obsidian-brain.js";

const PENDING_KEY = "pending_obsidian_save";

export interface PendingObsidianSave {
  previewId: string;
  summary: string;
  sourceText: string;
  createdAt: string;
}

export function getPendingObsidianSave(): PendingObsidianSave | null {
  const raw = getSetting(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingObsidianSave;
  } catch {
    return null;
  }
}

export function setPendingObsidianSave(pending: PendingObsidianSave): void {
  setSetting(PENDING_KEY, JSON.stringify(pending));
}

export function clearPendingObsidianSave(): void {
  setSetting(PENDING_KEY, "");
}

function looksLikeYes(message: string): boolean {
  return /^(yes|y|yeah|yep|save|ok|okay|do it|confirm)\b/i.test(message.trim());
}

function looksLikeNo(message: string): boolean {
  return /^(no|n|nope|skip|cancel|don't)\b/i.test(message.trim());
}

function looksLikeEdit(message: string): boolean {
  return /^edit[:\s]/i.test(message.trim());
}

/** Handle yes/no/edit replies for pending Obsidian save. Returns reply text or null. */
export async function tryHandleObsidianPending(message: string): Promise<string | null> {
  const pending = getPendingObsidianSave();
  if (!pending) return null;

  const trimmed = message.trim();

  if (looksLikeYes(trimmed)) {
    try {
      const result = await createNoteCommit(pending.previewId);
      clearPendingObsidianSave();
      return `Saved to Obsidian: ${result.path}`;
    } catch (err) {
      clearPendingObsidianSave();
      return `Couldn't save to Obsidian: ${err instanceof Error ? err.message : "unknown error"}`;
    }
  }

  if (looksLikeNo(trimmed)) {
    clearPendingObsidianSave();
    return "Skipped Obsidian save.";
  }

  if (looksLikeEdit(trimmed)) {
    const edited = trimmed.replace(/^edit[:\s]*/i, "").trim() || pending.sourceText;
    try {
      const preview = await createNotePreview(edited);
      setPendingObsidianSave({
        previewId: preview.id,
        summary: preview.previewText.slice(0, 200),
        sourceText: edited,
        createdAt: new Date().toISOString(),
      });
      return `Updated preview:\n${preview.previewText.slice(0, 800)}\n\n💾 Save to Obsidian? Reply yes / no`;
    } catch (err) {
      return `Couldn't update preview: ${err instanceof Error ? err.message : "unknown error"}`;
    }
  }

  return null;
}

/** Create preview from content and store pending save offer. */
export async function offerObsidianSave(
  sourceText: string
): Promise<{ previewId: string; offerLine: string } | null> {
  try {
    const preview = await createNotePreview(sourceText);
    setPendingObsidianSave({
      previewId: preview.id,
      summary: preview.previewText.slice(0, 200),
      sourceText,
      createdAt: new Date().toISOString(),
    });
    return {
      previewId: preview.id,
      offerLine: "💾 Save to Obsidian? Reply yes / no / edit: …",
    };
  } catch (err) {
    console.error("[obsidian] offer save failed:", err);
    return null;
  }
}

export const OBSIDIAN_SAVE_OFFER_ACTIONS = new Set([
  "saved_project_update",
  "saved_knowledge",
  "saved_decision",
]);
