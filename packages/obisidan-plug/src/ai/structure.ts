import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { MAIN_CATEGORIES, type MainCategory } from "../config.js";
import {
  buildRoutingPromptBlock,
  normalizeSuggestedFolder,
  type StructureContext,
} from "../routing/resolveDestinations.js";
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
  shortSummary: z.string().max(220).default(""),
  nextSteps: z.array(z.string()).max(5).default([]),
  doneItems: z.array(z.string()).max(5).default([]),
  shakyAreas: z.array(z.string()).max(5).default([]),
  body: z.string().default(""),
  tags: z.array(z.string()).max(8).default([]),
  anchors: z.array(z.string()).max(12).default([]),
  threadAnchorLabel: z.string().optional(),
  suggestedFolder: z.string().default("00-Inbox"),
  confidence: z.number().min(0).max(1).default(0.5),
  relatedTitles: z.array(z.string()).max(5).default([]),
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

function formatStructuredBody(structured: StructuredNote): string {
  let body = structured.body.trim();

  // Body is primary — LLM improvises ## sections. Ensure Summary exists.
  if (body.includes("##")) {
    if (!/##\s*Summary/i.test(body) && structured.shortSummary) {
      body = `## Summary\n${structured.shortSummary}\n\n${body}`;
    }
    return body;
  }

  // Fallback if LLM returned plain text without headings
  const parts: string[] = [`## Summary\n${structured.shortSummary || body}`];
  if (structured.doneItems.length > 0) {
    parts.push(`## Progress\n${structured.doneItems.map((i) => `- ${i}`).join("\n")}`);
  }
  if (structured.nextSteps.length > 0) {
    parts.push(`## Next steps\n${structured.nextSteps.map((i) => `- ${i}`).join("\n")}`);
  }
  if (structured.shakyAreas.length > 0) {
    parts.push(`## Open questions\n${structured.shakyAreas.map((i) => `- ${i}`).join("\n")}`);
  }
  if (body && body !== structured.shortSummary) {
    parts.push(body);
  }
  return parts.join("\n\n");
}

export async function structureCapture(
  raw: string,
  contextSnippets: string[],
  routingContext: StructureContext = {},
  vaultFolders: string[] = []
): Promise<StructuredNote> {
  const system = await loadSystemPrompt();
  const routingBlock = buildRoutingPromptBlock(vaultFolders, routingContext);

  const raw_json = await chatCompletion(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: `INPUT:\n"""${raw.trim()}"""\n\nROUTING CONTEXT:\n${routingBlock}\n\nSIMILAR NOTES IN VAULT:\n${
          contextSnippets.length ? contextSnippets.join("\n---\n") : "(none)"
        }\n\nReturn JSON:\n{
  "title": string,
  "mainCategory": "Uni"|"Job"|"Personal"|"Research"|"Building"|"Learning",
  "categoryPath": [string, string, string?],
  "body": string (markdown with improvised ## sections — always include ## Summary, then headings that fit the content),
  "tags": string[],
  "anchors": string[],
  "threadAnchorLabel": string,
  "suggestedFolder": string,
  "confidence": number (0-1),
  "relatedTitles": string[],
  "nextSteps": string[] (optional hints),
  "doneItems": string[] (optional hints),
  "shakyAreas": string[] (optional hints)
}`,
      },
    ],
    { json: true }
  );

  const parsed = StructureSchema.parse(JSON.parse(raw_json));
  return {
    ...parsed,
    mainCategory: normalizeMainCategory(parsed.mainCategory),
    suggestedFolder: normalizeSuggestedFolder(
      parsed.suggestedFolder?.trim() || "00-Inbox",
      parsed.confidence ?? 0.5,
      parsed.title,
      parsed.mainCategory
    ),
    anchors: parsed.anchors.map((a) => a.toLowerCase()).filter((a) => a.length >= 3),
    nextSteps: parsed.nextSteps ?? [],
    doneItems: parsed.doneItems ?? [],
    shakyAreas: parsed.shakyAreas ?? [],
  };
}

export function structuredToNoteInput(structured: StructuredNote) {
  const body = formatStructuredBody(structured);
  const tags = [
    ...new Set([...(structured.tags ?? []), structured.threadAnchorLabel].filter(Boolean)),
  ] as string[];

  return {
    title: structured.title,
    body,
    folder: structured.suggestedFolder,
    tags,
    category: structured.mainCategory,
    anchors: structured.anchors,
    related: structured.relatedTitles,
    confidence: structured.confidence,
    shortSummary: structured.shortSummary,
    status: structured.suggestedFolder.startsWith("00-Inbox") ? "inbox" : "filed",
  };
}

export { formatStructuredBody };

const BOILERPLATE_RE =
  /\b(note summariz|captures the key points|recent activities|this note captures|progress related to|document outcomes|key points and updates|summarizing recent)\b/i;

export function isBoilerplateStructuredNote(structured: StructuredNote): boolean {
  const text = `${structured.title}\n${structured.shortSummary}\n${structured.body}`;
  if (BOILERPLATE_RE.test(text)) return true;
  if (
    structured.body.length < 150 &&
    /\b(summariz|capture|document|track(?:ing)?)\b/i.test(structured.title)
  ) {
    return true;
  }
  return false;
}

export function fallbackBodyFromRaw(raw: string): string {
  const conv = raw.match(/CONVERSATION:\n([\s\S]*?)(?:\n\nLATEST USER|\n\nEXTRACTED|$)/)?.[1];
  const latest = raw.match(/LATEST USER MESSAGE:\n([\s\S]*?)(?:\n\nEXTRACTED|$)/)?.[1];
  const parts: string[] = [];
  if (conv?.trim()) {
    parts.push("## Conversation", "", conv.trim().slice(0, 2500));
  }
  if (latest?.trim()) {
    parts.push("## Latest", "", latest.trim().slice(0, 800));
  }
  if (parts.length === 0) {
    parts.push("## Summary", "", raw.trim().slice(0, 2500));
  }
  return parts.join("\n");
}
