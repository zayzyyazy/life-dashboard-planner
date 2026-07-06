import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";
import { config } from "../config.js";
import { scanFileAtPath } from "../vault/scanFile.js";
import { scanVault } from "../vault/scanner.js";
import { deleteNoteFromIndex, rebuildIndex, upsertNote } from "./db.js";

let watcher: FSWatcher | null = null;

export async function fullReindex(vaultRoot: string): Promise<number> {
  const notes = await scanVault(vaultRoot);
  return rebuildIndex(notes);
}

export async function indexSingleFile(vaultRoot: string, relPath: string): Promise<void> {
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized.endsWith(".md")) {
    const note = await scanFileAtPath(vaultRoot, normalized);
    if (note) {
      upsertNote(note);
    } else {
      deleteNoteFromIndex(normalized);
    }
  }
}

export function startVaultWatcher(vaultRoot: string): FSWatcher {
  if (watcher) return watcher;

  watcher = chokidar.watch(vaultRoot, {
    ignored: (p) => {
      const base = path.basename(p);
      return base.startsWith(".") || p.includes(`${path.sep}.obsidian${path.sep}`);
    },
    ignoreInitial: true,
    persistent: true,
  });

  watcher.on("add", (filePath) => {
    const rel = path.relative(vaultRoot, filePath).replace(/\\/g, "/");
    void indexSingleFile(vaultRoot, rel);
  });

  watcher.on("change", (filePath) => {
    const rel = path.relative(vaultRoot, filePath).replace(/\\/g, "/");
    void indexSingleFile(vaultRoot, rel);
  });

  watcher.on("unlink", (filePath) => {
    const rel = path.relative(vaultRoot, filePath).replace(/\\/g, "/");
    deleteNoteFromIndex(rel);
  });

  return watcher;
}

export function stopVaultWatcher(): void {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
}

export async function ensureIndexed(vaultRoot: string): Promise<number> {
  const { getIndexStats } = await import("./db.js");
  const stats = getIndexStats();
  if (stats.noteCount === 0) {
    return fullReindex(vaultRoot);
  }
  return stats.noteCount;
}
