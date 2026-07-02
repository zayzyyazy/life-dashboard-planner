import { getDb, setSetting } from "../db/index.js";
import type { ClassificationResult } from "../agent/classifier.js";
import {
  addKnowledge,
  domainLabel,
  inferDomainFromText,
} from "./profile.js";
import { isLifeDomain, type LifeDomain } from "../types/domains.js";

export type MessageSource = "dashboard" | "telegram" | "api";
export type MessageType = "text" | "voice" | "command";

export interface AgentMessageInput {
  role: string;
  content: string;
  classification?: string;
  source?: MessageSource;
  messageType?: MessageType;
  telegramChatId?: string;
  telegramMessageId?: string;
  transcriptText?: string;
  rawText?: string;
  metadata?: Record<string, unknown>;
}

export function saveAgentMessage(input: AgentMessageInput) {
  const {
    role,
    content,
    classification,
    source = "dashboard",
    messageType = "text",
    telegramChatId,
    telegramMessageId,
    transcriptText,
    rawText,
    metadata,
  } = input;

  getDb()
    .prepare(
      `INSERT INTO agent_messages (
        role, content, classification, metadata,
        source, telegram_chat_id, telegram_message_id,
        message_type, transcript_text, raw_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      role,
      content,
      classification ?? null,
      metadata ? JSON.stringify(metadata) : null,
      source,
      telegramChatId ?? null,
      telegramMessageId ?? null,
      messageType,
      transcriptText ?? null,
      rawText ?? null
    );
}

export function getLastTelegramMessageAt(): string | null {
  const row = getDb()
    .prepare(
      `SELECT created_at FROM agent_messages
       WHERE source = 'telegram' ORDER BY created_at DESC LIMIT 1`
    )
    .get() as { created_at: string } | undefined;
  return row?.created_at ?? null;
}

export function getLastUserActivityAt(): string | null {
  const row = getDb()
    .prepare(
      `SELECT created_at FROM agent_messages
       WHERE role = 'user' ORDER BY created_at DESC LIMIT 1`
    )
    .get() as { created_at: string } | undefined;
  return row?.created_at ?? null;
}

export interface ConversationTurn {
  role: string;
  content: string;
}

/** Recent chat turns in chronological order (for LLM context). */
export function getRecentConversation(
  limit = 16,
  options: { excludeLatest?: boolean } = {}
): ConversationTurn[] {
  const fetchLimit = options.excludeLatest ? limit + 1 : limit;
  const rows = getDb()
    .prepare(
      `SELECT role, content FROM agent_messages
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(fetchLimit) as ConversationTurn[];
  const ordered = rows.reverse();
  if (options.excludeLatest && ordered.length > 0) {
    ordered.pop();
  }
  return ordered.slice(-limit);
}

export function formatConversationForClassifier(turns: ConversationTurn[]): string {
  if (turns.length === 0) return "(no prior messages)";
  return turns.map((t) => `${t.role}: ${t.content}`).join("\n");
}

export function findTaskId(title: string | null): number | null {
  if (!title?.trim()) return null;
  const db = getDb();
  const tasks = db
    .prepare(
      `SELECT id, title FROM tasks WHERE status IN ('open', 'blocked') ORDER BY updated_at DESC`
    )
    .all() as { id: number; title: string }[];
  const lower = title.toLowerCase().trim();
  const exact = tasks.find((t) => t.title.toLowerCase() === lower);
  if (exact) return exact.id;
  const partial = tasks.find(
    (t) =>
      t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase())
  );
  return partial?.id ?? null;
}

export function completeTaskByMatch(
  title: string
): { id: number; title: string } | null {
  const id = findTaskId(title);
  if (!id) return null;
  const db = getDb();
  const task = db.prepare("SELECT id, title FROM tasks WHERE id = ?").get(id) as
    | { id: number; title: string }
    | undefined;
  if (!task) return null;
  db.prepare(
    `UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?`
  ).run(id);
  return task;
}

export function listOpenTasksForClassifier(): string {
  const tasks = getDb()
    .prepare(
      `SELECT t.title, t.status, t.due_date, p.name as project
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status IN ('open', 'blocked')
       ORDER BY t.due_date LIMIT 20`
    )
    .all() as {
    title: string;
    status: string;
    due_date: string | null;
    project: string | null;
  }[];
  if (tasks.length === 0) return "(none)";
  return tasks
    .map((t) => {
      const due = t.due_date ? ` due ${t.due_date.slice(0, 10)}` : "";
      const proj = t.project ? ` [${t.project}]` : "";
      const blocked = t.status === "blocked" ? " (blocked)" : "";
      return `- ${t.title}${proj}${due}${blocked}`;
    })
    .join("\n");
}

