import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { chatCompletion } from "./openai.js";
import { findProjectId } from "./memory.js";

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface GitHubRepo {
  full_name: string;
  html_url: string;
  pushed_at: string;
  private: boolean;
}

export function parseRepoUrl(url: string): RepoRef {
  const cleaned = url.trim().replace(/\.git$/, "");
  const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!match) {
    throw new Error("Invalid GitHub repo URL. Expected https://github.com/owner/repo");
  }
  return { owner: match[1], repo: match[2] };
}

export async function githubFetch(path: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "life-planner-agent",
  };
  if (config.github.token) {
    headers.Authorization = `Bearer ${config.github.token}`;
  }
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${body}`);
  }
  return res.json();
}

export function mapRepoToProjectName(owner: string, repo: string): string | null {
  const hay = `${owner}/${repo}`.toLowerCase();
  if (/marie|leaping/.test(hay)) return "Marie / Leaping AI";
  if (/mcp/.test(hay)) return "MCP Server";
  if (/qa|call/.test(hay)) return "QA Call Analysis App";
  if (/life-dashboard|life-planner/.test(hay)) return "Life Planner Agent";
  if (/planner/.test(hay)) return "Project Planner";
  if (/uni|course|lecture|assignment|school/.test(hay)) return "University";
  return null;
}

export function addWatchedRepo(
  url: string,
  projectId?: number | null
): { id: number; owner: string; repo: string } {
  const { owner, repo } = parseRepoUrl(url);
  const db = getDb();
  const resolvedProjectId =
    projectId ?? findProjectId(mapRepoToProjectName(owner, repo));
  const result = db
    .prepare(
      `INSERT INTO watched_repos (project_id, owner, repo, url) VALUES (?, ?, ?, ?)
       ON CONFLICT(owner, repo) DO UPDATE SET
         project_id = COALESCE(excluded.project_id, watched_repos.project_id),
         url = excluded.url
       RETURNING id, owner, repo`
    )
    .get(resolvedProjectId ?? null, owner, repo, url) as {
    id: number;
    owner: string;
    repo: string;
  };
  return result;
}

export async function getGitHubUser(): Promise<{ login: string } | null> {
  if (!config.github.token) return null;
  try {
    return (await githubFetch("/user")) as { login: string };
  } catch {
    return null;
  }
}

export async function listUserRepos(): Promise<GitHubRepo[]> {
  if (!config.github.token) {
    throw new Error("GITHUB_TOKEN is required to list your repos");
  }
  const username = config.github.username;
  const path = username
    ? `/users/${username}/repos?sort=pushed&per_page=${config.github.syncLimit}`
    : `/user/repos?affiliation=owner&sort=pushed&per_page=${config.github.syncLimit}`;
  return (await githubFetch(path)) as GitHubRepo[];
}

export async function syncUserRepos(options: { quiet?: boolean } = {}): Promise<{
  added: string[];
  total: number;
}> {
  const added: string[] = [];

  if (config.github.watchRepos.length > 0) {
    for (const spec of config.github.watchRepos) {
      const url = spec.includes("github.com")
        ? spec
        : `https://github.com/${spec.replace(/^\//, "")}`;
      const repo = addWatchedRepo(url);
      added.push(`${repo.owner}/${repo.repo}`);
    }
  } else if (config.github.token) {
    const repos = await listUserRepos();
    for (const r of repos) {
      const [owner, repo] = r.full_name.split("/");
      const entry = addWatchedRepo(r.html_url);
      added.push(`${entry.owner}/${entry.repo}`);
      if (!options.quiet) {
        console.log(`[github] Watching ${owner}/${repo} (pushed ${r.pushed_at})`);
      }
    }
  } else {
    throw new Error("Set GITHUB_TOKEN or GITHUB_WATCH_REPOS to sync repos");
  }

  if (!options.quiet) {
    console.log(`[github] Synced ${added.length} repo(s)`);
  }

  await checkAllRepos();

  return { added, total: added.length };
}

