import { getDb } from "../db/index.js";
import { getGitHubContextForBuildContext } from "./github-chat.js";

export type ContextSource = "dashboard" | "telegram" | "api";

const UPDATE_PREVIEW = 600;
const THREAD_PREVIEW = 500;

/** Recent chat turns for LLM — prioritize Telegram thread continuity. */
export function buildConversationThreadContext(
  limit = 20,
  source?: ContextSource
): string {
  const db = getDb();
  const rows = source
    ? (db
        .prepare(
          `SELECT role, content, message_type, created_at FROM agent_messages
           WHERE source = ?
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(source, limit) as {
        role: string;
        content: string;
        message_type: string;
        created_at: string;
      }[])
    : (db
        .prepare(
          `SELECT role, content, message_type, created_at FROM agent_messages
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(limit) as {
        role: string;
        content: string;
        message_type: string;
        created_at: string;
      }[]);

  if (rows.length === 0) return "(no prior messages)";

  const ordered = rows.reverse();
  return ordered
    .map((t) => {
      const tag = t.message_type === "voice" ? " [voice]" : "";
      const text =
        t.content.length > THREAD_PREVIEW
          ? t.content.slice(0, THREAD_PREVIEW - 1) + "…"
          : t.content;
      return `${t.role}${tag}: ${text}`;
    })
    .join("\n");
}

/** Per-project narrative from recent updates — full detail for memory. */
export function buildProjectMemoryContext(): string {
  const db = getDb();
  const projects = db
    .prepare(
      `SELECT id, name FROM projects WHERE status = 'active' ORDER BY updated_at DESC LIMIT 10`
    )
    .all() as { id: number; name: string }[];

  if (projects.length === 0) return "(no active projects)";

  const lines: string[] = [];
  for (const p of projects) {
    const updates = db
      .prepare(
        `SELECT content, created_at FROM project_updates
         WHERE project_id = ?
         ORDER BY created_at DESC LIMIT 5`
      )
      .all(p.id) as { content: string; created_at: string }[];

    if (updates.length === 0) continue;

    lines.push(`**${p.name}**`);
    for (const u of updates) {
      const text =
        u.content.length > UPDATE_PREVIEW
          ? u.content.slice(0, UPDATE_PREVIEW - 1) + "…"
          : u.content;
      lines.push(`- [${u.created_at.slice(0, 10)}] ${text}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim() || "(no project updates yet)";
}

export async function buildRichContext(options: { source?: ContextSource } = {}): Promise<string> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const tasks = db
    .prepare(
      `SELECT t.title, t.status, t.due_date, t.blocked_reason, p.name as project
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status IN ('open', 'blocked')
       ORDER BY CASE t.status WHEN 'blocked' THEN 0 ELSE 1 END,
                CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date
       LIMIT 15`
    )
    .all() as {
    title: string;
    status: string;
    due_date: string | null;
    blocked_reason: string | null;
    project: string | null;
  }[];

  const reminders = db
    .prepare(
      `SELECT message, due_at, status FROM reminders
       WHERE status = 'pending'
       ORDER BY due_at LIMIT 12`
    )
    .all() as { message: string; due_at: string; status: string }[];

  const decisions = db
    .prepare(
      `SELECT title, rationale, created_at FROM decisions
       ORDER BY created_at DESC LIMIT 8`
    )
    .all() as { title: string; rationale: string | null; created_at: string }[];

  const knowledge = db
    .prepare(
      `SELECT domain, title, content FROM user_knowledge
       ORDER BY updated_at DESC LIMIT 15`
    )
    .all() as { domain: string; title: string; content: string }[];

  const lines: string[] = [`Today: ${today}`, ""];

  lines.push("### Active conversation thread (READ THIS — answer in context of this thread)");
  lines.push(buildConversationThreadContext(20, options.source ?? "telegram"));
  lines.push("");

  lines.push("### Project memory (what he's actually working on — use names, blockers, goals)");
  lines.push(buildProjectMemoryContext());
  lines.push("");

  lines.push("### Open tasks");
  if (tasks.length === 0) {
    lines.push("(none)");
  } else {
    for (const t of tasks) {
      const due = t.due_date ? ` · due ${t.due_date.slice(0, 10)}` : "";
      const proj = t.project ? ` · ${t.project}` : "";
      const blocked = t.blocked_reason ? ` · BLOCKED: ${t.blocked_reason}` : "";
      lines.push(`- [${t.status}] ${t.title}${proj}${due}${blocked}`);
    }
  }

  lines.push("", "### Reminders (pending)");
  if (reminders.length === 0) {
    lines.push("(none)");
  } else {
    for (const r of reminders) {
      const due = new Date(r.due_at).toLocaleString("en-GB", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      lines.push(`- ${r.message} · ${due}`);
    }
  }

  if (decisions.length > 0) {
    lines.push("", "### Recent decisions");
    for (const d of decisions) {
      lines.push(`- ${d.title}${d.rationale ? `: ${d.rationale.slice(0, 200)}` : ""}`);
    }
  }

  if (knowledge.length > 0) {
    lines.push("", "### Saved notes about him");
    for (const k of knowledge) {
      lines.push(`- [${k.domain}] ${k.title}: ${k.content.slice(0, 250)}`);
    }
  }

  const githubSection = await getGitHubContextForBuildContext();
  lines.push("", githubSection);

  return lines.join("\n");
}
