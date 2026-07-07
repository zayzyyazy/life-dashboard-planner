/**
 * Git sync for Brain-Vault on cloud — push saves to GitHub so Mac Obsidian can pull.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

export interface VaultGitStatus {
  enabled: boolean;
  vaultPath: string;
  hasGit: boolean;
  hasRemote: boolean;
  lastError: string | null;
  lastPushAt: string | null;
}

let lastError: string | null = null;
let lastPushAt: string | null = null;

export function getVaultGitStatus(): VaultGitStatus {
  const hasGit = fs.existsSync(path.join(config.vault.path, ".git"));
  return {
    enabled: config.vault.gitSyncEnabled,
    vaultPath: config.vault.path,
    hasGit,
    hasRemote: Boolean(config.vault.gitRemote),
    lastError,
    lastPushAt,
  };
}

async function git(args: string[], vaultPath: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", ["-C", vaultPath, ...args], {
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsPromises.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Repair vault git on cloud — clone from GitHub if missing or broken. */
export async function ensureVaultGitRepo(): Promise<void> {
  if (!config.vault.gitSyncEnabled || !config.vault.gitRemote) {
    console.warn(
      "[vault-git] Sync disabled — set VAULT_GIT_SYNC=true and VAULT_GIT_REMOTE=https://TOKEN@github.com/you/brain-vault.git"
    );
    return;
  }

  const vaultPath = config.vault.path;
  const remote = config.vault.gitRemote;
  await fsPromises.mkdir(vaultPath, { recursive: true });

  const hasGit = await pathExists(path.join(vaultPath, ".git"));

  if (!hasGit) {
    console.log("[vault-git] No .git — cloning from GitHub…");
    const parent = path.dirname(vaultPath);
    const base = path.basename(vaultPath);
    const backup = `${base}.bak-${Date.now()}`;
    try {
      if (await pathExists(vaultPath)) {
        await fsPromises.rename(vaultPath, path.join(parent, backup));
      }
      await execFileAsync("git", ["clone", remote, vaultPath], { timeout: 180_000 });
      console.log("[vault-git] Cloned brain-vault from GitHub");
      return;
    } catch (err) {
      console.error("[vault-git] Clone failed:", err instanceof Error ? err.message : err);
      const bakPath = path.join(parent, backup);
      if (await pathExists(bakPath)) {
        await fsPromises.rename(bakPath, vaultPath);
      }
      await git(["init", "-b", "main"], vaultPath).catch(() => git(["init"], vaultPath));
    }
  }

  await git(["config", "user.name", "Brain Agent"], vaultPath).catch(() => {});
  await git(["config", "user.email", "brain-agent@localhost"], vaultPath).catch(() => {});
  try {
    await git(["remote", "remove", "origin"], vaultPath);
  } catch {
    // no origin yet
  }
  await git(["remote", "add", "origin", remote], vaultPath);

  for (const branch of ["main", "master"]) {
    try {
      await git(["pull", "--rebase", "--autostash", "origin", branch], vaultPath);
      console.log(`[vault-git] Pulled latest from origin/${branch}`);
      return;
    } catch {
      // try merge with unrelated histories
      try {
        await git(
          ["pull", "origin", branch, "--allow-unrelated-histories", "--no-edit"],
          vaultPath
        );
        console.log(`[vault-git] Merged origin/${branch} (unrelated histories)`);
        return;
      } catch {
        // next branch
      }
    }
  }
}

export interface SyncResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

export async function syncVaultToGit(reason: string): Promise<SyncResult> {
  if (!config.vault.gitSyncEnabled || !config.vault.gitRemote) {
    const msg = "VAULT_GIT_SYNC or VAULT_GIT_REMOTE not set in Railway Variables";
    lastError = msg;
    return { ok: false, skipped: true, reason: msg };
  }

  const vaultPath = config.vault.path;

  try {
    await ensureVaultGitRepo();

    if (!(await pathExists(path.join(vaultPath, ".git")))) {
      const msg = "Vault has no git repo after repair";
      lastError = msg;
      return { ok: false, error: msg };
    }

    await git(["add", "-A"], vaultPath);
    const status = await git(["status", "--porcelain"], vaultPath);
    if (!status.stdout.trim()) {
      return { ok: true, skipped: true, reason: "no changes" };
    }

    const msg = `brain: ${reason} @ ${new Date().toISOString()}`;
    await git(["commit", "-m", msg], vaultPath);

    const branches = ["main", "master"];
    let pushed = false;
    let lastPushErr = "";

    for (const branch of branches) {
      try {
        await git(["push", "origin", `HEAD:${branch}`], vaultPath);
        pushed = true;
        break;
      } catch (err) {
        lastPushErr = err instanceof Error ? err.message : String(err);
        try {
          await git(["pull", "--rebase", "--autostash", "origin", branch], vaultPath);
          await git(["push", "origin", `HEAD:${branch}`], vaultPath);
          pushed = true;
          break;
        } catch (err2) {
          lastPushErr = err2 instanceof Error ? err2.message : String(err2);
        }
      }
    }

    if (!pushed) {
      lastError = lastPushErr;
      console.error(`[vault-git] Push FAILED (${reason}): ${lastPushErr}`);
      return { ok: false, error: lastPushErr };
    }

    lastError = null;
    lastPushAt = new Date().toISOString();
    console.log(`[vault-git] Pushed to GitHub (${reason})`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lastError = msg;
    console.error(`[vault-git] Sync FAILED (${reason}): ${msg}`);
    return { ok: false, error: msg };
  }
}