export function getGitHubStatus() {
  const repos = listWatchedRepos();
  return {
    token_configured: Boolean(config.github.token),
    auto_sync: config.github.autoSync,
    username: config.github.username || null,
    watch_list: config.github.watchRepos,
    watched_count: repos.length,
    repos,
  };
}

export async function checkRepo(repoId: number): Promise<string | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM watched_repos WHERE id = ?")
    .get(repoId) as {
    id: number;
    owner: string;
    repo: string;
    project_id: number | null;
    last_commit_sha: string | null;
  } | undefined;

  if (!row) return null;

  const projectId =
    row.project_id ?? findProjectId(mapRepoToProjectName(row.owner, row.repo));

  const [commits, issues, prs] = await Promise.all([
    githubFetch(`/repos/${row.owner}/${row.repo}/commits?per_page=5`) as Promise<
      { sha: string; commit: { message: string; author: { date: string } } }[]
    >,
    githubFetch(
      `/repos/${row.owner}/${row.repo}/issues?state=open&per_page=5&sort=updated`
    ) as Promise<{ title: string; number: number; updated_at: string }[]>,
    githubFetch(
      `/repos/${row.owner}/${row.repo}/pulls?state=open&per_page=5&sort=updated`
    ) as Promise<{ title: string; number: number; updated_at: string }[]>,
  ]);

  const latestSha = commits[0]?.sha ?? null;
  const isFirstCheck = !row.last_commit_sha;
  const hasNewCommits =
    latestSha && row.last_commit_sha && latestSha !== row.last_commit_sha;

  db.prepare(
    "UPDATE watched_repos SET last_checked_at = datetime('now'), last_commit_sha = ? WHERE id = ?"
  ).run(latestSha, repoId);

  if (isFirstCheck) {
    return `Now watching ${row.owner}/${row.repo}. Latest commit: ${commits[0]?.commit.message ?? "none"}`;
  }

  if (!hasNewCommits && issues.length === 0 && prs.length === 0) {
    return null;
  }

  const summary = await chatCompletion(
    [
      {
        role: "system",
        content:
          "Summarize GitHub activity in 2-4 bullet points. Focus on what changed since last check.",
      },
      {
        role: "user",
        content: JSON.stringify({
          repo: `${row.owner}/${row.repo}`,
          newCommits: hasNewCommits ? commits.slice(0, 3) : [],
          openIssues: issues.slice(0, 3),
          openPRs: prs.slice(0, 3),
        }),
      },
    ],
    { tier: "default" }
  );

  if (projectId) {
    db.prepare(
      "INSERT INTO project_updates (project_id, source, title, content, metadata) VALUES (?, ?, ?, ?, ?)"
    ).run(
      projectId,
      "github",
      `GitHub: ${row.owner}/${row.repo}`,
      summary,
      JSON.stringify({ latest_sha: latestSha })
    );
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
  } else {
    db.prepare(
      `INSERT INTO project_updates (project_id, source, title, content, metadata)
       SELECT p.id, 'github', ?, ?, ?
       FROM projects p WHERE p.name = 'Life Planner Agent' LIMIT 1`
    ).run(
      `GitHub: ${row.owner}/${row.repo}`,
      summary,
      JSON.stringify({ latest_sha: latestSha, unmapped: true })
    );
  }

  return summary;
}

export async function checkAllRepos(): Promise<void> {
  const repos = getDb()
    .prepare("SELECT id FROM watched_repos")
    .all() as { id: number }[];
  for (const { id } of repos) {
    try {
      await checkRepo(id);
    } catch (err) {
      console.error(`GitHub check failed for repo ${id}:`, err);
    }
  }
}

export function listWatchedRepos() {
  return getDb()
    .prepare(
      `SELECT wr.*, p.name as project_name FROM watched_repos wr
       LEFT JOIN projects p ON p.id = wr.project_id
       ORDER BY wr.created_at DESC`
    )
    .all();
}
