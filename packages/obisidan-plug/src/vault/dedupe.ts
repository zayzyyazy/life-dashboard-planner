import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { deleteNoteFromIndex } from "../index/db.js";
import { findDuplicateCandidates } from "../search/related.js";
import { scanVault, type ScannedNote } from "../vault/scanner.js";
import { readNote } from "./reader.js";
import { moveNote, rewriteNoteBody, slugify, type NewNoteInput } from "./writer.js";

export type MergeReason =
  | "exact_path"
  | "same_folder_same_day"
  | "high_similarity"
  | "project_slug";

export interface MergeDecision {
  targetPath: string;
  duplicatePaths: string[];
  reason: MergeReason;
}

const SKIP_BASENAMES = new Set(["log", "readme", "index"]);

function slugSimilarity(a: string, b: string): number {
  const sa = a.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const sb = b.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (sa === sb) return 1;
  if (sa.startsWith(sb) || sb.startsWith(sa)) return 0.85;
  const minLen = Math.min(sa.length, sb.length);
  if (minLen >= 8 && sa.slice(0, minLen) === sb.slice(0, minLen)) return 0.7;
  return 0;
}

function isMirrorPath(a: string, b: string): boolean {
  const na = a.replace(/\\/g, "/");
  const nb = b.replace(/\\/g, "/");
  if (na === nb) return false;
  const fileA = path.basename(na);
  const fileB = path.basename(nb);
  if (fileA !== fileB) return false;
  const slugA = na.match(/03-Projects\/([^/]+)/)?.[1];
  const slugB = nb.match(/02-Areas\/Building\/([^/]+)/)?.[1];
  if (slugA && slugB && slugA === slugB) return true;
  const slugB2 = nb.match(/03-Projects\/([^/]+)/)?.[1];
  const slugA2 = na.match(/02-Areas\/Building\/([^/]+)/)?.[1];
  if (slugA2 && slugB2 && slugA2 === slugB2) return true;
  return false;
}

function projectSlugFromFolder(folder: string): string | null {
  const m =
    folder.match(/^03-Projects\/([^/]+)/) ??
    folder.match(/^02-Areas\/Building\/([^/]+)/);
  return m?.[1] ?? null;
}

const NOISE_SLUG_TOKENS = new Set([
  "hey", "keeping", "it", "simple", "simpl", "the", "and", "for", "with",
  "yeah", "ok", "okay", "progress", "status", "update", "tool", "project",
  "current", "new", "unspecified", "tracking", "follow", "up",
]);

/** Reduce a messy slug to its stable project stem (drops trailing noise words). */
export function canonicalProjectSlug(slug: string): string {
  const parts = slug
    .toLowerCase()
    .split("-")
    .filter(Boolean);
  if (parts.length === 0) return slug;

  // Prefer stem ending in a project-type keyword
  for (let len = Math.min(5, parts.length); len >= 2; len--) {
    const candidate = parts.slice(0, len).join("-");
    if (/(cli|app|tool|agent|server|bot|api|cockpit)$/i.test(candidate)) {
      return candidate;
    }
  }

  // Otherwise drop trailing noise tokens
  let end = parts.length;
  while (end > 1 && NOISE_SLUG_TOKENS.has(parts[end - 1]!)) end--;
  const trimmed = parts.slice(0, end);
  return (trimmed.length >= 2 ? trimmed : parts.slice(0, Math.min(3, parts.length))).join("-");
}

/**
 * Given a proposed slug and the existing vault notes, return the canonical
 * folder slug to use — reusing an existing project folder when this slug is a
 * variant of it (shared stem). Prevents machealth-detective-cli-hey folders.
 */
export function resolveCanonicalFolderSlug(
  proposedSlug: string,
  notes: ScannedNote[]
): string {
  const stem = canonicalProjectSlug(proposedSlug);
  const existingSlugs = new Set<string>();
  for (const n of notes) {
    const s =
      n.path.match(/03-Projects\/([^/]+)/)?.[1] ??
      n.path.match(/02-Areas\/Building\/([^/]+)/)?.[1];
    if (s) existingSlugs.add(s);
  }

  // Exact existing folder wins
  if (existingSlugs.has(proposedSlug)) return proposedSlug;

  // Find an existing folder sharing the same stem — prefer the shortest/cleanest
  const sameStem = [...existingSlugs]
    .filter((s) => {
      const es = canonicalProjectSlug(s);
      return es === stem || s.startsWith(`${stem}-`) || stem.startsWith(`${s}-`) || s === stem;
    })
    .sort((a, b) => a.length - b.length);

  if (sameStem.length > 0) return sameStem[0]!;

  // No existing folder — use the clean stem, not the noisy proposed slug
  return stem;
}

