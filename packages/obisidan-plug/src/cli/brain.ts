#!/usr/bin/env node
import readline from "node:readline";
import {
  initBrain,
  getVaultStatus,
  searchVault,
  readNoteByPath,
  askBrain,
  createNotePreview,
  createNoteCommit,
  reindexVault,
} from "../services/brain.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function handleCommand(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (trimmed === "exit" || trimmed === "quit") {
    rl.close();
    process.exit(0);
  }

  if (trimmed === "status") {
    console.log(JSON.stringify(await getVaultStatus(), null, 2));
    return;
  }

  if (trimmed === "reindex") {
    console.log(JSON.stringify(await reindexVault(), null, 2));
    return;
  }

  if (trimmed.startsWith("read ")) {
    const p = trimmed.slice(5).trim();
    const note = await readNoteByPath(p);
    console.log(JSON.stringify(note, null, 2));
    return;
  }

  if (trimmed.startsWith("search ")) {
    const q = trimmed.slice(7).trim();
    console.log(JSON.stringify(await searchVault(q), null, 2));
    return;
  }

  if (trimmed.startsWith("ask ")) {
    const q = trimmed.slice(4).trim();
    console.log(await askBrain(q));
    return;
  }

  if (trimmed.startsWith("capture ")) {
    const raw = trimmed.slice(8).trim();
    const preview = await createNotePreview(raw);
    console.log(preview.previewText);
    const answer = await prompt("Commit this note? (yes/no): ");
    if (answer.toLowerCase().startsWith("y")) {
      console.log(JSON.stringify(await createNoteCommit(preview.id), null, 2));
    }
    return;
  }

  console.log(`Unknown command. Try: status | search <q> | read <path> | ask <q> | capture <text> | reindex | exit`);
}

async function main() {
  await initBrain();
  const status = await getVaultStatus();
  console.log(`Brain Vault CLI — ${status.noteCount} notes at ${status.vaultPath}`);
  console.log("Commands: status | search | read | ask | capture | reindex | exit\n");

  rl.on("line", (line) => {
    void handleCommand(line).catch((err) => {
      console.error("Error:", err instanceof Error ? err.message : err);
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
