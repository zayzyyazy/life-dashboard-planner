/**
 * Obsidian vault integration — wraps obisidan-plug brain service.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

let brainModule: typeof import("obisidan-plug") | null = null;
let initPromise: Promise<void> | null = null;

function ensureVaultEnv(): void {
  if (!process.env.VAULT_PATH) {
    process.env.VAULT_PATH = config.vault.path;
  }
  if (!process.env.BRAIN_DATA_DIR) {
    process.env.BRAIN_DATA_DIR = config.vault.brainDataDir;
  }
  if (!process.env.OPENAI_API_KEY && config.openai.apiKey) {
    process.env.OPENAI_API_KEY = config.openai.apiKey;
  }
}

async function getBrain() {
  ensureVaultEnv();
  if (!brainModule) {
    brainModule = await import("obisidan-plug");
  }
  return brainModule;
}

export async function initObsidianBrain(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      ensureVaultEnv();
      const brain = await getBrain();
      await brain.initBrain();
      const status = await brain.getVaultStatus();
      console.log(
        `[obsidian] Vault ready: ${status.noteCount} notes at ${status.vaultPath}`
      );
      const dedupe = await brain.dedupeVault().catch((err: unknown) => {
        console.warn("[obsidian] Startup dedupe skipped:", err instanceof Error ? err.message : err);
        return null;
      });
      if (dedupe && dedupe.deleted.length > 0) {
        console.log(
          `[obsidian] Cleaned ${dedupe.deleted.length} duplicate note(s) on startup`
        );
      }
    } catch (err) {
      console.error(
        "[obsidian] Brain init failed:",
        err instanceof Error ? err.message : err
      );
    }
  })();
  return initPromise;
}

export async function getVaultStatus() {
  const brain = await getBrain();
  await brain.initBrain();
  return brain.getVaultStatus();
}

export async function askBrain(question: string): Promise<string> {
  const brain = await getBrain();
  return brain.askBrain(question);
}

export async function searchVault(query: string, limit?: number) {
  const brain = await getBrain();
  return brain.searchVault(query, limit);
}

export async function createNotePreview(
  rawText: string,
  routingContext?: {
    activeProject?: string | null;
    projectNames?: string[];
    saveIntent?: "capture" | "task" | "project_log" | "resource" | "daily_review";
  }
) {
  const brain = await getBrain();
  return brain.createNotePreview(rawText, routingContext ?? {});
}

export async function createNoteCommit(previewId: string) {
  const brain = await getBrain();
  const result = await brain.createNoteCommit(previewId);
  await syncVaultToGit("create note").catch((err) => {
    console.warn("[obsidian] Git sync after commit failed:", err);
  });
  return result;
}

export async function dedupeObsidianVault(): Promise<string> {
  const brain = await getBrain();
  const result = await brain.dedupeVault();
  await syncVaultToGit("dedupe vault").catch((err) => {
    console.warn("[obsidian] Git sync after dedupe failed:", err);
  });
  return result.message;
}

export async function reindexVault() {
  const brain = await getBrain();
  return brain.reindexVault();
}

export async function syncVaultToGit(reason: string): Promise<void> {
  if (!config.vault.gitSyncEnabled || !config.vault.gitRemote) return;

  const vaultPath = config.vault.path;
  try {
    await execFileAsync("git", ["-C", vaultPath, "add", "-A"], { timeout: 30_000 });
    const status = await execFileAsync("git", ["-C", vaultPath, "status", "--porcelain"], {
      timeout: 10_000,
    });
    if (!status.stdout.trim()) return;

    const msg = `brain: ${reason} @ ${new Date().toISOString()}`;
    await execFileAsync("git", ["-C", vaultPath, "commit", "-m", msg], { timeout: 30_000 });
    await execFileAsync("git", ["-C", vaultPath, "push", "origin", "HEAD"], {
      timeout: 60_000,
    });
    console.log(`[obsidian] Git sync: pushed vault (${reason})`);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function bootstrapVaultIfEmpty(): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const vaultPath = config.vault.path;
  try {
    await fs.access(vaultPath);
  } catch {
    console.log(`[obsidian] Bootstrapping empty vault at ${vaultPath}`);
    const { execFile: exec } = await import("node:child_process");
    const { promisify: p } = await import("node:util");
    const run = p(exec);
    const pkgRoot = path.resolve(config.projectRoot, "packages/obisidan-plug");
    await run("npm", ["run", "bootstrap-vault"], {
      cwd: pkgRoot,
      env: {
        ...process.env,
        VAULT_PATH: vaultPath,
        BRAIN_DATA_DIR: config.vault.brainDataDir,
      },
    });
  }
}

export function formatSearchResults(
  hits: { path: string; title: string; snippet: string }[],
  limit = 5
): string {
  if (hits.length === 0) return "No notes found.";
  return hits
    .slice(0, limit)
    .map((h) => `• ${h.title}\n  ${h.path}\n  ${h.snippet.slice(0, 120)}…`)
    .join("\n\n");
}

export async function appendVaultDailyTask(params: {
  title: string;
  dueDate?: string | null;
  projectTag?: string;
}): Promise<void> {
  const brain = await getBrain();
  await brain.appendDailyNote("Tasks", params.title, {
    asTask: true,
    dueDate: params.dueDate ?? undefined,
    projectTag: params.projectTag,
  });
}

export async function appendVaultDailyLog(line: string): Promise<void> {
  const brain = await getBrain();
  await brain.appendDailyNote("Log", line);
}