function noteDateFromBasename(basename: string): string | null {
  const m = basename.match(/^(\d{4}-\d{2}-\d{2})-/);
  return m?.[1] ?? null;
}

function isMergeCandidateNote(notePath: string): boolean {
  const base = path.basename(notePath, ".md").toLowerCase();
  if (SKIP_BASENAMES.has(base)) return false;
  if (base.endsWith("-log") || base === "log") return false;
  return true;
}

/** Pick best existing note to merge into instead of creating a duplicate. */
export function resolveMergeTarget(params: {
  folder: string;
  title: string;
  body: string;
  anchors?: string[];
  filename: string;
  notes: ScannedNote[];
  duplicateWarnings?: { path: string; title: string; score: number }[];
}): MergeDecision | null {
  const { folder, title, body, anchors = [], filename, notes, duplicateWarnings = [] } = params;
  const date = noteDateFromBasename(filename) ?? new Date().toISOString().slice(0, 10);
  const titleSlug = slugify(title);
  const relPath = path.join(folder, filename).replace(/\\/g, "/");
  const projectSlug = projectSlugFromFolder(folder);
  const canonicalSlug = projectSlug ? canonicalProjectSlug(projectSlug) : null;

  const inFolder = notes.filter((n) => {
    const dir = path.dirname(n.path.replace(/\\/g, "/"));
    return dir === folder && isMergeCandidateNote(n.path);
  });

  // 1. Exact path already exists
  const exact = inFolder.find((n) => n.path === relPath);
  if (exact) {
    return { targetPath: exact.path, duplicatePaths: [], reason: "exact_path" };
  }

  // 2. Same folder + same day + similar title slug
  for (const note of inFolder) {
    const base = path.basename(note.path, ".md");
    const noteDate = noteDateFromBasename(base);
    if (noteDate !== date) continue;
    const noteSlug = base.slice(date.length + 1);
    if (slugSimilarity(noteSlug, titleSlug) >= 0.5) {
      return { targetPath: note.path, duplicatePaths: [], reason: "same_folder_same_day" };
    }
  }

  // 3. High similarity in same project (any folder variant with same slug prefix)
  const projectNotes = canonicalSlug
    ? notes.filter((n) => {
        const pSlug =
          n.path.match(/03-Projects\/([^/]+)/)?.[1] ??
          n.path.match(/02-Areas\/Building\/([^/]+)/)?.[1];
        if (!pSlug) return false;
        return (
          pSlug === canonicalSlug ||
          pSlug.startsWith(`${canonicalSlug}-`) ||
          canonicalSlug.startsWith(`${pSlug}-`)
        );
      })
    : inFolder;

  const dupes = findDuplicateCandidates(
    title,
    body,
    anchors,
    projectNotes.filter((n) => isMergeCandidateNote(n.path)),
    config.jaccardDuplicateThreshold
  );

  const warned = duplicateWarnings.filter((d) => d.score >= config.jaccardDuplicateThreshold);
  const combined = [...dupes, ...warned.map((d) => ({ ...d, score: d.score }))];
  const seen = new Set<string>();
  for (const hit of combined.sort((a, b) => b.score - a.score)) {
    if (seen.has(hit.path)) continue;
    seen.add(hit.path);
    if (!isMergeCandidateNote(hit.path)) continue;
    if (hit.path === relPath) continue;
    // Prefer same primary folder, then any project note from today
    const hitDate = noteDateFromBasename(path.basename(hit.path, ".md"));
    const sameFolder = path.dirname(hit.path) === folder;
    if (hit.score >= config.jaccardDuplicateThreshold && (sameFolder || hitDate === date)) {
      return {
        targetPath: hit.path,
        duplicatePaths: [],
        reason: "high_similarity",
      };
    }
  }

  // 4. Same project slug folder cluster — merge into shortest/canonical folder path
  if (canonicalSlug && projectSlug) {
    const cluster = notes.filter((n) => {
      const pSlug =
        n.path.match(/03-Projects\/([^/]+)/)?.[1] ??
        n.path.match(/02-Areas\/Building\/([^/]+)/)?.[1];
      if (!pSlug) return false;
      return pSlug.startsWith(canonicalSlug) || canonicalSlug.startsWith(pSlug);
    });
    const todayNotes = cluster.filter((n) => {
      const d = noteDateFromBasename(path.basename(n.path, ".md"));
      return d === date && isMergeCandidateNote(n.path);
    });
    if (todayNotes.length > 0) {
      const target = todayNotes.sort((a, b) => a.path.length - b.path.length)[0]!;
      const extras = todayNotes
        .map((n) => n.path)
        .filter((p) => p !== target.path && !isMirrorPath(p, target.path));
      return {
        targetPath: target.path,
        duplicatePaths: extras,
        reason: "project_slug",
      };
    }
  }

  return null;
}

