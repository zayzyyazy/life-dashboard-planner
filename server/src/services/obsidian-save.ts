import { getSetting, setSetting } from "../db/index.js";
import {
  createNoteCommit,
  createNotePreview,
  formatGitSyncFooter,
} from "./obsidian-brain.js";
import { buildSaveSourceText, saveOfferLine, formatAutoSaveMessage } from "./save-context.js";
import type { ConversationTurn } from "./memory.js";

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
  const trimmed = message.trim();
  // Only short standalone confirmations — not "Yeah let's start with battery..."
  if (trimmed.length > 20) return false;
  return /^(yes|y|yeah|yep|save|ok|okay|do it|confirm)[\s!.]*$/i.test(trimmed);
}

function looksLikeNo(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length > 12) return false;
  return /^(no|n|nope|skip|cancel)[\s!.]*$/i.test(trimmed);
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
      const paths = "paths" in result && Array.isArray(result.paths) ? result.paths : [result.path];
      const gitFooter = formatGitSyncFooter(result.gitSynced, result.gitError);
      return paths.length > 1
        ? `Saved to Obsidian:\n${paths.map((p) => `- ${p}`).join("\n")}${gitFooter}`
        : `Saved to Obsidian: ${result.path}${gitFooter}`;
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
  params: {
    userMessage: string;
    conversationTurns: ConversationTurn[];
    actionContext?: string;
    activeProject?: string | null;
    projectName?: string | null;
    saveIntent?: "capture" | "task" | "project_log" | "resource" | "daily_review";
  }
): Promise<{ previewId: string; offerLine: string; folderHint?: string } | null> {
  try {
    const sourceText = buildSaveSourceText({
      userMessage: params.userMessage,
      conversationTurns: params.conversationTurns,
      actionContext: params.actionContext,
      projectName: params.projectName ?? params.activeProject,
    });

    const preview = await createNotePreview(sourceText, {
      activeProject: params.activeProject,
      saveIntent: params.saveIntent ?? "capture",
    });

    const folderMatch = preview.previewText.match(/^Path: (.+)$/m);
    const folderHint = folderMatch?.[1]?.replace(/\/[^/]+\.md$/, "") ?? undefined;

    setPendingObsidianSave({
      previewId: preview.id,
      summary: preview.previewText.slice(0, 200),
      sourceText,
      createdAt: new Date().toISOString(),
    });
    return {
      previewId: preview.id,
      offerLine: saveOfferLine(folderHint),
      folderHint,
    };
  } catch (err) {
    console.error("[obsidian] offer save failed:", err);
    return null;
  }
}

/** Auto-save: preview + commit immediately. No yes/no. */
export async function autoSaveToObsidian(
  params: {
    userMessage: string;
    conversationTurns: ConversationTurn[];
    actionContext?: string;
    activeProject?: string | null;
    projectName?: string | null;
    saveIntent?: "capture" | "task" | "project_log" | "resource" | "daily_review";
  }
): Promise<{ paths: string[]; message: string } | null> {
  try {
    const sourceText = buildSaveSourceText({
      userMessage: params.userMessage,
      conversationTurns: params.conversationTurns,
      actionContext: params.actionContext,
      projectName: params.projectName ?? params.activeProject,
    });

    const preview = await createNotePreview(sourceText, {
      activeProject: params.projectName ?? params.activeProject,
      saveIntent: params.saveIntent ?? "project_log",
    });

    const result = await createNoteCommit(preview.id);
    const paths = "paths" in result && Array.isArray(result.paths) ? result.paths : [result.path];
    const gitFooter = formatGitSyncFooter(result.gitSynced, result.gitError);
    return {
      paths,
      message:
        formatAutoSaveMessage({
          paths,
          action: "action" in result ? (result.action as "merged" | "created") : "created",
          message: result.message,
          deletedDuplicates:
            "deletedDuplicates" in result && Array.isArray(result.deletedDuplicates)
              ? result.deletedDuplicates
              : [],
        }) + gitFooter,
    };
  } catch (err) {
    console.error("[obsidian] auto save failed:", err);
    return null;
  }
}

export const OBSIDIAN_SAVE_OFFER_ACTIONS = new Set([
  "saved_project_update",
  "saved_knowledge",
  "saved_decision",
  "evolving_project",
]);
