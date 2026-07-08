import { config } from "../config.js";
import { getDb } from "../db/index.js";
import {
  PROJECT_KNOWLEDGE_SEED,
  PROJECT_USER_KNOWLEDGE_SEED,
} from "../data/project-knowledge-seed.js";
import { addKnowledge } from "./profile.js";
import { listWatchedRepos } from "./github.js";

export interface AgentKnowledgeStatus {
  profile_loaded: boolean;
  profile_name: string | null;
  knowledge_entries: number;
  projects: { name: string; update_count: number; linked_repos: string[] }[];
  watched_repos: number;
  github_token: boolean;
  recent_messages: number;
  project_memory_chars: number;
}

export function seedProjectKnowledgeIfEmpty(): number {
  const db = getDb();
  let added = 0;

  for (const entry of PROJECT_KNOWLEDGE_SEED) {
    const project = db
      .prepare("SELECT id FROM projects WHERE name = ? COLLATE NOCASE")
      .get(entry.project_name) as { id: number } | undefined;
    if (!project) continue;

    const dup = db
      .prepare(
        `SELECT id FROM project_updates
         WHERE project_id = ? AND title = ? AND source = 'seed'`
      )
      .get(project.id, entry.title) as { id: number } | undefined;
    if (dup) continue;

    db.prepare(
      `INSERT INTO project_updates (project_id, source, title, content)
       VALUES (?, 'seed', ?, ?)`
    ).run(project.id, entry.title, entry.content);
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(project.id);
    added++;
  }

  for (const note of PROJECT_USER_KNOWLEDGE_SEED) {
    const dup = db
      .prepare("SELECT id FROM user_knowledge WHERE title = ? AND domain = ?")
      .get(note.title, note.domain) as { id: number } | undefined;
    if (!dup) {
      addKnowledge({ ...note, source: "seed" });
      added++;
    }
  }

  return added;
}

export function getAgentKnowledgeStatus(): AgentKnowledgeStatus {
  const db = getDb();

  const profile = db.prepare("SELECT name, summary FROM user_profile WHERE id = 1").get() as
    | { name: string | null; summary: string | null }
    | undefined;

  const knowledgeCount = (
    db.prepare("SELECT COUNT(*) as c FROM user_knowledge").get() as { c: number }
  ).c;

  const projects = db
    .prepare("SELECT id, name FROM projects WHERE status = 'active' ORDER BY name")
    .all() as { id: number; name: string }[];

  const watched = listWatchedRepos() as {
    owner: string;
    repo: string;
    project_name: string | null;
  }[];

  const projectRows = projects.map((p) => {
    const updateCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM project_updates WHERE project_id = ?")
        .get(p.id) as { c: number }
    ).c;
    const linkedRepos = watched
      .filter((w) => w.project_name === p.name)
      .map((w) => `${w.owner}/${w.repo}`);
    return { name: p.name, update_count: updateCount, linked_repos: linkedRepos };
  });

  const recentMessages = (
    db.prepare("SELECT COUNT(*) as c FROM agent_messages").get() as { c: number }
  ).c;

  const updates = db
    .prepare("SELECT content FROM project_updates ORDER BY created_at DESC LIMIT 30")
    .all() as { content: string }[];
  const projectMemoryChars = updates.reduce((n, u) => n + u.content.length, 0);

  return {
    profile_loaded: Boolean(profile?.summary?.trim()),
    profile_name: profile?.name ?? null,
    knowledge_entries: knowledgeCount,
    projects: projectRows,
    watched_repos: watched.length,
    github_token: Boolean(config.github.token),
    recent_messages: recentMessages,
    project_memory_chars: projectMemoryChars,
  };
}

export function formatKnowledgeStatusForUser(status: AgentKnowledgeStatus): string {
  const lines: string[] = ["What I have loaded:"];

  lines.push(
    status.profile_loaded
      ? `Profile: ${status.profile_name ?? "yes"} ✓`
      : "Profile: empty — run npm run seed:profile -- --force",
    `Knowledge notes: ${status.knowledge_entries}`,
    `GitHub repos watched: ${status.watched_repos}${status.github_token ? "" : " (no GITHUB_TOKEN)"}`,
    `Chat history messages: ${status.recent_messages}`,
    "",
    "Projects:"
  );

  for (const p of status.projects) {
    const repos =
      p.linked_repos.length > 0 ? ` · repos: ${p.linked_repos.join(", ")}` : " · no repos linked";
    lines.push(`• ${p.name}: ${p.update_count} update(s)${repos}`);
  }

  const empty = status.projects.filter((p) => p.update_count === 0);
  if (empty.length > 0) {
    lines.push(
      "",
      `⚠ Empty project memory: ${empty.map((p) => p.name).join(", ")}`,
      "Run: npm run setup && npm run sync:knowledge"
    );
  }

  if (status.watched_repos === 0) {
    lines.push("", "⚠ No GitHub repos — add GITHUB_TOKEN and run npm run setup");
  }

  return lines.join("\n");
}
