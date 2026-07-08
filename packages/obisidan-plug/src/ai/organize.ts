import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { VaultNote } from "../vault/reader.js";
import { chatCompletion } from "./provider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const OrganizeSchema = z.object({
  targetPath: z.string(),
  tags: z.array(z.string()),
  wikilinks: z.array(z.string()),
  revisedBody: z.string(),
  rationale: z.string(),
});

export type OrganizeProposal = z.infer<typeof OrganizeSchema>;

async function loadSystemPrompt(): Promise<string> {
  return fs.readFile(path.join(__dirname, "../../prompts/organize.system.md"), "utf8");
}

export async function proposeOrganization(
  note: VaultNote,
  related: VaultNote[]
): Promise<OrganizeProposal> {
  const system = await loadSystemPrompt();
  const raw = await chatCompletion(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: JSON.stringify({
          note: {
            path: note.path,
            title: note.title,
            body: note.body,
            frontmatter: note.frontmatter,
          },
          related: related.map((r) => ({ path: r.path, title: r.title })),
        }),
      },
    ],
    { json: true }
  );

  return OrganizeSchema.parse(JSON.parse(raw));
}

export function formatOrganizePreview(
  sourcePath: string,
  proposal: OrganizeProposal
): string {
  const links =
    proposal.wikilinks.length > 0
      ? `\nWikilinks: ${proposal.wikilinks.map((l) => `[[${l}]]`).join(", ")}`
      : "";
  return [
    `Move: \`${sourcePath}\` → \`${proposal.targetPath}\``,
    `Tags: ${proposal.tags.join(", ") || "(none)"}${links}`,
    `Rationale: ${proposal.rationale}`,
    "",
    "Revised body preview:",
    proposal.revisedBody.slice(0, 500) + (proposal.revisedBody.length > 500 ? "…" : ""),
  ].join("\n");
}
