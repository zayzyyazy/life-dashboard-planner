import { config } from "../config.js";
import type { ScannedNote } from "../vault/scanner.js";

const WEAK_MERGE_TOKENS = new Set([
  "abroad", "academic", "assignment", "assignments", "campus", "class", "classes",
  "college", "course", "courses", "credits", "degree", "degrees", "education",
  "essay", "essays", "exam", "exams", "faculty", "first", "graduate", "homework",
  "lecture", "lectures", "module", "modules", "paper", "papers", "professor",
  "quiz", "school", "semester", "seminar", "student", "students", "studying",
  "syllabus", "tutorial", "tutorials", "undergrad", "uni", "project", "note",
  "notes", "task", "tasks", "work", "personal", "building", "learning", "research",
  "job", "the", "and", "for", "with", "this", "that", "from", "have", "about",
]);

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  return new Set(tokens);
}

function strongTokens(tokens: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    if (!WEAK_MERGE_TOKENS.has(t)) {
      out.add(t);
    }
  }
  return out;
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const strongA = strongTokens(a);
  const strongB = strongTokens(b);
  if (strongA.size === 0 || strongB.size === 0) {
    return jaccardRaw(a, b);
  }
  return jaccardRaw(strongA, strongB);
}

function jaccardRaw(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function noteTokenSet(note: ScannedNote): Set<string> {
  const combined = [
    note.title,
    note.bodyText.slice(0, 500),
    ...note.anchors,
    ...note.tags,
  ].join(" ");
  return tokenize(combined);
}

export function queryTokenSet(query: string, anchors: string[] = []): Set<string> {
  return tokenize([query, ...anchors].join(" "));
}

export interface RelatedHit {
  path: string;
  title: string;
  score: number;
}

export function findRelatedNotes(
  query: string,
  notes: ScannedNote[],
  anchors: string[] = [],
  limit = 8
): RelatedHit[] {
  const queryTokens = queryTokenSet(query, anchors);
  const scored = notes
    .map((note) => ({
      path: note.path,
      title: note.title,
      score: jaccardSimilarity(queryTokens, noteTokenSet(note)),
    }))
    .filter((h) => h.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

export function findDuplicateCandidates(
  title: string,
  body: string,
  anchors: string[],
  notes: ScannedNote[],
  threshold = config.jaccardDuplicateThreshold
): RelatedHit[] {
  const queryTokens = queryTokenSet(`${title} ${body}`, anchors);
  return notes
    .map((note) => ({
      path: note.path,
      title: note.title,
      score: jaccardSimilarity(queryTokens, noteTokenSet(note)),
    }))
    .filter((h) => h.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
