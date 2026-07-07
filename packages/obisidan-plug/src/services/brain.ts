import path from "node:path";
import { config, assertAiKey, assertVaultPath } from "../config.js";
import { getAllIndexedNotes, getIndexStats, initIndexDb } from "../index/db.js";
import { ensureIndexed, fullReindex, indexSingleFile } from "../index/watcher.js";
import { searchNotes, listNotesByFolder } from "../search/fts.js";
import { findRelatedNotes, findDuplicateCandidates } from "../search/related.js";
import { readNote, listMarkdownFiles } from "../vault/reader.js";
import { moveNote, rewriteNoteBody, slugify, appendToDailyNote, appendToProjectLog } from "../vault/writer.js";
import {
  writeOrMergeNote,
  dedupeProjectNotes,
  resolveCanonicalFolderSlug,
  cleanupVault,
} from "../vault/dedupe.js";
import {
  structureCapture,
  structuredToNoteInput,
} from "../ai/structure.js";
import {
  extractVaultFolders,
  inferExtraWrites,
  listVaultFolderTree,
  projectSlugFromName,
  type StructureContext,
} from "../routing/resolveDestinations.js";
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

export async function createNotePreview(
  rawText: string,
  routingContext: StructureContext = {}
) {
  await initBrain();
  assertAiKey();

  const notes = getAllIndexedNotes();
  const prelimDuplicates = findDuplicateCandidates(rawText, rawText, [], notes);
  const contextSnippets = prelimDuplicates.map(
    (d) => `${d.path}: ${d.title}`
  );

  const vaultFolders = [
    ...new Set([
      ...extractVaultFolders(notes),
      ...(await listVaultFolderTree(config.vaultPath)),
    ]),
  ];

  const structured = await structureCapture(
    rawText,
    contextSnippets,
    routingContext,
    vaultFolders
  );
  const noteInput = structuredToNoteInput(structured);
  const date = new Date().toISOString().slice(0, 10);

  // Named project from conversation → primary folder is 03-Projects/{slug}
  // Reuse an existing project folder if this is a variant of one (no new folders).
  if (routingContext.activeProject?.trim()) {
    const rawSlug = projectSlugFromName(routingContext.activeProject);
    const slug = resolveCanonicalFolderSlug(rawSlug, notes);
    noteInput.folder = `03-Projects/${slug}`;
    noteInput.status = "filed";
  } else if (noteInput.folder?.startsWith("03-Projects/") || noteInput.folder?.startsWith("02-Areas/Building/")) {
    const prefix = noteInput.folder.startsWith("03-Projects/")
      ? "03-Projects/"
      : "02-Areas/Building/";
    const rawSlug = noteInput.folder.slice(prefix.length).split("/")[0]!;
    const slug = resolveCanonicalFolderSlug(rawSlug, notes);
    noteInput.folder = `${prefix}${slug}`;
  }

  const relPath = path
    .join(noteInput.folder ?? "00-Inbox", `${date}-${slugify(noteInput.title)}.md`)
    .replace(/\\/g, "/");

  const extraWrites = inferExtraWrites({
    folder: noteInput.folder ?? "00-Inbox",
    confidence: structured.confidence ?? 0.5,
    shortSummary: structured.shortSummary,
    projectName: routingContext.activeProject,
    hasTask: routingContext.saveIntent === "task",
    date,
  });

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
    noteInput: {
      ...noteInput,
      status: noteInput.status,
    },
    relPath,
    duplicateWarnings: duplicates,
    structuredSummary: structured.shortSummary,
    extraWrites,
  };

  await savePreview(preview);
  await auditLog("create_note_preview", relPath);

  const destLines = [
    `Path: ${relPath}`,
    ...extraWrites.map((w) => `Also: ${w.kind} → ${w.folder} (${w.section})`),
  ];

  let text = [
    `Preview ID: ${id}`,
    ...destLines,
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

  const notes = getAllIndexedNotes();
  const filename = path.basename(preview.relPath);

  const primaryResult = await writeOrMergeNote(
    config.vaultPath,
    preview.noteInput,
    {
      filename,
      notes,
      duplicateWarnings: preview.duplicateWarnings,
      frontmatter: { status: preview.noteInput.status ?? "inbox" },
    }
  );
  const relPath = primaryResult.primaryPath;
  const writtenPaths = [relPath];
  const deletedDuplicates: string[] = [...primaryResult.deletedDuplicates];

  // Mirror named projects between 03-Projects and 02-Areas/Building
  const primaryFolder = preview.noteInput.folder ?? "";
  const mirrorFilename = path.basename(relPath);
  let mirrorFolder: string | null = null;
  if (primaryFolder.startsWith("03-Projects/")) {
    const slug = primaryFolder.replace("03-Projects/", "").split("/")[0];
    mirrorFolder = `02-Areas/Building/${slug}`;
  } else if (primaryFolder.startsWith("02-Areas/Building/")) {
    const slug = primaryFolder.replace("02-Areas/Building/", "").split("/")[0];
    mirrorFolder = `03-Projects/${slug}`;
  }
  if (mirrorFolder) {
    const mirrorResult = await writeOrMergeNote(
      config.vaultPath,
      { ...preview.noteInput, folder: mirrorFolder, status: "filed" },
      {
        filename: mirrorFilename,
        notes: getAllIndexedNotes(),
        duplicateWarnings: preview.duplicateWarnings,
        frontmatter: { status: "filed" },
      }
    );
    if (!writtenPaths.includes(mirrorResult.primaryPath)) {
      writtenPaths.push(mirrorResult.primaryPath);
    }
    deletedDuplicates.push(...mirrorResult.deletedDuplicates);
  }

  for (const extra of preview.extraWrites ?? []) {
    if (extra.kind === "daily_log" || extra.kind === "daily_task") {
      const p = await appendToDailyNote(
        config.vaultPath,
        extra.section,
        extra.content,
        { asTask: extra.kind === "daily_task" }
      );
      if (!writtenPaths.includes(p)) writtenPaths.push(p);
    } else if (extra.kind === "project_log") {
      const p = await appendToProjectLog(config.vaultPath, extra.folder, {
        title: preview.noteInput.title ?? "Update",
        summary: preview.structuredSummary,
      });
      if (!writtenPaths.includes(p)) writtenPaths.push(p);
    } else if (extra.kind === "area_mirror" || extra.kind === "project_mirror") {
      continue;
    }
    await indexSingleFile(config.vaultPath, writtenPaths[writtenPaths.length - 1]!);
  }

  // Clean up stray duplicate project notes from prior auto-saves
  const dedupeResult = await dedupeProjectNotes(config.vaultPath, getAllIndexedNotes());
  deletedDuplicates.push(...dedupeResult.deleted);

  await indexSingleFile(config.vaultPath, relPath);
  for (const p of writtenPaths) {
    await indexSingleFile(config.vaultPath, p);
  }
  await deletePreview(previewId);
  await auditLog("create_note_commit", relPath);

  const uniqueDeleted = [...new Set(deletedDuplicates)];
  const action =
    primaryResult.action === "merged" ? "merged" : "created";

  let message: string;
  if (action === "merged") {
    message = `Merged into ${relPath}`;
    if (uniqueDeleted.length > 0) {
      message += `\nRemoved ${uniqueDeleted.length} duplicate(s):\n${uniqueDeleted.map((p) => `- ${p}`).join("\n")}`;
    }
  } else if (writtenPaths.length > 1) {
    message = `Saved to:\n${writtenPaths.map((p) => `- ${p}`).join("\n")}`;
  } else {
    message = `Created note at ${relPath}`;
  }

  return {
    path: relPath,
    paths: writtenPaths,
    message,
    action,
    deletedDuplicates: uniqueDeleted,
  };
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

export async function dedupeVault(options: { dryRun?: boolean } = {}): Promise<{
  merged: string[];
  deleted: string[];
  emptyRemoved: string[];
  foldersRemoved: string[];
  message: string;
}> {
  await initBrain();
  const result = await cleanupVault(config.vaultPath, getAllIndexedNotes(), options);

  // Reindex after structural changes
  await fullReindex(config.vaultPath);

  const totalRemoved = result.deleted.length + result.emptyRemoved.length;
  const parts: string[] = [];
  if (result.merged.length > 0) {
    parts.push(`Merged into ${new Set(result.merged).size} canonical note(s)`);
  }
  if (result.deleted.length > 0) {
    parts.push(`removed ${result.deleted.length} duplicate(s)`);
  }
  if (result.emptyRemoved.length > 0) {
    parts.push(`deleted ${result.emptyRemoved.length} empty/junk note(s)`);
  }
  if (result.foldersRemoved.length > 0) {
    parts.push(`cleaned ${result.foldersRemoved.length} empty folder(s)`);
  }

  const message =
    parts.length === 0
      ? "Vault is clean — no duplicates or empty notes found."
      : `🧹 Cleanup done: ${parts.join(", ")}.` +
        (totalRemoved > 0
          ? `\n\nRemoved:\n${[...result.deleted, ...result.emptyRemoved]
              .map((p) => `- ${p}`)
              .join("\n")}`
          : "");

  await auditLog("cleanup_vault", message.slice(0, 200));
  return { ...result, message };
}

export async function reindexVault() {
  await initBrain();
  const count = await fullReindex(config.vaultPath);
  return { noteCount: count };
}

export async function appendDailyNote(
  section: "Capture" | "Tasks" | "Log",
  content: string,
  options: { asTask?: boolean; dueDate?: string; projectTag?: string; date?: string } = {}
) {
  await initBrain();
  const { appendToDailyNote } = await import("../vault/writer.js");
  return appendToDailyNote(config.vaultPath, section, content, options);
}
