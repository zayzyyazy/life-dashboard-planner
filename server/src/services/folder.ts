import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { getDb } from "../db/index.js";
import { chatCompletion } from "./openai.js";

const IGNORED = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "logs",
  ".next",
  "target",
  ".DS_Store",
]);

let watcher: FSWatcher | null = null;

function shouldIgnore(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  return parts.some((p) => IGNORED.has(p) || p.startsWith("."));
}

function hashDirectory(dirPath: string): string {
  const hash = crypto.createHash("sha256");
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (shouldIgnore(full)) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const stat = fs.statSync(full);
        hash.update(`${full}:${stat.mtimeMs}:${stat.size}`);
      }
    }
  };
  walk(dirPath);
  return hash.digest("hex");
}

function collectChangedFiles(dirPath: string, since?: string): string[] {
  const changed: string[] = [];
  const sinceTime = since ? new Date(since).getTime() : 0;
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (shouldIgnore(full)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const mtime = fs.statSync(full).mtimeMs;
        if (mtime > sinceTime) changed.push(full);
      }
    }
  };
  walk(dirPath);
  return changed.slice(0, 50);
}

export function addWatchedFolder(
  folderPath: string,
  projectId?: number | null
): { id: number; path: string } {
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Folder does not exist: ${resolved}`);
  }
  const db = getDb();
  const snapshot = hashDirectory(resolved);
  const result = db
    .prepare(
      `INSERT INTO watched_folders (project_id, path, snapshot_hash, last_checked_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(path) DO UPDATE SET project_id = COALESCE(excluded.project_id, project_id)
       RETURNING id, path`
    )
    .get(projectId ?? null, resolved, snapshot) as { id: number; path: string };

  startFolderWatcher();
  return result;
}

export async function checkFolder(folderId: number): Promise<string | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM watched_folders WHERE id = ?")
    .get(folderId) as {
    id: number;
    path: string;
    project_id: number | null;
    snapshot_hash: string | null;
    last_checked_at: string | null;
  } | undefined;

  if (!row || !fs.existsSync(row.path)) return null;

  const newHash = hashDirectory(row.path);
  if (row.snapshot_hash === newHash) {
    db.prepare("UPDATE watched_folders SET last_checked_at = datetime('now') WHERE id = ?").run(
      folderId
    );
    return null;
  }

  const changedFiles = collectChangedFiles(row.path, row.last_checked_at ?? undefined);
  const summary = await chatCompletion(
    [
      {
        role: "system",
        content:
          "Summarize meaningful local folder changes in 2-4 bullets. Ignore build artifacts and noise.",
      },
      {
        role: "user",
        content: JSON.stringify({ folder: row.path, changedFiles }),
      },
    ],
    { tier: "default" }
  );

  db.prepare(
    "UPDATE watched_folders SET last_checked_at = datetime('now'), snapshot_hash = ? WHERE id = ?"
  ).run(newHash, folderId);

  if (row.project_id) {
    db.prepare(
      "INSERT INTO project_updates (project_id, source, title, content, metadata) VALUES (?, ?, ?, ?, ?)"
    ).run(
      row.project_id,
      "folder",
      `Folder: ${path.basename(row.path)}`,
      summary,
      JSON.stringify({ changed_count: changedFiles.length })
    );
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(
      row.project_id
    );
  }

  return summary;
}

export async function checkAllFolders(): Promise<void> {
  const folders = getDb()
    .prepare("SELECT id FROM watched_folders")
    .all() as { id: number }[];
  for (const { id } of folders) {
    try {
      await checkFolder(id);
    } catch (err) {
      console.error(`Folder check failed for ${id}:`, err);
    }
  }
}

export function listWatchedFolders() {
  return getDb()
    .prepare(
      `SELECT wf.*, p.name as project_name FROM watched_folders wf
       LEFT JOIN projects p ON p.id = wf.project_id
       ORDER BY wf.created_at DESC`
    )
    .all();
}

export function startFolderWatcher() {
  const folders = getDb()
    .prepare("SELECT id, path FROM watched_folders")
    .all() as { id: number; path: string }[];

  if (folders.length === 0) return;

  if (watcher) {
    watcher.close();
    watcher = null;
  }

  const paths = folders.map((f) => f.path);
  watcher = chokidar.watch(paths, {
    ignored: (p) => shouldIgnore(p),
    ignoreInitial: true,
    persistent: true,
    depth: 6,
  });

  let debounce: ReturnType<typeof setTimeout> | null = null;
  const scheduleCheck = (folderId: number) => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      checkFolder(folderId).catch(console.error);
    }, 5000);
  };

  for (const folder of folders) {
    watcher.on("all", (event, filePath) => {
      if (filePath.startsWith(folder.path)) {
        scheduleCheck(folder.id);
      }
    });
  }

  console.log(`Folder watcher active for ${paths.length} path(s)`);
}
