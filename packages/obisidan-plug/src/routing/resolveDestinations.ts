import fs from "node:fs/promises";
import path from "node:path";

export interface StructureContext {
  activeProject?: string | null;
  projectNames?: string[];
  saveIntent?: "capture" | "task" | "project_log" | "resource" | "daily_review";
}

export interface ExtraWrite {
  kind: "daily_log" | "daily_task" | "project_log" | "area_mirror" | "project_mirror";
  folder: string;
  section: "Log" | "Tasks";
  content: string;
}

const AREA_PREFIXES = [
  "02-Areas/Uni",
  "02-Areas/Job",
  "02-Areas/Learning",
  "02-Areas/Research",
  "02-Areas/Building",
  "02-Areas/Personal",
  "03-Projects",
  "04-Resources",
];

export function extractVaultFolders(notes: { path: string }[]): string[] {
  const folders = new Set<string>();
  for (const note of notes) {
    const dir = path.dirname(note.path.replace(/\\/g, "/"));
    if (dir && dir !== ".") folders.add(dir);
  }
  return [...folders].sort();
}

export function buildRoutingPromptBlock(
  vaultFolders: string[],
  ctx: StructureContext = {}
): string {
  const lines: string[] = [];
  if (ctx.activeProject) {
    lines.push(`ACTIVE PROJECT IN CONVERSATION: ${ctx.activeProject}`);
  }
  if (ctx.projectNames?.length) {
    lines.push(`KNOWN PROJECTS: ${ctx.projectNames.join(", ")}`);
  }
  if (ctx.saveIntent) {
    lines.push(`SAVE INTENT: ${ctx.saveIntent}`);
  }
  const relevant = vaultFolders.filter((f) =>
    AREA_PREFIXES.some((p) => f.startsWith(p))
  );
  if (relevant.length > 0) {
    lines.push(`EXISTING VAULT FOLDERS:\n${relevant.slice(0, 40).join("\n")}`);
  }
  return lines.length ? lines.join("\n") : "(no routing context)";
}

export function normalizeSuggestedFolder(
  suggested: string,
  confidence: number,
  title?: string,
  category?: string
): string {
  const folder = suggested.trim().replace(/\\/g, "/");
  if (!folder || confidence < 0.5) return "00-Inbox";
  if (folder.startsWith("00-Inbox")) return "00-Inbox";

  const cleaned = folder.replace(/\/+$/, "");
  return sanitizeVagueFolder(cleaned, title ?? "note", category ?? "Personal");
}

const VAGUE_FOLDER =
  /unspecified|unknown|current-?project|new-?project|project-tracking|follow-up|tracking-and/i;

export function sanitizeVagueFolder(
  folder: string,
  title: string,
  category: string
): string {
  const slug = projectSlugFromName(title) || "ideas";
  const baseName = path.basename(folder).toLowerCase();

  if (VAGUE_FOLDER.test(folder) || VAGUE_FOLDER.test(baseName) || VAGUE_FOLDER.test(title)) {
    if (category === "Building" || category === "Learning") {
      return `02-Areas/${category}/${slug}`;
    }
    return `02-Areas/${category}/${slug}`;
  }

  if (/^03-Projects\/(unspecified|unknown|new|current)/i.test(folder)) {
    return category === "Building"
      ? `02-Areas/Building/${slug}`
      : `03-Projects/${slug}`;
  }

  return folder;
}

export function projectSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

const GENERIC_SLUGS = new Set([
  "university", "uni", "work", "personal", "job", "learning", "research",
  "building", "project", "general", "note", "update", "progress", "reflection",
  "lectures", "planning", "starting", "ideas", "school", "college",
]);

export function isGenericProjectSlug(slug: string): boolean {
  const s = slug.toLowerCase().replace(/^-|-$/g, "");
  if (!s || s.length < 2) return true;
  return GENERIC_SLUGS.has(s) || GENERIC_SLUGS.has(s.split("-")[0]!);
}

function isAreaFolder(folder: string): boolean {
  return /^02-Areas\/(Uni|Job|Learning|Research|Personal)(\/|$)/.test(folder);
}

export function inferExtraWrites(params: {
  folder: string;
  confidence: number;
  shortSummary: string;
  projectName?: string | null;
  hasTask?: boolean;
  date?: string;
}): ExtraWrite[] {
  const { folder, confidence, shortSummary, projectName, hasTask, date } = params;
  if (confidence < 0.6) return [];

  const today = date ?? new Date().toISOString().slice(0, 10);
  const writes: ExtraWrite[] = [];
  const slug = folder.startsWith("03-Projects/")
    ? folder.replace("03-Projects/", "").split("/")[0]
    : folder.startsWith("02-Areas/Building/")
      ? folder.replace("02-Areas/Building/", "").split("/")[0]
      : projectName
        ? projectSlugFromName(projectName)
        : null;

  // Life areas (uni, job, etc.) — one primary note only, no fake "projects"
  if (isAreaFolder(folder)) {
    return [];
  }

  if (folder.startsWith("03-Projects/") && slug && !isGenericProjectSlug(slug)) {
    writes.push({
      kind: "project_log",
      folder: `03-Projects/${slug}`,
      section: "Log",
      content: shortSummary,
    });
    writes.push({
      kind: "area_mirror",
      folder: `02-Areas/Building/${slug}`,
      section: "Log",
      content: shortSummary,
    });
  } else if (folder.startsWith("02-Areas/Building/") && slug && !isGenericProjectSlug(slug)) {
    writes.push({
      kind: "project_mirror",
      folder: `03-Projects/${slug}`,
      section: "Log",
      content: shortSummary,
    });
    writes.push({
      kind: "project_log",
      folder: `03-Projects/${slug}`,
      section: "Log",
      content: shortSummary,
    });
  } else if (projectName && slug && !isGenericProjectSlug(slug)) {
    writes.push({
      kind: "project_log",
      folder: `03-Projects/${slug}`,
      section: "Log",
      content: shortSummary,
    });
  }

  if (
    !isAreaFolder(folder) &&
    (folder.startsWith("02-Areas/") ||
      folder.startsWith("03-Projects/") ||
      folder.startsWith("04-Resources/"))
  ) {
    writes.push({
      kind: "daily_log",
      folder: "01-Daily",
      section: "Log",
      content: shortSummary,
    });
  }

  if (hasTask) {
    void today;
    writes.push({
      kind: "daily_task",
      folder: "01-Daily",
      section: "Tasks",
      content: shortSummary,
    });
  }

  return writes;
}

export async function listVaultFolderTree(vaultRoot: string): Promise<string[]> {
  const folders: string[] = [];
  async function walk(rel: string) {
    const abs = path.join(vaultRoot, rel);
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      folders.push(child.replace(/\\/g, "/"));
      await walk(child);
    }
  }
  for (const top of ["00-Inbox", "01-Daily", "02-Areas", "03-Projects", "04-Resources"]) {
    await walk(top);
  }
  return folders;
}