function bodyMostlyContained(existing: string, incoming: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const e = norm(existing);
  const i = norm(incoming);
  if (i.length < 40) return e.includes(i);
  return e.includes(i.slice(0, Math.min(120, i.length)));
}

/** Merge incoming note content into an existing note body. */
export function mergeBodies(existing: string, incoming: string): string {
  if (!incoming.trim()) return existing.trim();
  if (bodyMostlyContained(existing, incoming)) return existing.trim();

  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  const separator = `\n\n---\n\n## Update (${ts})\n\n`;
  return `${existing.trim()}${separator}${incoming.trim()}`;
}

function unionTags(a: unknown, b: unknown): string[] {
  const toArr = (v: unknown) =>
    Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : [];
  return [...new Set([...toArr(a), ...toArr(b)])];
}

export async function mergeIntoExistingNote(
  vaultRoot: string,
  targetPath: string,
  incoming: NewNoteInput
): Promise<void> {
  const existing = await readNote(vaultRoot, targetPath);
  const mergedBody = mergeBodies(existing.body, incoming.body);
  await rewriteNoteBody(vaultRoot, targetPath, mergedBody, {
    title: incoming.title || existing.title,
    tags: unionTags(existing.frontmatter.tags, incoming.tags),
    anchors: unionTags(existing.frontmatter.anchors, incoming.anchors),
    status: "filed",
  });
}

export async function deleteVaultNote(vaultRoot: string, relPath: string): Promise<void> {
  const normalized = relPath.replace(/\\/g, "/");
  try {
    await fs.unlink(path.join(vaultRoot, normalized));
    deleteNoteFromIndex(normalized);
  } catch {
    // already gone
  }
}

export interface CommitWriteResult {
  primaryPath: string;
  action: "created" | "merged";
  deletedDuplicates: string[];
  mergeReason?: MergeReason;
}

/** Write new note or merge into existing if duplicate detected. */
export async function writeOrMergeNote(
  vaultRoot: string,
  input: NewNoteInput,
  options: {
    filename: string;
    notes: ScannedNote[];
    duplicateWarnings?: { path: string; title: string; score: number }[];
    frontmatter?: Record<string, unknown>;
  }
): Promise<CommitWriteResult> {
  const folder = (input.folder ?? "00-Inbox").replace(/\\/g, "/");
  const filename = options.filename;
  const relPath = path.join(folder, filename).replace(/\\/g, "/");

  const decision = resolveMergeTarget({
    folder,
    title: input.title,
    body: input.body,
    anchors: input.anchors,
    filename,
    notes: options.notes,
    duplicateWarnings: options.duplicateWarnings,
  });

  if (decision) {
    await mergeIntoExistingNote(vaultRoot, decision.targetPath, input);
    const deleted: string[] = [];
    for (const dup of decision.duplicatePaths) {
      if (dup === decision.targetPath) continue;
      if (isMirrorPath(dup, decision.targetPath)) continue;
      await deleteVaultNote(vaultRoot, dup);
      deleted.push(dup);
    }
    return {
      primaryPath: decision.targetPath,
      action: "merged",
      deletedDuplicates: deleted,
      mergeReason: decision.reason,
    };
  }

  const { writeNote } = await import("./writer.js");
  const written = await writeNote(vaultRoot, input, {
    filename,
    frontmatter: options.frontmatter,
  });
  return {
    primaryPath: written || relPath,
    action: "created",
    deletedDuplicates: [],
  };
}

function slugFromProjectPath(notePath: string): { prefix: string; slug: string } | null {
  const p = notePath.replace(/\\/g, "/");
  let m = p.match(/^(03-Projects)\/([^/]+)/);
  if (m) return { prefix: m[1]!, slug: m[2]! };
  m = p.match(/^(02-Areas\/Building)\/([^/]+)/);
  if (m) return { prefix: m[1]!, slug: m[2]! };
  return null;
}

