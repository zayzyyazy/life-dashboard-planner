import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { isExcluded } from "../config.js";
import type { ScannedNote } from "./scanner.js";

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function titleFromPath(relPath: string, data: Record<string, unknown>): string {
  if (typeof data.title === "string" && data.title.trim()) return data.title.trim();
  return path.basename(relPath, ".md").replace(/-/g, " ");
}

export async function scanFileAtPath(
  vaultRoot: string,
  relPath: string
): Promise<ScannedNote | null> {
  const normalized = relPath.replace(/\\/g, "/");
  if (isExcluded(normalized) || !normalized.endsWith(".md")) return null;

  const abs = path.join(vaultRoot, normalized);
  try {
    const stat = await fs.stat(abs);
    const raw = await fs.readFile(abs, "utf8");
    const { data, content } = matter(raw);
    return {
      path: normalized,
      title: titleFromPath(normalized, data),
      category: typeof data.category === "string" ? data.category : "",
      tags: coerceStringArray(data.tags),
      anchors: coerceStringArray(data.anchors),
      bodyText: content.trim(),
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}
