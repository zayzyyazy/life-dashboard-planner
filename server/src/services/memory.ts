import { getDb, setSetting } from "../db/index.js";
import type { ClassificationResult } from "../agent/classifier.js";
import {
  addKnowledge,
  domainLabel,
  getProfile,
  inferDomainFromText,
  updateProfile,
} from "./profile.js";
import { isLifeDomain, type LifeDomain } from "../types/domains.js";
import { buildRichContext } from "./context-builder.js";
import { resolveProject, resolveProjectMatches, formatProjectClarification } from "./project-resolve.js";
import { appendObsidianTask } from "./obsidian-tasks.js";
import {
  looksLikeNewBuildingProject,
  extractProjectNameFromThread,
  buildThreadActionContext,
} from "./save-context.js";
import { normalizeDueAt, parseDueDate, formatDueForUser, formatReminderConfirmation, extractReminderContent, looksLikeStatusUpdate } from "../agent/parse-due.js";

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
  return resolveProject(name)?.id ?? null;
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
  options: {
    replyStyle?: ReplyStyle;
    updateSource?: string;
    recentTurns?: ConversationTurn[];
  } = {}
): Promise<{ reply: string; actions: string[]; actionContext?: string }> {
  const db = getDb();
  const actions: string[] = [];
  const projectId = findProjectId(result.project_name);
  const { extracted } = result;
  const short = options.replyStyle === "short";
  const updateSource = options.updateSource ?? "chat";
  const recentTurns = options.recentTurns ?? [];

  if (result.needs_clarification && result.clarification_question) {
    if (result.classification === "reminder" && result.extracted.content) {
      setSetting("pending_reminder_draft", result.extracted.content);
    }
    return { reply: result.clarification_question, actions };
  }

  switch (result.classification) {
    case "project_update": {
      const matches = resolveProjectMatches(result.project_name ?? message);
      const resolved = resolveProject(result.project_name ?? message);
      const pid = resolved?.id ?? projectId;
      const content = extracted.content ?? message;
      const threadProject = extractProjectNameFromThread(message, recentTurns);
      const unknownNamedProject =
        Boolean(result.project_name?.trim()) && !findProjectId(result.project_name);

      // New or unknown project — auto-save to Obsidian, never ask to pick from sqlite list
      if (
        !pid &&
        (looksLikeNewBuildingProject(message, recentTurns) ||
          threadProject ||
          unknownNamedProject)
      ) {
        const name =
          threadProject ?? result.project_name ?? extracted.title ?? "Personal build";
        actions.push("evolving_project");
        return {
          reply: "",
          actions,
          actionContext: `Building project "${name}": ${content.slice(0, 600)}`,
        };
      }

      if (!pid && matches.length > 1) {
        return {
          reply: short
            ? formatProjectClarification(matches)
            : formatProjectClarification(matches),
          actions,
        };
      }
      if (!pid) {
        if (looksLikeNewBuildingProject(message, recentTurns)) {
          actions.push("evolving_project");
          return {
            reply: "",
            actions,
            actionContext: `Project discussion: ${content.slice(0, 600)}`,
          };
        }
        // Explicit "add to X" with no match — ask once
        if (/\badd (this|that) to\b/i.test(message)) {
          return {
            reply: short
              ? `Which project? ${listProjectNames()}`
              : `Which project should I attach this to? (${listProjectNames()})`,
            actions,
          };
        }
        // Generic project chatter — treat as new evolving project
        actions.push("evolving_project");
        return {
          reply: "",
          actions,
          actionContext: `Project discussion: ${content.slice(0, 600)}`,
        };
      }
      db.prepare(
        "INSERT INTO project_updates (project_id, source, title, content) VALUES (?, ?, ?, ?)"
      ).run(
        pid,
        updateSource,
        extracted.title ?? "Update",
        extracted.content ?? message
      );
      db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(pid);
      actions.push("saved_project_update");
      const projectLabel = resolved?.name ?? result.project_name ?? "project";
      return {
        reply: "",
        actions,
        actionContext: `Project update on ${projectLabel}: ${content.slice(0, 400)}`,
      };
    }

    case "task": {
      const dueDate = normalizeDueAt(extracted.due_at);
      db.prepare(
        `INSERT INTO tasks (project_id, title, description, due_date, blocked_reason, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        projectId,
        extracted.title ?? message.slice(0, 120),
        extracted.content ?? message,
        dueDate,
        extracted.blocked_reason ?? null,
        extracted.blocked_reason ? "blocked" : "open"
      );
      actions.push("created_task");
      const title = extracted.title ?? message.slice(0, 120);
      const dueNote = dueDate ? ` (due ${formatShortDate(dueDate)})` : "";
      const blockedNote = extracted.blocked_reason ? ` [blocked: ${extracted.blocked_reason}]` : "";
      void appendObsidianTask({
        title,
        dueDate,
        projectName: result.project_name,
      });
      return {
        reply: "",
        actions,
        actionContext: `Task created: ${title}${dueNote}${blockedNote}`,
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
        reply: "",
        actions,
        actionContext: `Marked task complete: ${completed.title}`,
      };
    }

    case "reminder": {
      if (looksLikeStatusUpdate(message)) {
        const domain = /\b(uni|university|campus)\b/i.test(message) ? "university" : "general";
        addKnowledge({
          domain: domain as LifeDomain,
          title: "Status",
          content: message,
          source: updateSource,
        });
        actions.push("saved_knowledge");
        return {
          reply: "",
          actions,
          actionContext: `Status/availability (NOT a reminder): ${message}`,
        };
      }

      const dueAt =
        normalizeDueAt(extracted.due_at) ?? parseDueDate(message) ?? null;
      if (!dueAt) {
        return {
          reply: short
            ? "When should I remind you? (e.g. in 5 minutes, at 23:30, tomorrow 9am)"
            : "When should I remind you? (e.g. in 5 minutes, at 23:30, or Thursday at 18:00)",
          actions,
        };
      }
      const reminderText = extracted.content ?? extractReminderContent(message);
      db.prepare(
        "INSERT INTO reminders (project_id, message, due_at) VALUES (?, ?, ?)"
      ).run(projectId, reminderText, dueAt);
      actions.push("created_reminder");
      setSetting("pending_reminder_draft", "");

      void appendObsidianTask({
        title: reminderText,
        dueDate: dueAt,
        projectName: result.project_name,
      });

      // Fire immediately if already due (or check within seconds)
      const { processDueReminders } = await import("./reminders.js");
      void processDueReminders().catch(console.error);

      const when = formatReminderConfirmation(dueAt);
      return {
        reply: short ? `Reminder set — ${when}.` : `Reminder set for ${when}: ${reminderText}`,
        actions,
      };
    }

    case "reminder_complaint": {
      const { processDueReminders, getDueReminders } = await import("./reminders.js");
      const overdue = getDueReminders();
      const pending = db
        .prepare(
          `SELECT message, due_at FROM reminders WHERE status = 'pending' ORDER BY due_at LIMIT 5`
        )
        .all() as { message: string; due_at: string }[];

      if (overdue.length > 0) {
        await processDueReminders();
        return {
          reply: short
            ? `Sorry — sending ${overdue.length} overdue reminder(s) now.`
            : `Sorry about that. Sending ${overdue.length} overdue reminder(s) now:\n${overdue.map((r) => `• ${r.message}`).join("\n")}`,
          actions: ["fired_reminders"],
        };
      }

      if (pending.length === 0) {
        return {
          reply: short
            ? "No pending reminders right now — want to set one?"
            : "I don't have any pending reminders. Want me to set one?",
          actions,
        };
      }

      const list = pending
        .map((r) => `• ${r.message} — ${formatDueForUser(r.due_at)}`)
        .join("\n");
      return {
        reply: short
          ? `Pending:\n${list}\nI'll ping you when each is due.`
          : `Your pending reminders:\n${list}\n\nThe agent checks every 15 seconds. Make sure the daemon is running.`,
        actions,
      };
    }

    case "decision": {
      if (looksLikeNewBuildingProject(message, recentTurns)) {
        const name =
          extractProjectNameFromThread(message, recentTurns) ??
          extracted.title ??
          result.project_name ??
          "Personal build";
        actions.push("evolving_project");
        return {
          reply: "",
          actions,
          actionContext: `Building project "${name}": ${(extracted.content ?? message).slice(0, 600)}`,
        };
      }
      db.prepare(
        "INSERT INTO decisions (project_id, title, rationale) VALUES (?, ?, ?)"
      ).run(projectId, extracted.title ?? "Decision", extracted.content ?? message);
      actions.push("saved_decision");
      return {
        reply: "",
        actions,
        actionContext: `Decision recorded${result.project_name ? ` (${result.project_name})` : ""}: ${(extracted.content ?? message).slice(0, 300)}`,
      };
    }

    case "watch_request": {
      if (extracted.repo_url) {
        try {
          const { addWatchedRepo, checkRepo } = await import("./github.js");
          const { refreshGitHubContext } = await import("./github-context.js");
          const repo = addWatchedRepo(extracted.repo_url, projectId);
          await checkRepo(repo.id);
          await refreshGitHubContext();
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
          const msg = err instanceof Error ? err.message : "unknown error";
          const friendly = msg.includes("does not exist")
            ? "That folder doesn't exist on this machine. Local folder watching only works on your Mac — use GitHub repo watching or save to Obsidian instead."
            : `Couldn't watch folder: ${msg}`;
          return { reply: friendly, actions };
        }
      }
      return {
        reply: short
          ? "Send a GitHub URL or folder path to watch."
          : "Share a GitHub repo URL or local folder path to watch.",
        actions,
      };
    }

    case "github_query": {
      const { answerGitHubQuestion } = await import("./github-chat.js");
      const reply = await answerGitHubQuestion(message, { short });
      actions.push("github_query");
      return { reply, actions };
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

    case "greeting": {
      const { config } = await import("../config.js");
      const tzHint =
        config.brief.timezone === "America/New_York"
          ? " (Tip: set TZ=Europe/Berlin in .env for correct times)"
          : "";
      if (/^no\b/i.test(message.trim())) {
        return {
          reply: short
            ? `Wrong time? Set TZ=Europe/Berlin in .env, restart daemon, then retry.${tzHint}`
            : `If the time was wrong, add TZ=Europe/Berlin to .env and restart, then try your reminder again.`,
          actions,
        };
      }
      return {
        reply: short
          ? "Hey — what's on your mind?"
          : "Hey — I'm here. Text or voice me anytime.",
        actions,
      };
    }

    case "profile_memory": {
      if (looksLikeNewBuildingProject(message, recentTurns)) {
        const name =
          extractProjectNameFromThread(message, recentTurns) ??
          extracted.title ??
          "Personal build";
        actions.push("evolving_project");
        return {
          reply: "",
          actions,
          actionContext: `Building project "${name}": ${(extracted.content ?? message).slice(0, 600)}`,
        };
      }
      const domain = resolveLifeDomain(result, message);
      const title = extracted.title ?? inferProfileTitle(message);
      const content = extracted.content ?? message;
      addKnowledge({ domain, title, content, source: updateSource });
      actions.push("saved_profile_memory");

      if (/\b(i\s+(like|love|prefer|enjoy|hate|dislike|don'?t\s+like))\b/i.test(message)) {
        const profile = getProfile();
        const line = `- ${content.trim()}`;
        const prefs = profile.preferences?.trim()
          ? `${profile.preferences.trim()}\n${line}`
          : line;
        updateProfile({ preferences: prefs.slice(0, 4000) });
      }

      return {
        reply: "",
        actions,
        actionContext: `Profile fact (${domainLabel(domain)} — ${title}): ${content.slice(0, 500)}`,
      };
    }

    case "general_memory": {
      if (looksLikeNewBuildingProject(message, recentTurns)) {
        const name =
          extractProjectNameFromThread(message, recentTurns) ??
          extracted.title ??
          "Personal build";
        actions.push("evolving_project");
        return {
          reply: "",
          actions,
          actionContext: `Building project "${name}": ${(extracted.content ?? message).slice(0, 600)}`,
        };
      }
      const domain = resolveLifeDomain(result, message);
      const title = extracted.title ?? "Note";
      const content = extracted.content ?? message;
      addKnowledge({ domain, title, content, source: updateSource });
      actions.push("saved_knowledge");
      return {
        reply: "",
        actions,
        actionContext: `${domainLabel(domain)} — ${title}: ${content.slice(0, 500)}`,
      };
    }

    case "question":
    case "general":
    default: {
      if (
        looksLikeNewBuildingProject(message, recentTurns) &&
        recentTurns.filter((t) => t.role === "user").length >= 1
      ) {
        const name = extractProjectNameFromThread(message, recentTurns);
        actions.push("evolving_project");
        return {
          reply: "",
          actions,
          actionContext: buildThreadActionContext(message, recentTurns, name),
        };
      }
      return { reply: "", actions };
    }
  }
}

export async function buildContext(
  options: {
    source?: MessageSource;
    vaultExcerpt?: string | null;
    recallExcerpt?: string | null;
  } = {}
): Promise<string> {
  return buildRichContext(options);
}

function inferProfileTitle(message: string): string {
  const trimmed = message.trim();
  const like = trimmed.match(/\bi\s+(like|love|prefer|enjoy)\s+(.+)/i);
  if (like) return `Likes: ${like[2]!.slice(0, 48).trim()}`;
  const dislike = trimmed.match(/\bi\s+(hate|dislike|don'?t\s+like)\s+(.+)/i);
  if (dislike) return `Dislikes: ${dislike[2]!.slice(0, 48).trim()}`;
  if (/remember:/i.test(trimmed)) return "Remembered fact";
  return trimmed.slice(0, 48) || "About me";
}

function resolveLifeDomain(result: ClassificationResult, message: string): LifeDomain {
  const fromClassifier = result.life_domain ?? result.extracted.life_domain;
  if (fromClassifier && isLifeDomain(fromClassifier)) return fromClassifier;
  return inferDomainFromText(message);
}
