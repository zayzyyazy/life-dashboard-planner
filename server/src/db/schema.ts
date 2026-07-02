export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_date TEXT,
  blocked_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  message TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  title TEXT NOT NULL,
  rationale TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS watched_repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  url TEXT NOT NULL,
  last_checked_at TEXT,
  last_commit_sha TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner, repo),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS watched_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  path TEXT NOT NULL UNIQUE,
  last_checked_at TEXT,
  snapshot_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS daily_briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brief_date TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  classification TEXT,
  metadata TEXT,
  source TEXT NOT NULL DEFAULT 'dashboard',
  telegram_chat_id TEXT,
  telegram_message_id TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  transcript_text TEXT,
  raw_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT,
  summary TEXT,
  personal_work_context TEXT,
  university_context TEXT,
  personal_life_context TEXT,
  preferences TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'chat',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const DEFAULT_PROJECTS = [
  { name: "Marie / Leaping AI", description: "Leaping AI and Marie-related work" },
  { name: "MCP Server", description: "Model Context Protocol server project" },
  { name: "QA Call Analysis App", description: "Call QA and analysis tooling" },
  { name: "Project Planner", description: "Project planning tools and workflows" },
  { name: "Life Planner Agent", description: "This personal life planner agent" },
  { name: "University", description: "Courses, assignments, exams, and campus work" },
];
