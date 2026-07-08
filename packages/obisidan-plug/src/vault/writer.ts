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

const DAILY_TEMPLATE = `---
date: {{date}}
tags: [daily]
---

## Capture

## Tasks

## Log
`;

function formatTimestamp(date = new Date()): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export async function ensureDailyNote(vaultRoot: string, date?: string): Promise<string> {
  const day = date ?? new Date().toISOString().slice(0, 10);
  const relPath = `01-Daily/${day}.md`;
  const abs = path.join(vaultRoot, relPath);
  try {
    await fs.access(abs);
    return relPath;
  } catch {
    const content = DAILY_TEMPLATE.replace("{{date}}", day);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    return relPath;
  }
}

function appendUnderSection(body: string, section: string, line: string): string {
  const header = `## ${section}`;
  const idx = body.indexOf(header);
  if (idx === -1) {
    return `${body.trim()}\n\n${header}\n${line}\n`;
  }
  const afterHeader = idx + header.length;
  const rest = body.slice(afterHeader);
  const nextHeader = rest.search(/\n## /);
  const sectionBody = nextHeader === -1 ? rest : rest.slice(0, nextHeader);
  const afterSection = nextHeader === -1 ? "" : rest.slice(nextHeader);
  const trimmed = sectionBody.trimEnd();
  const updated = `${trimmed}\n${line}\n`;
  return body.slice(0, afterHeader) + updated + afterSection;
}

export async function appendToDailyNote(
  vaultRoot: string,
  section: "Capture" | "Tasks" | "Log",
  content: string,
  options: { date?: string; asTask?: boolean; dueDate?: string; projectTag?: string } = {}
): Promise<string> {
  const relPath = await ensureDailyNote(vaultRoot, options.date);
  const abs = path.join(vaultRoot, relPath);
  const raw = await fs.readFile(abs, "utf8");
  const { data, content: body } = matter(raw);

  let line = content.trim();
  if (section === "Log") {
    line = `- ${formatTimestamp()} — ${line}`;
  } else if (section === "Tasks" || options.asTask) {
    const due = options.dueDate ? ` 📅 ${options.dueDate.slice(0, 10)}` : "";
    const tag = options.projectTag ? ` #project/${options.projectTag}` : "";
    line = `- [ ] ${line}${due}${tag}`;
  }

  const newBody = appendUnderSection(body, section, line);
  await fs.writeFile(abs, matter.stringify(newBody, data), "utf8");
  return relPath;
}

export async function appendToProjectLog(
  vaultRoot: string,
  projectFolder: string,
  entry: {
    title: string;
    summary: string;
    done?: string[];
    next?: string[];
    shaky?: string[];
  }
): Promise<string> {
  const folder = projectFolder.replace(/\\/g, "/").replace(/\/+$/, "");
  const relPath = `${folder}/log.md`;
  const abs = path.join(vaultRoot, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });

  const ts = formatTimestamp();
  const block = [
    `### ${ts} — ${entry.title}`,
    `**Summary:** ${entry.summary}`,
    entry.done?.length ? `**Done:** ${entry.done.join("; ")}` : "",
    entry.next?.length ? `**Next:** ${entry.next.join("; ")}` : "",
    entry.shaky?.length ? `**Shaky:** ${entry.shaky.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let body = "";
  try {
    const raw = await fs.readFile(abs, "utf8");
    const parsed = matter(raw);
    body = parsed.content.trim();
  } catch {
    body = `# ${path.basename(folder)} Log\n`;
  }

  const newBody = `${body}\n\n${block}\n`;
  const frontmatter = {
    title: `${path.basename(folder)} Log`,
    tags: ["project-log"],
    updated: new Date().toISOString(),
  };
  await fs.writeFile(abs, matter.stringify(newBody, frontmatter), "utf8");
  return relPath;
}
