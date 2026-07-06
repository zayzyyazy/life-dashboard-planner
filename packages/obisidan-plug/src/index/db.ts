import Database from "better-sqlite3";
import { getIndexDbPath, ensureBrainDirs } from "../config.js";
import type { ScannedNote } from "../vault/scanner.js";

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  tags TEXT,
  anchors TEXT,
  body_text TEXT NOT NULL,
  modified_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  path UNINDEXED,
  title,
  body_text,
  tags,
  anchors,
  category,
  content='notes',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, path, title, body_text, tags, anchors, category)
  VALUES (new.rowid, new.path, new.title, new.body_text, new.tags, new.anchors, new.category);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, path, title, body_text, tags, anchors, category)
  VALUES ('delete', old.rowid, old.path, old.title, old.body_text, old.tags, old.anchors, old.category);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, path, title, body_text, tags, anchors, category)
  VALUES ('delete', old.rowid, old.path, old.title, old.body_text, old.tags, old.anchors, old.category);
  INSERT INTO notes_fts(rowid, path, title, body_text, tags, anchors, category)
  VALUES (new.rowid, new.path, new.title, new.body_text, new.tags, new.anchors, new.category);
END;
`;

export function getDb(): Database.Database {
  if (db) return db;
  throw new Error("Database not initialized. Call initIndexDb() first.");
}

export async function initIndexDb(): Promise<Database.Database> {
  await ensureBrainDirs();
  db = new Database(getIndexDbPath());
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

export function closeIndexDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function upsertNote(note: ScannedNote): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO notes (path, title, category, tags, anchors, body_text, modified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         title = excluded.title,
         category = excluded.category,
         tags = excluded.tags,
         anchors = excluded.anchors,
         body_text = excluded.body_text,
         modified_at = excluded.modified_at`
    )
    .run(
      note.path,
      note.title,
      note.category,
      JSON.stringify(note.tags),
      JSON.stringify(note.anchors),
      note.bodyText,
      note.modifiedAt
    );
}

export function deleteNoteFromIndex(relPath: string): void {
  getDb().prepare("DELETE FROM notes WHERE path = ?").run(relPath);
}

export function rebuildIndex(notes: ScannedNote[]): number {
  const database = getDb();
  database.exec("DELETE FROM notes");
  const insert = database.prepare(
    `INSERT INTO notes (path, title, category, tags, anchors, body_text, modified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = database.transaction((items: ScannedNote[]) => {
    for (const note of items) {
      insert.run(
        note.path,
        note.title,
        note.category,
        JSON.stringify(note.tags),
        JSON.stringify(note.anchors),
        note.bodyText,
        note.modifiedAt
      );
    }
  });
  tx(notes);
  return notes.length;
}

export function getIndexStats(): { noteCount: number; lastModified: string | null } {
  const database = getDb();
  const count = database.prepare("SELECT COUNT(*) as c FROM notes").get() as { c: number };
  const last = database
    .prepare("SELECT MAX(modified_at) as m FROM notes")
    .get() as { m: string | null };
  return { noteCount: count.c, lastModified: last.m };
}

export function getAllIndexedNotes(): ScannedNote[] {
  const rows = getDb()
    .prepare("SELECT path, title, category, tags, anchors, body_text, modified_at FROM notes")
    .all() as {
    path: string;
    title: string;
    category: string;
    tags: string;
    anchors: string;
    body_text: string;
    modified_at: string;
  }[];

  return rows.map((r) => ({
    path: r.path,
    title: r.title,
    category: r.category,
    tags: JSON.parse(r.tags || "[]") as string[],
    anchors: JSON.parse(r.anchors || "[]") as string[],
    bodyText: r.body_text,
    modifiedAt: r.modified_at,
  }));
}
