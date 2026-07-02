import { getDb, setSetting } from "../db/index.js";
import { classifyMessage, type ClassificationResult } from "./classifier.js";
import { chatCompletion } from "./openai.js";

export interface ChatResult {
  reply: string;
  classification: ClassificationResult;
  actions: string[];
}

function findProjectId(name: string | null): number | null {
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

function saveAgentMessage(
  role: string,
  content: string,
  classification?: string,
  metadata?: Record<string, unknown>
) {
  getDb()
    .prepare(
      "INSERT INTO agent_messages (role, content, classification, metadata) VALUES (?, ?, ?, ?)"
    )
    .run(role, content, classification ?? null, metadata ? JSON.stringify(metadata) : null);
}

async function handleClassification(
  message: string,
  result: ClassificationResult
): Promise<{ reply: string; actions: string[] }> {
  const db = getDb();
  const actions: string[] = [];
  const projectId = findProjectId(result.project_name);
  const { extracted } = result;

  if (result.needs_clarification && result.clarification_question) {
    return { reply: result.clarification_question, actions };
  }

  switch (result.classification) {
    case "project_update": {
      if (!projectId) {
        return {
          reply: `Which project should I attach this to? (${listProjectNames()})`,
          actions,
        };
      }
      db.prepare(
        "INSERT INTO project_updates (project_id, source, title, content) VALUES (?, ?, ?, ?)"
      ).run(
        projectId,
        "chat",
        extracted.title ?? "Update",
        extracted.content ?? message
      );
      db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
      actions.push("saved_project_update");
      return {
        reply: `Added update to ${result.project_name}: ${extracted.title ?? extracted.content ?? message}`,
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
      const due = extracted.due_at ? ` (due ${extracted.due_at})` : "";
      const blocked = extracted.blocked_reason ? ` [blocked: ${extracted.blocked_reason}]` : "";
      return { reply: `Task created${due}${blocked}.`, actions };
    }

    case "reminder": {
      const dueAt = extracted.due_at ?? tomorrowIso();
      db.prepare(
        "INSERT INTO reminders (project_id, message, due_at) VALUES (?, ?, ?)"
      ).run(projectId, extracted.content ?? message, dueAt);
      actions.push("created_reminder");
      return { reply: `Reminder set for ${dueAt}: ${extracted.content ?? message}`, actions };
    }

    case "decision": {
      db.prepare(
        "INSERT INTO decisions (project_id, title, rationale) VALUES (?, ?, ?)"
      ).run(projectId, extracted.title ?? "Decision", extracted.content ?? message);
      actions.push("saved_decision");
      return { reply: `Decision recorded${result.project_name ? ` for ${result.project_name}` : ""}.`, actions };
    }

    case "watch_request": {
      if (extracted.repo_url) {
        try {
          const { addWatchedRepo, checkRepo } = await import("../services/github.js");
          const repo = addWatchedRepo(extracted.repo_url, projectId);
          const summary = await checkRepo(repo.id);
          actions.push("watched_repo");
          return {
            reply: summary
              ? `Watching ${repo.owner}/${repo.repo}. ${summary}`
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
          const { addWatchedFolder } = await import("../services/folder.js");
          const folder = addWatchedFolder(extracted.folder_path, projectId);
          actions.push("watched_folder");
          return { reply: `Now watching folder: ${folder.path}`, actions };
        } catch (err) {
          return {
            reply: `Couldn't watch folder: ${err instanceof Error ? err.message : "unknown error"}`,
            actions,
          };
        }
      }
      return { reply: "Share a GitHub repo URL or local folder path to watch.", actions };
    }

    case "brief_request": {
      setSetting("daily_brief_enabled", "true");
      actions.push("enabled_daily_brief");
      return {
        reply: "Daily brief enabled. I'll email your morning brief at the configured time. Use POST /brief/send-daily to send one now.",
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

function listProjectNames(): string {
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

export async function processChat(message: string): Promise<ChatResult> {
  saveAgentMessage("user", message);
  const today = new Date().toISOString().slice(0, 10);
  const classification = await classifyMessage(message, today);
  const handled = await handleClassification(message, classification);

  let reply = handled.reply;
  if (!reply) {
    const context = await buildContext();
    reply = await chatCompletion(
      [
        {
          role: "system",
          content: `You are a personal life/project planner assistant. Be concise and practical.
You help track projects, tasks, reminders, and daily planning.
Current context:\n${context}
Do not claim to run shell commands or delete files. Ask before destructive actions.`,
        },
        { role: "user", content: message },
      ],
      { tier: classification.classification === "question" ? "planning" : "default" }
    );
  }

  saveAgentMessage("assistant", reply, classification.classification, {
    actions: handled.actions,
  });

  return { reply, classification, actions: handled.actions };
}

export async function processCapture(text: string): Promise<ChatResult> {
  return processChat(text);
}

async function buildContext(): Promise<string> {
  const db = getDb();
  const projects = db
    .prepare("SELECT name, status FROM projects WHERE status = 'active' LIMIT 10")
    .all() as { name: string; status: string }[];
  const openTasks = db
    .prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('open', 'blocked')")
    .get() as { c: number };
  const dueReminders = db
    .prepare(
      "SELECT COUNT(*) as c FROM reminders WHERE status = 'pending' AND date(due_at) <= date('now')"
    )
    .get() as { c: number };

  return [
    `Active projects: ${projects.map((p) => p.name).join(", ")}`,
    `Open tasks: ${openTasks.c}`,
    `Reminders due today or overdue: ${dueReminders.c}`,
  ].join("\n");
}
