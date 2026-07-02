import { getDb } from "../db/index.js";
import { chatCompletion } from "../agent/openai.js";
import { checkAllRepos } from "./github.js";
import { checkAllFolders } from "./folder.js";

export async function generateDailyBrief(date?: string): Promise<string> {
  const briefDate = date ?? new Date().toISOString().slice(0, 10);

  await checkAllRepos();
  await checkAllFolders();

  const db = getDb();
  const updates = db
    .prepare(
      `SELECT p.name, pu.title, pu.content, pu.source, pu.created_at
       FROM project_updates pu
       JOIN projects p ON p.id = pu.project_id
       WHERE date(pu.created_at) = date(?)
       ORDER BY pu.created_at DESC`
    )
    .all(briefDate) as {
    name: string;
    title: string;
    content: string;
    source: string;
    created_at: string;
  }[];

  const tasks = db
    .prepare(
      `SELECT t.title, t.status, t.due_date, t.blocked_reason, p.name as project
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status IN ('open', 'blocked')
       ORDER BY CASE t.status WHEN 'blocked' THEN 0 ELSE 1 END, t.due_date`
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
       WHERE status = 'pending' AND date(due_at) <= date(?)`
    )
    .all(briefDate) as { message: string; due_at: string }[];

  const staleProjects = db
    .prepare(
      `SELECT name, updated_at FROM projects
       WHERE status = 'active' AND updated_at < datetime('now', '-7 days')
       ORDER BY updated_at`
    )
    .all() as { name: string; updated_at: string }[];

  const watchedRepos = db
    .prepare("SELECT owner, repo, url, last_checked_at FROM watched_repos")
    .all() as { owner: string; repo: string; url: string; last_checked_at: string | null }[];

  const rawData = {
    date: briefDate,
    updates,
    tasks,
    reminders,
    staleProjects,
    watchedRepos,
  };

  const summary = await chatCompletion(
    [
      {
        role: "system",
        content: `Generate a concise daily brief for a personal project planner.
Structure with these sections:
## What changed?
## What needs attention?
## Focus today
## Blocked
## Reminders due

Be specific, actionable, and brief. Use bullet points.`,
      },
      { role: "user", content: JSON.stringify(rawData, null, 2) },
    ],
    { tier: "planning", temperature: 0.4 }
  );

  db.prepare(
    `INSERT INTO daily_briefs (brief_date, content) VALUES (?, ?)
     ON CONFLICT(brief_date) DO UPDATE SET content = excluded.content`
  ).run(briefDate, summary);

  return summary;
}

export function getTodayBrief(): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const row = getDb()
    .prepare("SELECT content FROM daily_briefs WHERE brief_date = ?")
    .get(today) as { content: string } | undefined;
  return row?.content ?? null;
}

export function markBriefSent(date?: string) {
  const briefDate = date ?? new Date().toISOString().slice(0, 10);
  getDb()
    .prepare("UPDATE daily_briefs SET sent_at = datetime('now') WHERE brief_date = ?")
    .run(briefDate);
}