export function findProjectId(name: string | null): number | null {
  if (!name) return null;
  const db = getDb();
  const exact = db
    .prepare("SELECT id FROM projects WHERE name = ? COLLATE NOCASE")
    .get(name) as { id: number } | undefined;
  if (exact) return exact.id;

  const fuzzy = db
    .prepare("SELECT id, name FROM projects")
    .all() as { id: number; name: string }[];
  const lower = name.toLowerCase();
  const match = fuzzy.find(
    (p) =>
      p.name.toLowerCase().includes(lower) ||
      lower.includes(p.name.toLowerCase().split("/")[0].trim())
  );
  return match?.id ?? null;
}

export function listProjectNames(): string {
  const projects = getDb()
    .prepare("SELECT name FROM projects ORDER BY name")
    .all() as { name: string }[];
  return projects.map((p) => p.name).join(", ");
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export type ReplyStyle = "normal" | "short";

export async function handleClassification(
  message: string,
  result: ClassificationResult,
  options: { replyStyle?: ReplyStyle; updateSource?: string } = {}
): Promise<{ reply: string; actions: string[] }> {
  const db = getDb();
  const actions: string[] = [];
  const projectId = findProjectId(result.project_name);
  const { extracted } = result;
  const short = options.replyStyle === "short";
  const updateSource = options.updateSource ?? "chat";

  if (result.needs_clarification && result.clarification_question) {
    return { reply: result.clarification_question, actions };
  }

  switch (result.classification) {
    case "project_update": {
      if (!projectId) {
        return {
          reply: short
            ? `Which project? ${listProjectNames()}`
            : `Which project should I attach this to? (${listProjectNames()})`,
          actions,
        };
      }
      db.prepare(
        "INSERT INTO project_updates (project_id, source, title, content) VALUES (?, ?, ?, ?)"
      ).run(
        projectId,
        updateSource,
        extracted.title ?? "Update",
        extracted.content ?? message
      );
      db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
      actions.push("saved_project_update");
      return {
        reply: short
          ? `Added to ${result.project_name}.`
          : `Added update to ${result.project_name}: ${extracted.title ?? extracted.content ?? message}`,
        actions,
      };
    }

    case "task": {
      db.prepare(
        `INSERT INTO tasks (project_id, title, description, due_date, blocked_reason, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        projectId,
        extracted.title ?? message.slice(0, 120),
        extracted.content ?? message,
        extracted.due_at ?? null,
        extracted.blocked_reason ?? null,
        extracted.blocked_reason ? "blocked" : "open"
      );
      actions.push("created_task");
      const due = extracted.due_at
        ? short
          ? ` Due ${formatShortDate(extracted.due_at)}.`
          : ` (due ${extracted.due_at})`
        : "";
      const blocked = extracted.blocked_reason
        ? short
          ? ` Blocked: ${extracted.blocked_reason}.`
          : ` [blocked: ${extracted.blocked_reason}]`
        : "";
      const remindNote =
        extracted.due_at && short
          ? " I'll remind you when it's due."
          : extracted.due_at
            ? " I'll ping you when it's due."
            : "";
      return {
        reply: short
          ? `Task saved.${due}${blocked}${remindNote}`
          : `Task created${due}${blocked}.${remindNote}`,
        actions,
      };
    }

    case "task_complete": {
      const matchTitle = extracted.title ?? extracted.content ?? message;
      const completed = completeTaskByMatch(matchTitle);
      if (!completed) {
        const open = listOpenTasksForClassifier();
        return {
          reply: short
            ? `Couldn't find that task. Open:\n${open}`
            : `Couldn't find an open task matching "${matchTitle}". Open tasks:\n${open}`,
          actions,
        };
      }
      actions.push("completed_task");
      return {
        reply: short
          ? `Marked done: ${completed.title}.`
          : `Marked complete: ${completed.title}`,
        actions,
      };
    }

    case "reminder": {
      const dueAt = extracted.due_at ?? tomorrowIso();
      db.prepare(
        "INSERT INTO reminders (project_id, message, due_at) VALUES (?, ?, ?)"
      ).run(projectId, extracted.content ?? message, dueAt);
      actions.push("created_reminder");
      return {
        reply: short
          ? `Reminder saved for ${formatShortDate(dueAt)}.`
          : `Reminder set for ${dueAt}: ${extracted.content ?? message}`,
        actions,
      };
    }

    case "decision": {
      db.prepare(
        "INSERT INTO decisions (project_id, title, rationale) VALUES (?, ?, ?)"
      ).run(projectId, extracted.title ?? "Decision", extracted.content ?? message);
      actions.push("saved_decision");
      return {
        reply: short
          ? `Decision saved${result.project_name ? ` for ${result.project_name}` : ""}.`
          : `Decision recorded${result.project_name ? ` for ${result.project_name}` : ""}.`,
        actions,
      };
    }

    case "watch_request": {
      if (extracted.repo_url) {
        try {
          const { addWatchedRepo, checkRepo } = await import("./github.js");
          const repo = addWatchedRepo(extracted.repo_url, projectId);
          await checkRepo(repo.id);
          actions.push("watched_repo");
          return {
            reply: short
              ? `Repo added to watchers: ${repo.owner}/${repo.repo}.`
              : `Now watching ${repo.owner}/${repo.repo}.`,
            actions,
          };
        } catch (err) {
          return {
            reply: `Couldn't watch repo: ${err instanceof Error ? err.message : "unknown error"}`,
            actions,
          };
        }
      }
      if (extracted.folder_path) {
        try {
          const { addWatchedFolder } = await import("./folder.js");
          const folder = addWatchedFolder(extracted.folder_path, projectId);
          actions.push("watched_folder");
          return {
            reply: short
              ? `Folder added to watchers.`
              : `Now watching folder: ${folder.path}`,
            actions,
          };
        } catch (err) {
          return {
            reply: `Couldn't watch folder: ${err instanceof Error ? err.message : "unknown error"}`,
            actions,
          };
        }
      }
      return {
        reply: short
          ? "Send a GitHub URL or folder path to watch."
          : "Share a GitHub repo URL or local folder path to watch.",
        actions,
      };
    }

    case "brief_request": {
      setSetting("daily_brief_enabled", "true");
      actions.push("enabled_daily_brief");
      try {
        const { generateDailyBrief } = await import("./brief.js");
        const brief = await generateDailyBrief();
        actions.push("generated_brief");
        const preview = short ? brief.slice(0, 3500) : brief;
        return {
          reply: short
            ? `Daily brief enabled. Here's today:\n\n${preview}`
            : `Daily brief enabled. Here's today's brief:\n\n${brief}`,
          actions,
        };
      } catch {
        return {
          reply: short
            ? "Daily brief enabled. Use /brief to get today's brief."
            : "Daily brief enabled. I'll email your morning brief at the configured time.",
          actions,
        };
      }
    }

    case "profile_memory":
    case "general_memory": {
      const domain = resolveLifeDomain(result, message);
      const title = extracted.title ?? "Note";
      const content = extracted.content ?? message;
      addKnowledge({
        domain,
        title,
        content,
        source: updateSource,
      });
      actions.push("saved_knowledge");
      return {
        reply: short
          ? `Saved to your ${domainLabel(domain)} knowledge.`
          : `Saved to your ${domainLabel(domain)} knowledge: ${title}`,
        actions,
      };
    }

    case "question":
    case "general_memory":
    case "general":
    default:
      return { reply: "", actions };
  }
}

