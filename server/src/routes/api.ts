import { getEnvStatus } from "../config.js";
import { Router } from "express";
import { processChat, processCapture } from "../services/chat.js";
import { addWatchedRepo, checkRepo, listWatchedRepos, syncUserRepos, getGitHubStatus } from "../services/github.js";
import { addWatchedFolder, listWatchedFolders } from "../services/folder.js";
import { getDb } from "../db/index.js";

export const router = Router();

router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message?.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    const result = await processChat(message.trim(), { source: "dashboard" });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Chat failed" });
  }
});

router.post("/capture", async (req, res) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text?.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    const result = await processCapture(text.trim(), { source: "dashboard" });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Capture failed" });
  }
});

router.get("/projects", (_req, res) => {
  const projects = getDb()
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status IN ('open','blocked')) as open_tasks,
        (SELECT COUNT(*) FROM project_updates pu WHERE pu.project_id = p.id) as update_count
       FROM projects p ORDER BY p.updated_at DESC`
    )
    .all();
  res.json(projects);
});

router.get("/projects/:id", (req, res) => {
  const id = Number(req.params.id);
  const project = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const updates = getDb()
    .prepare("SELECT * FROM project_updates WHERE project_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(id);
  const tasks = getDb()
    .prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC")
    .all(id);
  const decisions = getDb()
    .prepare("SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at DESC")
    .all(id);
  res.json({ project, updates, tasks, decisions });
});

router.get("/tasks", (_req, res) => {
  const tasks = getDb()
    .prepare(
      `SELECT t.*, p.name as project_name FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       ORDER BY CASE t.status WHEN 'blocked' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, t.due_date`
    )
    .all();
  res.json(tasks);
});

router.get("/reminders", (_req, res) => {
  const reminders = getDb()
    .prepare(
      `SELECT r.*, p.name as project_name FROM reminders r
       LEFT JOIN projects p ON p.id = r.project_id
       ORDER BY r.due_at`
    )
    .all();
  res.json(reminders);
});

router.post("/watch/github", async (req, res) => {
  try {
    const { url, project_id } = req.body as { url?: string; project_id?: number };
    if (!url?.trim()) {
      res.status(400).json({ error: "url is required" });
      return;
    }
    const repo = addWatchedRepo(url.trim(), project_id ?? null);
    const summary = await checkRepo(repo.id);
    res.json({ repo, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to watch repo" });
  }
});

router.get("/watch/github", (_req, res) => {
  res.json(listWatchedRepos());
});

router.post("/watch/github/sync", async (_req, res) => {
  try {
    const result = await syncUserRepos();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "GitHub sync failed" });
  }
});

router.get("/github/status", (_req, res) => {
  res.json(getGitHubStatus());
});

router.post("/watch/folder", async (req, res) => {
  try {
    const { path: folderPath, project_id } = req.body as {
      path?: string;
      project_id?: number;
    };
    if (!folderPath?.trim()) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const folder = addWatchedFolder(folderPath.trim(), project_id ?? null);
    res.json({ folder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to watch folder" });
  }
});

router.get("/watch/folder", (_req, res) => {
  res.json(listWatchedFolders());
});

router.get("/updates", (_req, res) => {
  const updates = getDb()
    .prepare(
      `SELECT pu.*, p.name as project_name FROM project_updates pu
       JOIN projects p ON p.id = pu.project_id
       ORDER BY pu.created_at DESC LIMIT 50`
    )
    .all();
  res.json(updates);
});

router.get("/messages", (_req, res) => {
  const messages = getDb()
    .prepare("SELECT * FROM agent_messages ORDER BY created_at DESC LIMIT 100")
    .all();
  res.json(messages.reverse());
});

router.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), env: getEnvStatus() });
});
