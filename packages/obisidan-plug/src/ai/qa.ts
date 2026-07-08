import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { readNote, type VaultNote } from "../vault/reader.js";
import { searchNotes } from "../search/fts.js";
import { chatCompletion } from "./provider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadSystemPrompt(): Promise<string> {
  return fs.readFile(path.join(__dirname, "../../prompts/qa.system.md"), "utf8");
}

export async function askOverNotes(question: string, notes: VaultNote[]): Promise<string> {
  const system = await loadSystemPrompt();
  const context = notes
    .map(
      (n) =>
        `### ${n.path}\nTitle: ${n.title}\n${n.body.slice(0, config.maxNoteCharsForLlm)}`
    )
    .join("\n\n");

  return chatCompletion([
    { role: "system", content: system },
    {
      role: "user",
      content: `NOTES:\n${context || "(no notes found)"}\n\nQUESTION:\n${question}`,
    },
  ]);
}

async function rerankNotes(
  question: string,
  hits: { path: string; title: string; snippet: string }[]
): Promise<string[]> {
  if (hits.length <= 5) {
    return hits.map((h) => h.path);
  }

  const listing = hits
    .map((h, i) => `${i + 1}. ${h.path} — ${h.title}: ${h.snippet.slice(0, 120)}`)
    .join("\n");

  const raw = await chatCompletion(
    [
      {
        role: "system",
        content:
          "Pick the 3-5 most relevant note paths for answering the question. Return JSON: { \"paths\": string[] }",
      },
      {
        role: "user",
        content: `QUESTION: ${question}\n\nCANDIDATES:\n${listing}`,
      },
    ],
    { json: true, temperature: 0.2 }
  );

  try {
    const parsed = JSON.parse(raw) as { paths?: string[] };
    if (Array.isArray(parsed.paths) && parsed.paths.length > 0) {
      return parsed.paths.slice(0, 5);
    }
  } catch {
    // fall through
  }
  return hits.slice(0, 5).map((h) => h.path);
}

export async function handleAsk(vaultRoot: string, question: string): Promise<string> {
  const hits = searchNotes(question, config.searchLimit);
  const paths = await rerankNotes(question, hits);
  const notes: VaultNote[] = [];

  for (const p of paths) {
    try {
      notes.push(await readNote(vaultRoot, p));
    } catch {
      // skip missing
    }
  }

  return askOverNotes(question, notes);
}