export async function buildContext(): Promise<string> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const projects = db
    .prepare(
      `SELECT name, status, updated_at FROM projects WHERE status = 'active' ORDER BY updated_at DESC LIMIT 12`
    )
    .all() as { name: string; status: string; updated_at: string }[];

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
      `SELECT message, due_at FROM reminders
       WHERE status = 'pending' AND datetime(due_at) >= datetime('now')
       ORDER BY due_at LIMIT 10`
    )
    .all() as { message: string; due_at: string }[];

  const overdueReminders = db
    .prepare(
      `SELECT COUNT(*) as c FROM reminders
       WHERE status = 'pending' AND datetime(due_at) < datetime('now')`
    )
    .get() as { c: number };

  const updates = db
    .prepare(
      `SELECT p.name, pu.title, pu.content, pu.created_at
       FROM project_updates pu
       JOIN projects p ON p.id = pu.project_id
       WHERE date(pu.created_at) >= date('now', '-3 days')
       ORDER BY pu.created_at DESC LIMIT 12`
    )
    .all() as { name: string; title: string; content: string; created_at: string }[];

  const lines: string[] = [`Today: ${today}`, ""];

  lines.push("### Active projects");
  if (projects.length === 0) {
    lines.push("(none)");
  } else {
    for (const p of projects) {
      lines.push(`- ${p.name} (updated ${p.updated_at.slice(0, 10)})`);
    }
  }

  lines.push("", "### Open tasks");
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

  lines.push("", "### Upcoming reminders");
  if (reminders.length === 0) {
    lines.push(overdueReminders.c > 0 ? `(none upcoming; ${overdueReminders.c} overdue)` : "(none)");
  } else {
    for (const r of reminders) {
      lines.push(`- ${r.message} · ${r.due_at.slice(0, 16).replace("T", " ")}`);
    }
  }

  lines.push("", "### Recent project updates (last 3 days)");
  if (updates.length === 0) {
    lines.push("(none)");
  } else {
    for (const u of updates) {
      const preview =
        u.content.length > 120 ? u.content.slice(0, 117) + "…" : u.content;
      lines.push(`- ${u.name}: ${u.title} — ${preview}`);
    }
  }

  return lines.join("\n");
}

function resolveLifeDomain(result: ClassificationResult, message: string): LifeDomain {
  const fromClassifier = result.life_domain ?? result.extracted.life_domain;
  if (fromClassifier && isLifeDomain(fromClassifier)) return fromClassifier;
  return inferDomainFromText(message);
}
