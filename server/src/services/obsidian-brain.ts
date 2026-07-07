/**
 * Obsidian vault integration — wraps obisidan-plug brain service.
 */
import { config } from "../config.js";
import {
  ensureVaultGitRepo,
  getVaultGitStatus,
  syncVaultToGit,
  type SyncResult,
} from "./vault-git.js";

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

export { getVaultGitStatus, syncVaultToGit };
export type { SyncResult };

export async function initObsidianBrain(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      ensureVaultEnv();
      await ensureVaultGitRepo().catch((err) => {
        console.error("[obsidian] Vault git repair:", err instanceof Error ? err.message : err);
      });

      const brain = await getBrain();
      await brain.initBrain();
      const status = await brain.getVaultStatus();
      const git = getVaultGitStatus();
      console.log(
        `[obsidian] Vault ready: ${status.noteCount} notes at ${status.vaultPath}` +
          (git.enabled
            ? git.hasRemote
              ? " (git sync ON)"
              : " (git sync ON but VAULT_GIT_REMOTE missing!)"
            : " (git sync OFF — notes stay on server only)")
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

export type NoteCommitResult = Awaited<
  ReturnType<Awaited<ReturnType<typeof getBrain>>["createNoteCommit"]>
> & {
  gitSynced: boolean;
  gitError?: string;
};

export async function createNoteCommit(previewId: string): Promise<NoteCommitResult> {
  const brain = await getBrain();
  const result = await brain.createNoteCommit(previewId);
  const sync = await syncVaultToGit("create note");
  return {
    ...result,
    gitSynced: sync.ok,
    gitError: sync.ok ? undefined : sync.error ?? sync.reason,
  };
}

export function formatGitSyncFooter(gitSynced: boolean, gitError?: string): string {
  if (gitSynced) {
    return "\n\n☁️ Synced to GitHub — will appear in Obsidian on your Mac within ~3 min.";
  }
  if (!config.vault.gitSyncEnabled) {
    return "\n\n⚠️ Saved on server only. Set VAULT_GIT_SYNC=true in Railway to sync to Obsidian.";
  }
  return (
    "\n\n⚠️ Saved on server but NOT synced to GitHub/Obsidian." +
    (gitError ? `\nFix: ${gitError.slice(0, 200)}` : "\nFix VAULT_GIT_REMOTE in Railway Variables.")
  );
}

export async function dedupeObsidianVault(): Promise<string> {
  const brain = await getBrain();
  const result = await brain.dedupeVault();
  const sync = await syncVaultToGit("dedupe vault");
  const base = result.message;
  if (!sync.ok && !sync.skipped) {
    return `${base}\n\n${formatGitSyncFooter(false, sync.error)}`;
  }
  return base;
}

export async function reindexVault() {
  const brain = await getBrain();
  return brain.reindexVault();
}

export async function bootstrapVaultIfEmpty(): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const vaultPath = config.vault.path;
  try {
    await fs.access(path.join(vaultPath, "BRAIN.md"));
    return;
  } catch {
    // empty — git clone may have run; bootstrap only if still no BRAIN.md
  }
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