/**
 * Aggressively collapse all project-note folder variants that share a stem into
 * ONE canonical folder per (prefix, stem). Content notes are merged into a single
 * note; extras are deleted. Runs per top-level prefix so mirrors stay in sync.
 */
export async function dedupeProjectNotes(
  vaultRoot: string,
  notes: ScannedNote[],
  options: { dryRun?: boolean } = {}
): Promise<{ merged: string[]; deleted: string[] }> {
  const merged: string[] = [];
  const deleted: string[] = [];

  const projectNotes = notes.filter(
    (n) => n.path.startsWith("03-Projects/") || n.path.startsWith("02-Areas/Building/")
  );

  // First pass: raw stems per prefix
  const rawStemsByPrefix = new Map<string, Set<string>>();
  for (const note of projectNotes) {
    const parsed = slugFromProjectPath(note.path);
    if (!parsed) continue;
    const stem = canonicalProjectSlug(parsed.slug);
    const set = rawStemsByPrefix.get(parsed.prefix) ?? new Set<string>();
    set.add(stem);
    rawStemsByPrefix.set(parsed.prefix, set);
  }

  // Unify stems where one is a prefix of another (machealth-detective ⊂ machealth-detective-cli)
  const stemAlias = new Map<string, string>(); // prefix::stem -> canonical stem
  for (const [prefix, stems] of rawStemsByPrefix) {
    const sorted = [...stems].sort((a, b) => b.length - a.length); // longest first
    for (const stem of stems) {
      // Find the longest stem that this one is a prefix of (or equals)
      const canonical =
        sorted.find(
          (s) => s === stem || s.startsWith(`${stem}-`) || stem.startsWith(`${s}-`)
        ) ?? stem;
      stemAlias.set(`${prefix}::${stem}`, canonical);
    }
  }

  // Group by prefix + unified canonical stem
  const groups = new Map<string, ScannedNote[]>();
  for (const note of projectNotes) {
    const parsed = slugFromProjectPath(note.path);
    if (!parsed) continue;
    const stem = canonicalProjectSlug(parsed.slug);
    const canonical = stemAlias.get(`${parsed.prefix}::${stem}`) ?? stem;
    const key = `${parsed.prefix}::${canonical}`;
    const list = groups.get(key) ?? [];
    list.push(note);
    groups.set(key, list);
  }

  for (const [key, group] of groups) {
    const [prefix, stem] = key.split("::") as [string, string];
    const contentNotes = group.filter((n) => isMergeCandidateNote(n.path));
    if (contentNotes.length === 0) continue;

    // Canonical folder = prefix/stem
    const canonicalFolder = `${prefix}/${stem}`;

    // Pick target: prefer a content note already in the canonical folder, else the largest
    const inCanonical = contentNotes.filter(
      (n) => path.dirname(n.path) === canonicalFolder
    );
    const target = (inCanonical.length > 0 ? inCanonical : contentNotes).sort(
      (a, b) => b.bodyText.length - a.bodyText.length
    )[0]!;

    const targetDate =
      noteDateFromBasename(path.basename(target.path, ".md")) ??
      new Date().toISOString().slice(0, 10);
    const canonicalTargetPath = `${canonicalFolder}/${targetDate}-${stem}.md`;

    // Move target into canonical folder/name if needed
    let finalTargetPath = target.path;
    if (!options.dryRun && target.path !== canonicalTargetPath) {
      try {
        finalTargetPath = await moveNote(vaultRoot, target.path, canonicalTargetPath, {
          status: "filed",
        });
        deleteNoteFromIndex(target.path);
        merged.push(finalTargetPath);
      } catch {
        finalTargetPath = target.path;
      }
    } else if (target.path === canonicalTargetPath) {
      finalTargetPath = canonicalTargetPath;
    }

    // Merge every other content note into target, then delete
    for (const other of contentNotes) {
      if (other.path === target.path) continue;
      if (isMirrorPath(other.path, finalTargetPath)) continue;
      if (!options.dryRun) {
        try {
          const otherNote = await readNote(vaultRoot, other.path);
          await mergeIntoExistingNote(vaultRoot, finalTargetPath, {
            title: otherNote.title,
            body: otherNote.body,
            folder: canonicalFolder,
            tags: otherNote.frontmatter.tags as string[] | undefined,
            anchors: otherNote.frontmatter.anchors as string[] | undefined,
          });
          await deleteVaultNote(vaultRoot, other.path);
        } catch {
          continue;
        }
      }
      merged.push(finalTargetPath);
      deleted.push(other.path);
    }

    // Remove stale log.md files that live outside the canonical folder
    const logNotes = group.filter((n) => /(^|\/)log\.md$/i.test(n.path));
    for (const logNote of logNotes) {
      if (path.dirname(logNote.path) === canonicalFolder) continue;
      if (!options.dryRun) await deleteVaultNote(vaultRoot, logNote.path);
      deleted.push(logNote.path);
    }
  }

  return { merged: [...new Set(merged)], deleted: [...new Set(deleted)] };
}

