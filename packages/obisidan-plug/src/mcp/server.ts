#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  initBrain,
  getVaultStatus,
  listNotes,
  readNoteByPath,
  searchVault,
  findRelated,
  askBrain,
  createNotePreview,
  createNoteCommit,
  organizeNotePreview,
  organizeNoteCommit,
  reindexVault,
} from "../services/brain.js";

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  };
}

async function main() {
  await initBrain();

  const server = new McpServer({
    name: "brain-vault",
    version: "0.1.0",
  });

  server.tool("vault_status", "Get vault path, note count, and index status", {}, async () => {
    return textResult(await getVaultStatus());
  });

  server.tool(
    "list_notes",
    "List markdown notes in the vault, optionally filtered by folder",
    { folder: z.string().optional().describe("Folder prefix e.g. 00-Inbox") },
    async ({ folder }) => textResult(await listNotes(folder))
  );

  server.tool(
    "read_note",
    "Read a single note by relative vault path",
    { path: z.string().describe("Relative path e.g. 00-Inbox/my-note.md") },
    async ({ path: notePath }) => textResult(await readNoteByPath(notePath))
  );

  server.tool(
    "search_notes",
    "Full-text search over vault notes",
    {
      query: z.string(),
      limit: z.number().optional(),
    },
    async ({ query, limit }) => textResult(await searchVault(query, limit))
  );

  server.tool(
    "find_related",
    "Find related notes using token similarity",
    { query: z.string(), limit: z.number().optional() },
    async ({ query, limit }) => textResult(await findRelated(query, limit))
  );

  server.tool(
    "ask_brain",
    "Ask a question over your notes — retrieves, reranks, and answers with citations",
    { question: z.string() },
    async ({ question }) => textResult(await askBrain(question))
  );

  server.tool(
    "create_note_preview",
    "Structure messy input into a note preview (does not write until commit)",
    { rawText: z.string().describe("Messy thought or brain dump") },
    async ({ rawText }) => textResult(await createNotePreview(rawText))
  );

  server.tool(
    "create_note_commit",
    "Write a previewed note to the vault after approval",
    { previewId: z.string() },
    async ({ previewId }) => textResult(await createNoteCommit(previewId))
  );

  server.tool(
    "organize_note_preview",
    "Propose how to file an inbox note (preview only)",
    { path: z.string().describe("Inbox note path to organize") },
    async ({ path: notePath }) => textResult(await organizeNotePreview(notePath))
  );

  server.tool(
    "organize_note_commit",
    "Move and update a note after approving organize preview",
    { previewId: z.string() },
    async ({ previewId }) => textResult(await organizeNoteCommit(previewId))
  );

  server.tool(
    "reindex_vault",
    "Rebuild the full-text search index from vault files",
    {},
    async () => textResult(await reindexVault())
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[brain-vault]", err);
  process.exit(1);
});
