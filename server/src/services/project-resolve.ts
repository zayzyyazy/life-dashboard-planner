import { getDb } from "../db/index.js";

export function projectSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export interface ProjectMatch {
  id: number;
  name: string;
  confidence: "exact" | "alias" | "fuzzy";
}

const PROJECT_ALIASES: Record<string, string> = {
  "live dashboard": "Life Planner Agent",
  "life dashboard": "Life Planner Agent",
  "life planner": "Life Planner Agent",
  "dashboard": "Life Planner Agent",
  "qa cockpit": "QA Call Analysis App",
  "call analysis": "QA Call Analysis App",
  "qa app": "QA Call Analysis App",
  mcp: "MCP Server",
  "mcp server": "MCP Server",
  marie: "Marie / Leaping AI",
  leaping: "Marie / Leaping AI",
  "leaping ai": "Marie / Leaping AI",
  uni: "University",
  university: "University",
  explainer: "Project Planner",
};

function normalizeAliasKey(s: string): string {
  return s.trim().toLowerCase();
}

export function resolveProjectMatches(query: string | null): ProjectMatch[] {
  if (!query?.trim()) return [];
  const db = getDb();
  const lower = normalizeAliasKey(query);
  const matches: ProjectMatch[] = [];

  const exact = db
    .prepare("SELECT id, name FROM projects WHERE name = ? COLLATE NOCASE")
    .get(query) as { id: number; name: string } | undefined;
  if (exact) matches.push({ ...exact, confidence: "exact" });

  const aliasTarget = PROJECT_ALIASES[lower];
  if (aliasTarget) {
    const row = db
      .prepare("SELECT id, name FROM projects WHERE name = ?")
      .get(aliasTarget) as { id: number; name: string } | undefined;
    if (row && !matches.some((m) => m.id === row.id)) {
      matches.push({ ...row, confidence: "alias" });
    }
  }

  const all = db.prepare("SELECT id, name FROM projects").all() as {
    id: number;
    name: string;
  }[];
  for (const p of all) {
    if (matches.some((m) => m.id === p.id)) continue;
    const pLower = p.name.toLowerCase();
    if (pLower.includes(lower) || lower.includes(pLower.split("/")[0].trim())) {
      matches.push({ ...p, confidence: "fuzzy" });
    }
  }

  return matches;
}

export function resolveProject(query: string | null): ProjectMatch | null {
  const matches = resolveProjectMatches(query);
  if (matches.length === 0) return null;
  const exact = matches.find((m) => m.confidence === "exact" || m.confidence === "alias");
  return exact ?? (matches.length === 1 ? matches[0]! : null);
}

export function formatProjectClarification(matches: ProjectMatch[]): string {
  const names = matches.slice(0, 4).map((m) => m.name);
  return `Which project is this for?\n${names.map((n) => `- ${n}`).join("\n")}\n\nReply with the project name.`;
}

export function inferActiveProjectFromMessage(message: string): string | null {
  const lower = message.toLowerCase();
  for (const [alias, project] of Object.entries(PROJECT_ALIASES)) {
    if (lower.includes(alias)) return project;
  }
  const matches = resolveProjectMatches(message);
  if (matches.length === 1) return matches[0]!.name;
  return null;
}