const EMPTY_BODY = /^[\s#>-]*$/;

function isEffectivelyEmptyBody(body: string): boolean {
  const stripped = body
    .replace(/^#+\s.*$/gm, "") // headings
    .replace(/^###\s.*—.*$/gm, "") // log entry headers
    .replace(/\*\*(Summary|Done|Next|Shaky):\*\*\s*/gi, "") // empty log labels
    .replace(/^\s*[-*]\s*$/gm, "") // empty bullets
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length < 15 || EMPTY_BODY.test(body);
}

/**
 * Full cleanup pass: merge duplicate project notes, delete empty notes,
 * drop empty log files, and remove empty folders (except pinned scaffolding).
 */
export async function cleanupVault(
  vaultRoot: string,
  notes: ScannedNote[],
  options: { dryRun?: boolean } = {}
): Promise<{ merged: string[]; deleted: string[]; emptyRemoved: string[]; foldersRemoved: string[] }> {
  // 1. Merge duplicate project note clusters (also collapses folder variants)
  const dedupe = await dedupeProjectNotes(vaultRoot, notes, options);

  // 2. Delete empty / junk notes across the vault
  const emptyRemoved: string[] = [];
  const junkFolderPattern =
    /(^|\/)(unspecified-project|unknown|current-project|new-project|project-tracking|tracking-and-follow-up)(\/|$)/i;

  const freshNotes = await scanVault(vaultRoot);
  for (const note of freshNotes) {
    const isProjectLog = /(^|\/)log\.md$/i.test(note.path);
    const emptyBody = isEffectivelyEmptyBody(note.bodyText);
    const junkTitle = /project.?tracking|follow.?up|intention to save|unspecified/i.test(
      `${note.title} ${note.bodyText.slice(0, 120)}`
    );

    if (
      (emptyBody && !isProjectLog) ||
      junkFolderPattern.test(note.path) ||
      (junkTitle && note.bodyText.length < 400)
    ) {
      if (!options.dryRun) await deleteVaultNote(vaultRoot, note.path);
      emptyRemoved.push(note.path);
    } else if (isProjectLog && emptyBody) {
      if (!options.dryRun) await deleteVaultNote(vaultRoot, note.path);
      emptyRemoved.push(note.path);
    }
  }

  // 3. Remove empty folders (no .md inside), keep top-level scaffolding
  const foldersRemoved = options.dryRun
    ? []
    : await removeEmptyFolders(vaultRoot);

  return { ...dedupe, emptyRemoved: [...new Set(emptyRemoved)], foldersRemoved };
}

const PINNED_FOLDERS = new Set([
  "00-Inbox", "01-Daily", "02-Areas", "03-Projects", "04-Resources",
  "05-Archive", "02-Areas/Building", "02-Areas/Uni", "02-Areas/Job",
  "02-Areas/Learning", "02-Areas/Research", "02-Areas/Personal",
]);

async function removeEmptyFolders(vaultRoot: string): Promise<string[]> {
  const removed: string[] = [];

  async function hasMarkdown(dir: string): Promise<boolean> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (await hasMarkdown(full)) return true;
      } else if (e.name.endsWith(".md")) {
        return true;
      }
    }
    return false;
  }

  async function walk(rel: string): Promise<void> {
    const abs = path.join(vaultRoot, rel);
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      await walk(childRel);
      if (PINNED_FOLDERS.has(childRel)) continue;
      if (!(await hasMarkdown(path.join(vaultRoot, childRel)))) {
        try {
          await fs.rm(path.join(vaultRoot, childRel), { recursive: true, force: true });
          removed.push(childRel);
        } catch {
          // ignore
        }
      }
    }
  }

  for (const top of ["03-Projects", "02-Areas", "00-Inbox", "04-Resources"]) {
    await walk(top);
  }
  return removed;
}
