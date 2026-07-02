import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { generateDailyBrief } from "../services/brief.js";
import { processChat } from "../services/chat.js";
import { addWatchedRepo, checkRepo } from "../services/github.js";
import { getProfile, listKnowledge, domainLabel } from "../services/profile.js";
import type { ClassificationResult } from "../agent/classifier.js";

export function isAuthorized(userId: number): boolean {
  if (config.telegram.allowedUserIds.length === 0) return false;
  return config.telegram.allowedUserIds.includes(String(userId));
}

export function logBlockedUser(chatId: number, userId: number, username?: string) {
  console.warn(
    `[telegram] Blocked message from user_id=${userId} chat_id=${chatId}` +
      (username ? ` username=@${username}` : "")
  );
}

export function logUnknownUser(chatId: number, userId: number, username?: string) {
  console.log(
    `[telegram] Message from unconfigured user — add to TELEGRAM_ALLOWED_USER_IDS:` +
      ` user_id=${userId} chat_id=${chatId}` +
      (username ? ` username=@${username}` : "")
  );
}

export const START_MESSAGE =
  "I'm your Life Planner Agent — programmed for you, not a generic bot. Send text or voice notes. I separate personal work, university, and life.";

export const HELP_MESSAGE = `Examples:
• What should I focus on today?
• Mark Marie API task done / finished the CRM integration
• For university: algorithms assignment due Friday
• Add this to Marie: Marc fixed the phone path
• Remind me tomorrow to ask Chris about CRM endpoints
• Task: deploy MCP server by Thursday

Commands:
/brief — today's brief
/github — live GitHub activity across your repos
/projects — saved projects
/tasks — open tasks
/reminders — upcoming reminders
/profile — what I know about you
/watchrepo <url> — watch a GitHub repo
/help — this message`;

export async function handleTextMessage(
  text: string,
  chatId: number,
  messageId: number,
  replyToText?: string
): Promise<string> {
  const combined =
    replyToText && replyToText.trim()
      ? `${text.trim()}\n[context: ${replyToText.trim().slice(0, 200)}]`
      : text;

  const result = await processChat(combined, {
    source: "telegram",
    messageType: "text",
    replyStyle: "short",
    telegramChatId: String(chatId),
    telegramMessageId: String(messageId),
    rawText: text,
    replyToText,
  });
  return result.reply;
}

export async function handleVoiceTranscript(
  transcript: string,
  chatId: number,
  messageId: number,
  preview: string
): Promise<string> {
  const result = await processChat(transcript, {
    source: "telegram",
    messageType: "voice",
    replyStyle: "short",
    telegramChatId: String(chatId),
    telegramMessageId: String(messageId),
    rawText: transcript,
    transcriptText: transcript,
  });

  if (result.classification.needs_clarification) {
    return `I heard: ${preview}. ${result.reply}`;
  }

  const savedAs = describeSavedAs(result.classification, result.actions);
  if (result.actions.length > 0) {
    return `I heard: ${preview}. Saved as ${savedAs}.`;
  }

  return `I heard: ${preview}. ${result.reply}`;
}

function describeSavedAs(classification: ClassificationResult, actions: string[]): string {
  if (actions.includes("completed_task")) return "task completed";
  if (actions.includes("saved_project_update")) return "project update";
  if (actions.includes("created_task")) return "task";
  if (actions.includes("created_reminder")) return "reminder";
  if (actions.includes("saved_knowledge")) return "personal knowledge";
  if (actions.includes("watched_repo")) return "repo watcher";
  if (actions.includes("watched_folder")) return "folder watcher";
  if (actions.includes("generated_brief")) return "daily brief";
  return classification.classification.replace(/_/g, " ");
}

export async function handleBriefCommand(): Promise<string> {
  const brief = await generateDailyBrief();
  const preview = brief.length > 3500 ? brief.slice(0, 3497) + "…" : brief;
  return `Today's brief:\n\n${preview}`;
}

export function handleProjectsCommand(): string {
  const projects = getDb()
    .prepare("SELECT name, status FROM projects ORDER BY name")
    .all() as { name: string; status: string }[];
  if (projects.length === 0) return "No projects saved yet.";
  return projects.map((p) => `• ${p.name} (${p.status})`).join("\n");
}

export function handleTasksCommand(): string {
  const tasks = getDb()
    .prepare(
      `SELECT t.title, t.status, t.due_date, p.name as project_name
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status IN ('open', 'blocked')
       ORDER BY t.due_date LIMIT 15`
    )
    .all() as {
    title: string;
    status: string;
    due_date: string | null;
    project_name: string | null;
  }[];
  if (tasks.length === 0) return "No open tasks.";
  return tasks
    .map((t) => {
      const due = t.due_date ? ` · due ${t.due_date.slice(0, 10)}` : "";
      const proj = t.project_name ? ` · ${t.project_name}` : "";
      return `• [${t.status}] ${t.title}${proj}${due}`;
    })
    .join("\n");
}

export function handleRemindersCommand(): string {
  const reminders = getDb()
    .prepare(
      `SELECT message, due_at, status FROM reminders
       WHERE status = 'pending' ORDER BY due_at LIMIT 15`
    )
    .all() as { message: string; due_at: string; status: string }[];
  if (reminders.length === 0) return "No upcoming reminders.";
  return reminders
    .map((r) => `• ${r.message} — ${new Date(r.due_at).toLocaleString()}`)
    .join("\n");
}

export function handleProfileCommand(): string {
  const profile = getProfile();
  const knowledge = listKnowledge().slice(0, 15);
  const parts: string[] = ["What I know about you:"];
  if (profile.name) parts.push(`Name: ${profile.name}`);
  if (profile.summary) parts.push(`Summary: ${profile.summary}`);
  if (profile.personal_work_context) {
    parts.push(`Work: ${profile.personal_work_context.slice(0, 200)}`);
  }
  if (profile.university_context) {
    parts.push(`University: ${profile.university_context.slice(0, 200)}`);
  }
  if (knowledge.length > 0) {
    parts.push("\nRecent knowledge:");
    for (const k of knowledge) {
      parts.push(`• [${domainLabel(k.domain)}] ${k.title}`);
    }
  }
  if (parts.length === 1) {
    return "I don't know much about you yet. Tell me: Remember about me: …";
  }
  const text = parts.join("\n");
  return text.length > 3500 ? text.slice(0, 3497) + "…" : text;
}

export async function handleWatchRepoCommand(url: string): Promise<string> {
  if (!url.trim()) return "Usage: /watchrepo https://github.com/owner/repo";
  try {
    const { refreshGitHubContext } = await import("../services/github-context.js");
    const repo = addWatchedRepo(url.trim());
    await checkRepo(repo.id);
    await refreshGitHubContext();
    return `Repo added to watchers: ${repo.owner}/${repo.repo}.`;
  } catch (err) {
    return `Couldn't watch repo: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}

export async function handleGitHubCommand(): Promise<string> {
  const { answerGitHubQuestion } = await import("../services/github-chat.js");
  return answerGitHubQuestion("What's happening across my GitHub repos right now?", {
    short: true,
  });
}
