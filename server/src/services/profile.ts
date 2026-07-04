import { getDb } from "../db/index.js";
import { domainLabel, isLifeDomain, type LifeDomain } from "../types/domains.js";
import { USER_PROFILE_SEED, USER_KNOWLEDGE_SEED } from "../data/user-profile-seed.js";

export { domainLabel };

export interface UserProfile {
  id: number;
  name: string | null;
  summary: string | null;
  personal_work_context: string | null;
  university_context: string | null;
  personal_life_context: string | null;
  preferences: string | null;
  updated_at: string;
}

export interface KnowledgeEntry {
  id: number;
  domain: LifeDomain;
  title: string;
  content: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export function getProfile(): UserProfile {
  const row = getDb().prepare("SELECT * FROM user_profile WHERE id = 1").get() as
    | UserProfile
    | undefined;
  if (row) return row;
  getDb().prepare("INSERT INTO user_profile (id) VALUES (1)").run();
  return getDb().prepare("SELECT * FROM user_profile WHERE id = 1").get() as UserProfile;
}

export function updateProfile(
  updates: Partial<
    Pick<
      UserProfile,
      | "name"
      | "summary"
      | "personal_work_context"
      | "university_context"
      | "personal_life_context"
      | "preferences"
    >
  >
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (fields.length === 0) return getProfile();
  getProfile();
  getDb()
    .prepare(
      `UPDATE user_profile SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = 1`
    )
    .run(...values);
  return getProfile();
}

export function addKnowledge(input: {
  domain: LifeDomain;
  title: string;
  content: string;
  source?: string;
}): KnowledgeEntry {
  const result = getDb()
    .prepare(
      `INSERT INTO user_knowledge (domain, title, content, source)
       VALUES (?, ?, ?, ?)
       RETURNING *`
    )
    .get(
      input.domain,
      input.title,
      input.content,
      input.source ?? "chat"
    ) as KnowledgeEntry;
  return result;
}

export function listKnowledge(domain?: LifeDomain): KnowledgeEntry[] {
  if (domain) {
    return getDb()
      .prepare("SELECT * FROM user_knowledge WHERE domain = ? ORDER BY updated_at DESC")
      .all(domain) as KnowledgeEntry[];
  }
  return getDb()
    .prepare("SELECT * FROM user_knowledge ORDER BY updated_at DESC")
    .all() as KnowledgeEntry[];
}

export function deleteKnowledge(id: number): boolean {
  const result = getDb().prepare("DELETE FROM user_knowledge WHERE id = ?").run(id);
  return result.changes > 0;
}

export async function seedProfileIfEmpty(): Promise<boolean> {
  const profile = getProfile();
  if (profile.summary?.trim()) {
    return false;
  }
  await applyProfileSeed(false);
  return true;
}

export async function seedProfileForce(): Promise<void> {
  await applyProfileSeed(true);
}

async function applyProfileSeed(forceKnowledge: boolean) {
  updateProfile(USER_PROFILE_SEED);

  const existing = getDb()
    .prepare("SELECT COUNT(*) as c FROM user_knowledge")
    .get() as { c: number };

  if (existing.c === 0 || forceKnowledge) {
    for (const note of USER_KNOWLEDGE_SEED) {
      const dup = getDb()
        .prepare("SELECT id FROM user_knowledge WHERE title = ? AND domain = ?")
        .get(note.title, note.domain) as { id: number } | undefined;
      if (!dup) {
        addKnowledge({ ...note, source: "seed" });
      }
    }
  }
}

export function ensureMissingKnowledgeSeed(): number {
  let added = 0;
  for (const note of USER_KNOWLEDGE_SEED) {
    const dup = getDb()
      .prepare("SELECT id FROM user_knowledge WHERE title = ? AND domain = ?")
      .get(note.title, note.domain) as { id: number } | undefined;
    if (!dup) {
      addKnowledge({ ...note, source: "seed" });
      added++;
    }
  }
  return added;
}

export function inferDomainFromText(text: string): LifeDomain {
  const lower = text.toLowerCase();
  if (
    /\b(university|uni\b|college|course|lecture|assignment|exam|professor|campus|semester|module)\b/.test(
      lower
    )
  ) {
    return "university";
  }
  if (
    /\b(work|startup|marie|leaping|mcp|client|repo|deploy|qa app|project planner)\b/.test(
      lower
    )
  ) {
    return "personal_work";
  }
  if (/\b(family|health|gym|personal life|errand|doctor)\b/.test(lower)) {
    return "personal_life";
  }
  return "general";
}

export function formatPersonalContextForPrompt(): string {
  const profile = getProfile();
  const knowledge = listKnowledge().slice(0, 60);
  const lines: string[] = ["## About the user"];

  if (profile.name) lines.push(`Name: ${profile.name}`);
  if (profile.summary) lines.push(`Summary: ${profile.summary}`);
  if (profile.personal_work_context) {
    lines.push(`Personal work context: ${profile.personal_work_context}`);
  }
  if (profile.university_context) {
    lines.push(`University context: ${profile.university_context}`);
  }
  if (profile.personal_life_context) {
    lines.push(`Personal life context: ${profile.personal_life_context}`);
  }
  if (profile.preferences) lines.push(`Preferences: ${profile.preferences}`);

  const byDomain = new Map<LifeDomain, KnowledgeEntry[]>();
  for (const entry of knowledge) {
    const domain = isLifeDomain(entry.domain) ? entry.domain : "general";
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(entry);
  }

  for (const [domain, entries] of byDomain) {
    if (entries.length === 0) continue;
    lines.push(`\n### ${domainLabel(domain)} knowledge`);
    for (const e of entries.slice(0, 20)) {
      lines.push(`- ${e.title}: ${e.content}`);
    }
  }

  lines.push(
    "\nVoice: second brain / thoughtful collaborator — synthesize, connect ideas, challenge when useful. Not a babysitter or cheerleader."
  );

  return lines.join("\n");
}

export function getProjectListForClassifier(): string {
  const db = getDb();
  const projects = db
    .prepare("SELECT id, name, description FROM projects WHERE status = 'active' ORDER BY name")
    .all() as { id: number; name: string; description: string | null }[];

  const watched = db
    .prepare(
      `SELECT wr.owner, wr.repo, p.name as project_name
       FROM watched_repos wr LEFT JOIN projects p ON p.id = wr.project_id`
    )
    .all() as { owner: string; repo: string; project_name: string | null }[];

  return projects
    .map((p) => {
      const repos = watched
        .filter((w) => w.project_name === p.name)
        .map((w) => `${w.owner}/${w.repo}`);
      const repoNote = repos.length ? ` [repos: ${repos.join(", ")}]` : "";
      const desc = p.description ? ` — ${p.description.slice(0, 80)}` : "";
      return `- ${p.name}${desc}${repoNote}`;
    })
    .join("\n");
}
