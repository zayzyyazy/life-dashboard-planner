import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { isExcluded } from "../config.js";

export interface VaultNote {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export function titleFromPath(relPath: string, data: Record<string, unknown>): string {
  if (typeof data.title === "string" && data.title.trim()) {
    return data.title.trim();
  }
  return path.basename(relPath, ".md").replace(/-/g, " ");
}

export async function readNote(vaultRoot: string, relPath: string): Promise<VaultNote> {
  const normalized = relPath.replace(/\\/g, "/");
  const abs = path.join(vaultRoot, normalized);
  const raw = await fs.readFile(abs, "utf8");
  const { data, content } = matter(raw);
  return {
    path: normalized,
    title: titleFromPath(normalized, data),
    frontmatter: data,
    body: content.trim(),
  };
}

export async function listMarkdownFiles(
  vaultRoot: string,
  folder?: string
): Promise<string[]> {
  const startDir = folder ? path.join(vaultRoot, folder) : vaultRoot;
  const out: string[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.name === "Templates") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.name.endsWith(".md")) {
        const rel = path.relative(vaultRoot, full).replace(/\\/g, "/");
        if (!isExcluded(rel)) {
          out.push(rel);
        }
      }
    }
  }

  await walk(startDir);
  return out.sort();
}

export async function noteExists(vaultRoot: string, relPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(vaultRoot, relPath));
    return true;
  } catch {
    return false;
  }
}
