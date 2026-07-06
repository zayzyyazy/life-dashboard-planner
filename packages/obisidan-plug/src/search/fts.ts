import { config } from "../config.js";
import { getDb } from "../index/db.js";

export interface SearchHit {
  path: string;
  title: string;
  snippet: string;
  score: number;
  category?: string;
}

function escapeFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(" OR ");
}

function parseFilters(query: string): {
  textQuery: string;
  category?: string;
  tag?: string;
} {
  let textQuery = query;
  let category: string | undefined;
  let tag: string | undefined;

  const catMatch = query.match(/category:(\S+)/i);
  if (catMatch) {
    category = catMatch[1];
    textQuery = textQuery.replace(catMatch[0], "").trim();
  }

  const tagMatch = query.match(/tag:(\S+)/i);
  if (tagMatch) {
    tag = tagMatch[1];
    textQuery = textQuery.replace(tagMatch[0], "").trim();
  }

  return { textQuery, category, tag };
}

export function searchNotes(query: string, limit = config.searchLimit): SearchHit[] {
  const { textQuery, category, tag } = parseFilters(query);
  const database = getDb();

  if (!textQuery.trim() && !category && !tag) {
    const rows = database
      .prepare(
        `SELECT path, title, body_text, category FROM notes
         ORDER BY modified_at DESC LIMIT ?`
      )
      .all(limit) as { path: string; title: string; body_text: string; category: string }[];

    return rows.map((r) => ({
      path: r.path,
      title: r.title,
      snippet: r.body_text.slice(0, 200),
      score: 0,
      category: r.category,
    }));
  }

  const ftsQuery = escapeFtsQuery(textQuery || query);
  let sql = `
    SELECT n.path, n.title, n.body_text, n.category,
           bm25(notes_fts) as score
    FROM notes_fts
    JOIN notes n ON notes_fts.rowid = n.rowid
    WHERE notes_fts MATCH ?
  `;
  const params: unknown[] = [ftsQuery];

  if (category) {
    sql += " AND n.category = ?";
    params.push(category);
  }
  if (tag) {
    sql += " AND n.tags LIKE ?";
    params.push(`%"${tag}"%`);
  }

  sql += " ORDER BY score LIMIT ?";
  params.push(limit);

  try {
    const rows = database.prepare(sql).all(...params) as {
      path: string;
      title: string;
      body_text: string;
      category: string;
      score: number;
    }[];

    return rows.map((r) => ({
      path: r.path,
      title: r.title,
      snippet: r.body_text.slice(0, 200),
      score: r.score,
      category: r.category,
    }));
  } catch {
    // Fallback LIKE search if FTS query fails
    const like = `%${textQuery || query}%`;
    const rows = database
      .prepare(
        `SELECT path, title, body_text, category FROM notes
         WHERE title LIKE ? OR body_text LIKE ?
         ORDER BY modified_at DESC LIMIT ?`
      )
      .all(like, like, limit) as {
      path: string;
      title: string;
      body_text: string;
      category: string;
    }[];

    return rows.map((r) => ({
      path: r.path,
      title: r.title,
      snippet: r.body_text.slice(0, 200),
      score: 0,
      category: r.category,
    }));
  }
}

export function listNotesByFolder(folder: string, limit = 50): SearchHit[] {
  const like = `${folder.replace(/\\/g, "/")}%`;
  const rows = getDb()
    .prepare(
      `SELECT path, title, body_text, category FROM notes
       WHERE path LIKE ?
       ORDER BY modified_at DESC LIMIT ?`
    )
    .all(like, limit) as { path: string; title: string; body_text: string; category: string }[];

  return rows.map((r) => ({
    path: r.path,
    title: r.title,
    snippet: r.body_text.slice(0, 200),
    score: 0,
    category: r.category,
  }));
}
