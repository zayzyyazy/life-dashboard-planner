import path from "node:path";
import { config, assertAiKey, assertVaultPath } from "../config.js";
import { getAllIndexedNotes, getIndexStats, initIndexDb } from "../index/db.js";
import { ensureIndexed, fullReindex, indexSingleFile } from "../index/watcher.js";
import { searchNotes, listNotesByFolder } from "../search/fts.js";
import { findRelatedNotes, findDuplicateCandidates } from "../search/related.js";
import { readNote, listMarkdownFiles } from "../vault/reader.js";
import { writeNote, moveNote, rewriteNoteBody, slugify } from "../vault/writer.js";
import {
  structureCapture,
  structuredToNoteInput,
} from "../ai/structure.js";
import { handleAsk } from "../ai/qa.js";
import {
  proposeOrganization,
  formatOrganizePreview,
} from "../ai/organize.js";
import {
  savePreview,
  loadPreview,
  deletePreview,
  newPreviewId,
  listPendingPreviews,
  type CreateNotePreview,
} from "../actions/previewStore.js";
import { auditLog } from "../ai/provider.js";

let initialized = false;

export async function initBrain(): Promise<void> {
  if (initialized) return;
  assertVaultPath();
  await initIndexDb();
  await ensureIndexed(config.vaultPath);
  const { startVaultWatcher } = await import("../index/watcher.js");
  startVaultWatcher(config.vaultPath);
  initialized = true;
}

export async function getVaultStatus() {
  await initBrain();
  const stats = getIndexStats();
  const pending = await listPendingPreviews();
  return {
    vaultPath: config.vaultPath,
    noteCount: stats.noteCount,
    lastModified: stats.lastModified,
    pendingPreviews: pending.length,
    aiProvider: config.aiProvider,
  };
}

export async function listNotes(folder?: string) {
  await initBrain();
  if (folder) {
    return listNotesByFolder(folder);
  }
  const paths = await listMarkdownFiles(config.vaultPath);
  return paths.map((p) => ({ path: p }));
}

export async function readNoteByPath(notePath: string) {
  await initBrain();
  return readNote(config.vaultPath, notePath);
}

export async function searchVault(query: string, limit?: number) {
  await initBrain();
  return searchNotes(query, limit);
}

export async function findRelated(query: string, limit = 8) {
  await initBrain();
  const notes = getAllIndexedNotes();
  return findRelatedNotes(query, notes, [], limit);
}

export async function askBrain(question: string) {
  await initBrain();
  assertAiKey();
  return handleAsk(config.vaultPath, question);
}

export async function createNotePreview(rawText: string) {
  await initBrain();
  assertAiKey();

  const notes = getAllIndexedNotes();
  const prelimDuplicates = findDuplicateCandidates(rawText, rawText, [], notes);
  const contextSnippets = prelimDuplicates.map(
    (d) => `${d.path}: ${d.title}`
  );

  const structured = await structureCapture(rawText, contextSnippets);
  const noteInput = structuredToNoteInput(structured);
  const date = new Date().toISOString().slice(0, 10);
  const relPath = path
    .join(noteInput.folder ?? "00-Inbox", `${date}-${slugify(noteInput.title)}.md`)
    .replace(/\\/g, "/");

  const duplicates = findDuplicateCandidates(
    structured.title,
    structured.body,
    structured.anchors,
    notes
  );

  const id = newPreviewId();
  const preview: CreateNotePreview = {
    kind: "create_note",
    id,
    createdAt: new Date().toISOString(),
    rawInput: rawText,
    noteInput,
    relPath,
    duplicateWarnings: duplicates,
    structuredSummary: structured.shortSummary,
  };

  await savePreview(preview);
  await auditLog("create_note_preview", relPath);

  let text = [
    `Preview ID: ${id}`,
    `Path: ${relPath}`,
    `Title: ${noteInput.title}`,
    `Category: ${noteInput.category}`,
    `Summary: ${structured.shortSummary}`,
    "",
    "Body preview:",
    noteInput.body.slice(0, 600) + (noteInput.body.length > 600 ? "…" : ""),
  ].join("\n");

  if (duplicates.length > 0) {
    text +=
      "\n\n⚠️ Possible duplicates:\n" +
      duplicates.map((d) => `- ${d.path} (${d.title}, score ${d.score.toFixed(2)})`).join("\n");
  }

  text += `\n\nCommit with create_note_commit(previewId: "${id}")`;

  return { id, previewText: text, duplicates };
}

export async function createNoteCommit(previewId: string) {
  await initBrain();
  const preview = await loadPreview(previewId);
  if (!preview || preview.kind !== "create_note") {
    throw new Error(`Preview not found: ${previewId}`);
  }

  const relPath = await writeNote(config.vaultPath, preview.noteInput, {
    filename: path.basename(preview.relPath),
  });
  await indexSingleFile(config.vaultPath, relPath);
  await deletePreview(previewId);
  await auditLog("create_note_commit", relPath);

  return { path: relPath, message: `Created note at ${relPath}` };
}

export async function organizeNotePreview(notePath: string) {
  await initBrain();
  assertAiKey();

  const note = await readNote(config.vaultPath, notePath);
  const relatedHits = findRelatedNotes(
    `${note.title} ${note.body}`,
    getAllIndexedNotes(),
    [],
    5
  ).filter((h) => h.path !== notePath);

  const related = [];
  for (const hit of relatedHits) {
    try {
      related.push(await readNote(config.vaultPath, hit.path));
    } catch {
      // skip
    }
  }

  const proposal = await proposeOrganization(note, related);
  const id = newPreviewId();

  await savePreview({
    kind: "organize_note",
    id,
    createdAt: new Date().toISOString(),
    sourcePath: notePath,
    proposal,
    previewText: formatOrganizePreview(notePath, proposal),
  });

  await auditLog("organize_note_preview", notePath);

  return {
    id,
    previewText: formatOrganizePreview(notePath, proposal) + `\n\nCommit with organize_note_commit(previewId: "${id}")`,
  };
}

export async function organizeNoteCommit(previewId: string) {
  await initBrain();
  const preview = await loadPreview(previewId);
  if (!preview || preview.kind !== "organize_note") {
    throw new Error(`Preview not found: ${previewId}`);
  }

  const { sourcePath, proposal } = preview;
  const wikilinkBlock =
    proposal.wikilinks.length > 0
      ? `\n\n## Related\n${proposal.wikilinks.map((l) => `- [[${l}]]`).join("\n")}`
      : "";
  const body = proposal.revisedBody + wikilinkBlock;

  const newPath = await moveNote(config.vaultPath, sourcePath, proposal.targetPath, {
    status: "filed",
    tags: proposal.tags,
  });

  await rewriteNoteBody(config.vaultPath, newPath, body, {
    status: "filed",
    tags: proposal.tags,
  });

  await deleteNoteFromIndexSafe(sourcePath);
  await indexSingleFile(config.vaultPath, newPath);
  await deletePreview(previewId);
  await auditLog("organize_note_commit", `${sourcePath} -> ${newPath}`);

  return {
    from: sourcePath,
    to: newPath,
    message: `Moved ${sourcePath} → ${newPath}`,
  };
}

async function deleteNoteFromIndexSafe(relPath: string) {
  const { deleteNoteFromIndex } = await import("../index/db.js");
  deleteNoteFromIndex(relPath);
}

export async function reindexVault() {
  await initBrain();
  const count = await fullReindex(config.vaultPath);
  return { noteCount: count };
}
