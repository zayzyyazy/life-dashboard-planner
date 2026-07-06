import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { MAIN_CATEGORIES, type MainCategory } from "../config.js";
import { chatCompletion } from "./provider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const StructureSchema = z.object({
  title: z.string(),
  mainCategory: z.enum([
    "Uni",
    "Job",
    "Personal",
    "Research",
    "Building",
    "Learning",
  ]),
  categoryPath: z.array(z.string()).min(2).max(4),
  shortSummary: z.string().max(220),
  body: z.string(),
  tags: z.array(z.string()).max(8),
  anchors: z.array(z.string()).max(12),
  suggestedFolder: z.string(),
  relatedTitles: z.array(z.string()).max(5),
});

export type StructuredNote = z.infer<typeof StructureSchema>;

async function loadSystemPrompt(): Promise<string> {
  return fs.readFile(path.join(__dirname, "../../prompts/structure.system.md"), "utf8");
}

function normalizeMainCategory(candidate: string): MainCategory {
  const normalized = candidate.trim().toLowerCase();
  const found = MAIN_CATEGORIES.find((c) => c.toLowerCase() === normalized);
  if (found) return found;
  if (normalized.includes("uni")) return "Uni";
  if (normalized.includes("research")) return "Research";
  if (normalized.includes("build")) return "Building";
  if (normalized.includes("learn") || normalized.includes("study")) return "Learning";
  if (normalized.includes("job")) return "Job";
  return "Personal";
}

export async function structureCapture(
  raw: string,
  contextSnippets: string[]
): Promise<StructuredNote> {
  const system = await loadSystemPrompt();
  const raw_json = await chatCompletion(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: `INPUT:\n"""${raw.trim()}"""\n\nSIMILAR NOTES IN VAULT:\n${
          contextSnippets.length ? contextSnippets.join("\n---\n") : "(none)"
        }\n\nReturn JSON:\n{
  "title": string,
  "mainCategory": "Uni"|"Job"|"Personal"|"Research"|"Building"|"Learning",
  "categoryPath": [string, string, string?],
  "shortSummary": string,
  "body": string (markdown body for the note),
  "tags": string[],
  "anchors": string[],
  "suggestedFolder": string (default "00-Inbox"),
  "relatedTitles": string[]
}`,
      },
    ],
    { json: true }
  );

  const parsed = StructureSchema.parse(JSON.parse(raw_json));
  return {
    ...parsed,
    mainCategory: normalizeMainCategory(parsed.mainCategory),
    suggestedFolder: parsed.suggestedFolder?.trim() || "00-Inbox",
    anchors: parsed.anchors.map((a) => a.toLowerCase()).filter((a) => a.length >= 3),
  };
}

export function structuredToNoteInput(structured: StructuredNote) {
  const bodyParts = [structured.shortSummary, "", structured.body].filter(Boolean);
  return {
    title: structured.title,
    body: bodyParts.join("\n"),
    folder: structured.suggestedFolder.startsWith("00-Inbox")
      ? "00-Inbox"
      : structured.suggestedFolder,
    tags: structured.tags,
    category: structured.mainCategory,
    anchors: structured.anchors,
    related: structured.relatedTitles,
  };
}
