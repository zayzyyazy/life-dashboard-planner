import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { randomUUID } from "node:crypto";
import type { MainCategory } from "../config.js";

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export interface NewNoteInput {
  title: string;
  body: string;
  folder?: string;
  tags?: string[];
  category?: MainCategory | string;
  anchors?: string[];
  related?: string[];
  id?: string;
  status?: string;
  source?: string;
}

export interface WriteNoteOptions {
  filename?: string;
  frontmatter?: Record<string, unknown>;
}

export async function writeNote(
  vaultRoot: string,
  input: NewNoteInput,
  options: WriteNoteOptions = {}
): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const folder = input.folder ?? "00-Inbox";
  const filename =
    options.filename ?? `${date}-${slugify(input.title)}.md`;
  const relPath = path.join(folder, filename).replace(/\\/g, "/");

  const relatedBlock =
    (input.related?.length ?? 0) > 0
      ? `\n\n## Related\n${input.related!.map((r) => `- [[${r}]]`).join("\n")}`
      : "";

  const frontmatter = {
    id: input.id ?? randomUUID(),
    created: new Date().toISOString(),
    source: input.source ?? "ai",
    status: input.status ?? "inbox",
    title: input.title,
    category: input.category ?? "Personal",
    tags: input.tags ?? [],
    anchors: input.anchors ?? [],
    ...options.frontmatter,
  };

  const fileContent = matter.stringify(input.body + relatedBlock, frontmatter);
  const abs = path.join(vaultRoot, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, fileContent, "utf8");
  return relPath;
}

export async function updateNoteFrontmatter(
  vaultRoot: string,
  relPath: string,
  patch: Record<string, unknown>
): Promise<void> {
  const abs = path.join(vaultRoot, relPath);
  const raw = await fs.readFile(abs, "utf8");
  const { data, content } = matter(raw);
  const merged = { ...data, ...patch, updated: new Date().toISOString() };
  await fs.writeFile(abs, matter.stringify(content, merged), "utf8");
}

export async function moveNote(
  vaultRoot: string,
  fromPath: string,
  toPath: string,
  frontmatterPatch?: Record<string, unknown>
): Promise<string> {
  const fromAbs = path.join(vaultRoot, fromPath);
  const toAbs = path.join(vaultRoot, toPath);
  await fs.mkdir(path.dirname(toAbs), { recursive: true });

  if (frontmatterPatch) {
    const raw = await fs.readFile(fromAbs, "utf8");
    const { data, content } = matter(raw);
    const merged = { ...data, ...frontmatterPatch, updated: new Date().toISOString() };
    await fs.writeFile(toAbs, matter.stringify(content, merged), "utf8");
    await fs.unlink(fromAbs);
  } else {
    await fs.rename(fromAbs, toAbs);
  }

  return toPath.replace(/\\/g, "/");
}

export async function rewriteNoteBody(
  vaultRoot: string,
  relPath: string,
  newBody: string,
  frontmatterPatch?: Record<string, unknown>
): Promise<void> {
  const abs = path.join(vaultRoot, relPath);
  const raw = await fs.readFile(abs, "utf8");
  const { data, content } = matter(raw);
  void content;
  const merged = {
    ...data,
    ...frontmatterPatch,
    updated: new Date().toISOString(),
  };
  await fs.writeFile(abs, matter.stringify(newBody, merged), "utf8");
}
