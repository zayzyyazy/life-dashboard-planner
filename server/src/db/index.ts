import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { DEFAULT_PROJECTS, SCHEMA_SQL } from "./schema.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const dbPath = path.join(config.dataDir, "life-planner.db");
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
    migrateAgentMessages(db);
    migrateUserTables(db);
    seedDefaults(db);
  }
  return db;
}

function migrateAgentMessages(database: Database.Database) {
  const cols = database
    .prepare("PRAGMA table_info(agent_messages)")
    .all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  const additions: [string, string][] = [
    ["source", "TEXT NOT NULL DEFAULT 'dashboard'"],
    ["telegram_chat_id", "TEXT"],
    ["telegram_message_id", "TEXT"],
    ["message_type", "TEXT NOT NULL DEFAULT 'text'"],
    ["transcript_text", "TEXT"],
    ["raw_text", "TEXT"],
  ];
  for (const [name, definition] of additions) {
    if (!names.has(name)) {
      database.exec(`ALTER TABLE agent_messages ADD COLUMN ${name} ${definition}`);
    }
  }
}

function migrateUserTables(database: Database.Database) {
  database.exec(`
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
  `);
  const profile = database.prepare("SELECT id FROM user_profile WHERE id = 1").get();
  if (!profile) {
    database.prepare("INSERT INTO user_profile (id) VALUES (1)").run();
  }
}

function seedDefaults(database: Database.Database) {
  const insertProject = database.prepare(
    "INSERT OR IGNORE INTO projects (name, description) VALUES (?, ?)"
  );
  for (const project of DEFAULT_PROJECTS) {
    insertProject.run(project.name, project.description);
  }

  const insertSetting = database.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  insertSetting.run("daily_brief_enabled", "false");
  insertSetting.run("agent_name", "Life Planner");
}

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, value);
}
