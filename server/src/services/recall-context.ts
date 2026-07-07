/**
 * Auto-recall: search vault + project memory without user saying /search or /ask.
 */
import { getDb } from "../db/index.js";
import { searchVault } from "./obsidian-brain.js";
import { getRecentConversation } from "./memory.js";

const RECALL_CLASSIFICATIONS = new Set([
  "general",
  "question",
  "project_update",
  "general_memory",
  "decision",
  "greeting",
]);

export function shouldAutoRecall(classification: string): boolean {
  return RECALL_CLASSIFICATIONS.has(classification);
}

function buildSearchQuery(message: string, historyLimit = 2): string {
  const recent = getRecentConversation(historyLimit, { excludeLatest: true });
  const userTurns = recent.filter((t) => t.role === "user").slice(-2);
  const parts = [...userTurns.map((t) => t.content), message]
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.join(" ").slice(0, 400);
}

function searchProjectMemory(query: string): string[] {
  const db = getDb();
  const q = `%${query.slice(0, 80)}%`;
  const updates = db
    .prepare(
      `SELECT pu.title, pu.content, pu.created_at, p.name as project
       FROM project_updates pu
       JOIN projects p ON p.id = pu.project_id
       WHERE pu.content LIKE ? OR pu.title LIKE ? OR p.name LIKE ?
       ORDER BY pu.created_at DESC LIMIT 5`
    )
    .all(q, q, q) as {
    title: string;
    content: string;
    created_at: string;
    project: string;
  }[];

  return updates.map(
    (u) =>
      `[${u.created_at.slice(0, 10)}] ${u.project} — ${u.title}: ${u.content.slice(0, 200)}`
  );
}

function searchUserKnowledge(query: string): string[] {
  const db = getDb();
  const q = `%${query.slice(0, 80)}%`;
  const rows = db
    .prepare(
      `SELECT domain, title, content, created_at FROM user_knowledge
       WHERE content LIKE ? OR title LIKE ?
       ORDER BY updated_at DESC LIMIT 4`
    )
    .all(q, q) as { domain: string; title: string; content: string; created_at: string }[];

  return rows.map(
    (r) => `[${r.domain}] ${r.title} (${r.created_at.slice(0, 10)}): ${r.content.slice(0, 180)}`
  );
}

export async function autoRecallContext(
  message: string,
  classification: string
): Promise<string | null> {
  if (!shouldAutoRecall(classification)) return null;

  const query = buildSearchQuery(message);
  if (query.length < 4) return null;

  const lines: string[] = [];

  try {
    const hits = await searchVault(query, 5);
    if (hits.length > 0) {
      lines.push("From your Obsidian notes:");
      for (const h of hits) {
        const age = h.path.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
        const ageNote = age ? ` (${age})` : "";
        lines.push(
          `- **${h.title}**${ageNote} — ${h.path}\n  ${h.snippet.slice(0, 160).replace(/\n/g, " ")}`
        );
      }
    }
  } catch (err) {
    console.warn("[recall] vault search failed:", err);
  }

  const projectHits = searchProjectMemory(query);
  if (projectHits.length > 0) {
    lines.push("", "From project memory:");
    for (const p of projectHits) lines.push(`- ${p}`);
  }

  const knowledgeHits = searchUserKnowledge(query);
  if (knowledgeHits.length > 0) {
    lines.push("", "From saved knowledge:");
    for (const k of knowledgeHits) lines.push(`- ${k}`);
  }

  if (lines.length === 0) return null;
  return lines.join("\n");
}

export function recallAddon(recallExcerpt: string | null): string {
  if (!recallExcerpt?.trim()) return "";
  return `

## Recall from your notes (USE THIS — cite specific notes/dates when relevant)
${recallExcerpt.trim()}

When the user expands a topic, connect new info to what they already wrote. Surface things they may have forgotten — "you noted X on DATE" — without being asked.`;
}
