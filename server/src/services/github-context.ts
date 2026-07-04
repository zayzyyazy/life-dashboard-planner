import { config } from "../config.js";
import {
  fetchRepoSnapshot,
  getGitHubConnectionStatus,
  listWatchedRepos,
  syncUserRepos,
  type GitHubConnectionStatus,
  type RepoSnapshot,
} from "./github.js";

const CACHE_MS = 5 * 60 * 1000;
let cachedText: string | null = null;
let cachedAt = 0;
let cachedSnapshots: RepoSnapshot[] = [];

export async function ensureGitHubConnected(): Promise<GitHubConnectionStatus> {
  return getGitHubConnectionStatus();
}

export async function refreshGitHubContext(): Promise<{
  text: string;
  repos: RepoSnapshot[];
}> {
  const snapshots = await fetchAllWatchedSnapshots();
  const text = formatSnapshotsForPrompt(snapshots);
  cachedText = text;
  cachedSnapshots = snapshots;
  cachedAt = Date.now();
  return { text, repos: snapshots };
}

export async function buildGitHubContextText(force = false): Promise<string> {
  if (!force && cachedText && Date.now() - cachedAt < CACHE_MS) {
    return cachedText;
  }
  const status = await ensureGitHubConnected();
  if (!status.ok) {
    return `### GitHub\nNot connected — ${status.error}`;
  }

  const watched = listWatchedRepos() as { owner: string; repo: string }[];
  if (watched.length === 0) {
    return "### GitHub\nToken OK but no repos watched — run npm run setup or sync repos.";
  }

  try {
    const { text } = await refreshGitHubContext();
    return `### GitHub (live)\n${text}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return `### GitHub\nError fetching repos: ${msg}`;
  }
}

async function fetchAllWatchedSnapshots(): Promise<RepoSnapshot[]> {
  const watched = listWatchedRepos() as {
    owner: string;
    repo: string;
    project_name: string | null;
  }[];

  const limit = Math.min(watched.length, 12);
  const snapshots: RepoSnapshot[] = [];

  for (let i = 0; i < limit; i++) {
    const row = watched[i];
    try {
      const snap = await fetchRepoSnapshot(row.owner, row.repo);
      snapshots.push({ ...snap, project_name: row.project_name });
    } catch (err) {
      console.error(`[github] Snapshot failed ${row.owner}/${row.repo}:`, err);
    }
  }

  return snapshots;
}

function formatSnapshotsForPrompt(snapshots: RepoSnapshot[]): string {
  if (snapshots.length === 0) return "(no repo data)";

  return snapshots
    .map((s) => {
      const lines = [
        `**${s.owner}/${s.repo}**${s.project_name ? ` → ${s.project_name}` : ""}`,
        s.description ? `  ${s.description}` : null,
        `  Last push: ${s.pushed_at.slice(0, 10)} · branch: ${s.default_branch}`,
      ].filter(Boolean);

      if (s.recent_commits.length > 0) {
        lines.push("  Recent commits:");
        for (const c of s.recent_commits.slice(0, 3)) {
          const msg = c.message.split("\n")[0].slice(0, 80);
          lines.push(`    - ${msg} (${c.date.slice(0, 10)}, ${c.author})`);
        }
      }

      if (s.open_prs.length > 0) {
        lines.push(`  Open PRs: ${s.open_prs.map((p) => `#${p.number} ${p.title}`).join("; ")}`);
      }

      if (s.readme_excerpt) {
        const excerpt = s.readme_excerpt.replace(/\s+/g, " ").slice(0, 400);
        lines.push(`  README: ${excerpt}…`);
      }

      if (s.open_issues.length > 0) {
        lines.push(
          `  Open issues: ${s.open_issues.map((i) => `#${i.number} ${i.title}`).join("; ")}`
        );
      }

      if (s.open_prs.length === 0 && s.open_issues.length === 0 && s.recent_commits.length === 0) {
        lines.push("  (no recent activity)");
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

export async function syncAndRefreshGitHub(): Promise<{ added: string[]; total: number }> {
  const result = await syncUserRepos();
  await refreshGitHubContext();
  return result;
}

/** Store latest github summaries as project updates when checking repos */
export function getCachedSnapshots(): RepoSnapshot[] {
  return cachedSnapshots;
}

export async function bootGitHub(): Promise<void> {
  if (!config.github.token || !config.github.autoSync) return;

  const status = await ensureGitHubConnected();
  if (!status.ok) {
    console.error(`[github] ${status.error}`);
    console.error("[github] Run: npm run test:github — then fix GITHUB_TOKEN in .env");
    return;
  }

  console.log(`[github] Authenticated as ${status.login}`);
  try {
    await syncUserRepos({ quiet: true });
    await refreshGitHubContext();
    const watched = listWatchedRepos();
    console.log(`[github] Watching ${watched.length} repo(s)`);
  } catch (err) {
    console.error("[github] Boot sync failed:", err instanceof Error ? err.message : err);
  }
}
