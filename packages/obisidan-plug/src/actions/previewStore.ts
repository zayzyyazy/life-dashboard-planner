import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getPreviewsDir } from "../config.js";
import type { NewNoteInput } from "../vault/writer.js";
import type { OrganizeProposal } from "../ai/organize.js";
import type { ExtraWrite } from "../routing/resolveDestinations.js";

export type PreviewKind = "create_note" | "organize_note";

export interface CreateNotePreview {
  kind: "create_note";
  id: string;
  createdAt: string;
  rawInput: string;
  noteInput: NewNoteInput & { confidence?: number; shortSummary?: string };
  relPath: string;
  duplicateWarnings: { path: string; title: string; score: number }[];
  structuredSummary: string;
  extraWrites?: ExtraWrite[];
}

export interface OrganizeNotePreview {
  kind: "organize_note";
  id: string;
  createdAt: string;
  sourcePath: string;
  proposal: OrganizeProposal;
  previewText: string;
}

export type PreviewRecord = CreateNotePreview | OrganizeNotePreview;

function previewPath(id: string): string {
  return path.join(getPreviewsDir(), `${id}.json`);
}

export async function savePreview(record: PreviewRecord): Promise<string> {
  await fs.mkdir(getPreviewsDir(), { recursive: true });
  await fs.writeFile(previewPath(record.id), JSON.stringify(record, null, 2), "utf8");
  return record.id;
}

export async function loadPreview(id: string): Promise<PreviewRecord | null> {
  try {
    const raw = await fs.readFile(previewPath(id), "utf8");
    return JSON.parse(raw) as PreviewRecord;
  } catch {
    return null;
  }
}

export async function deletePreview(id: string): Promise<void> {
  await fs.unlink(previewPath(id)).catch(() => {});
}

export function newPreviewId(): string {
  return randomUUID();
}

export async function listPendingPreviews(): Promise<{ id: string; kind: PreviewKind; createdAt: string }[]> {
  let files: string[];
  try {
    files = await fs.readdir(getPreviewsDir());
  } catch {
    return [];
  }

  const out: { id: string; kind: PreviewKind; createdAt: string }[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(getPreviewsDir(), file), "utf8");
      const record = JSON.parse(raw) as PreviewRecord;
      out.push({ id: record.id, kind: record.kind, createdAt: record.createdAt });
    } catch {
      // skip
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
