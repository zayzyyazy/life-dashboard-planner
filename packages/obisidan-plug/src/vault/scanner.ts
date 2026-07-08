import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { isExcluded } from "../config.js";

export interface ScannedNote {
  path: string;
  title: string;
  category: string;
  tags: string[];
  anchors: string[];
  bodyText: string;
  modifiedAt: string;
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function titleFromPath(relPath: string, data: Record<string, unknown>): string {
  if (typeof data.title === "string" && data.title.trim()) {
    return data.title.trim();
  }
  return path.basename(relPath, ".md").replace(/-/g, " ");
}

export async function scanVault(vaultRoot: string): Promise<ScannedNote[]> {
  const results: ScannedNote[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "Templates") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.name.endsWith(".md")) continue;

      const rel = path.relative(vaultRoot, full).replace(/\\/g, "/");
      if (isExcluded(rel)) continue;

      try {
        const stat = await fs.stat(full);
        const raw = await fs.readFile(full, "utf8");
        const { data, content } = matter(raw);
        results.push({
          path: rel,
          title: titleFromPath(rel, data),
          category: typeof data.category === "string" ? data.category : "",
          tags: coerceStringArray(data.tags),
          anchors: coerceStringArray(data.anchors),
          bodyText: content.trim(),
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch {
        // skip unreadable files
      }
    }
  }

  await walk(vaultRoot);
  return results;
}

export async function scanSingleFile(
  vaultRoot: string,
  relPath: string
): Promise<ScannedNote | null> {
  const notes = await scanVault(vaultRoot);
  return notes.find((n) => n.path === relPath.replace(/\\/g, "/")) ?? null;
}
