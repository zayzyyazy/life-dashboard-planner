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

export interface GitHubConnectionStatus {
  ok: boolean;
  token_configured: boolean;
  login: string | null;
  error: string | null;
  rate_limit_remaining: number | null;
}

export interface RepoSnapshot {
  owner: string;
  repo: string;
  url: string;
  default_branch: string;
  pushed_at: string;
  description: string | null;
  project_name: string | null;
  recent_commits: { sha: string; message: string; date: string; author: string }[];
  open_issues: { number: number; title: string; updated_at: string }[];
  open_prs: { number: number; title: string; updated_at: string }[];
  readme_excerpt: string | null;
}

let connectionCache: { status: GitHubConnectionStatus; at: number } | null = null;
const CONNECTION_CACHE_MS = 60_000;

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
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "life-planner-agent",
  };
  const token = config.github.token;
  if (token) {
    // Classic (ghp_) and fine-grained (github_pat_) both use Bearer
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      throw new Error(
        `GitHub auth failed (401). Token invalid or expired — create a new token with 'repo' scope at github.com/settings/tokens`
      );
    }
    if (res.status === 403) {
      throw new Error(`GitHub forbidden (403): ${body.slice(0, 200)}`);
    }
    throw new Error(`GitHub API error ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function getGitHubConnectionStatus(
  force = false
): Promise<GitHubConnectionStatus> {
  if (
    !force &&
    connectionCache &&
    Date.now() - connectionCache.at < CONNECTION_CACHE_MS
  ) {
    return connectionCache.status;
  }

  if (!config.github.token) {
    const status: GitHubConnectionStatus = {
      ok: false,
      token_configured: false,
      login: null,
      error: "GITHUB_TOKEN not set in .env",
      rate_limit_remaining: null,
    };
    connectionCache = { status, at: Date.now() };
    return status;
  }

  try {
    const [user, rateLimit] = await Promise.all([
      githubFetch("/user") as Promise<{ login: string }>,
      githubFetch("/rate_limit") as Promise<{
        rate: { remaining: number };
      }>,
    ]);
    const status: GitHubConnectionStatus = {
      ok: true,
      token_configured: true,
      login: user.login,
      error: null,
      rate_limit_remaining: rateLimit.rate.remaining,
    };
    connectionCache = { status, at: Date.now() };
    return status;
  } catch (err) {
    const status: GitHubConnectionStatus = {
      ok: false,
      token_configured: true,
      login: null,
      error: err instanceof Error ? err.message : "GitHub connection failed",
      rate_limit_remaining: null,
    };
    connectionCache = { status, at: Date.now() };
    return status;
  }
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
  const status = await getGitHubConnectionStatus();
  if (!status.ok || !status.login) return null;
  return { login: status.login };
}

export async function fetchRepoReadme(owner: string, repo: string): Promise<string | null> {
  try {
    const data = (await githubFetch(`/repos/${owner}/${repo}/readme`)) as {
      content?: string;
      encoding?: string;
    };
    if (!data.content) return null;
    const raw = Buffer.from(data.content, data.encoding === "base64" ? "base64" : "utf8").toString(
      "utf8"
    );
    return raw.slice(0, 1200);
  } catch {
    return null;
  }
}

export async function fetchRepoSnapshot(owner: string, repo: string): Promise<RepoSnapshot> {
  const [meta, commits, issuesRaw, prs, readme] = await Promise.all([
    githubFetch(`/repos/${owner}/${repo}`) as Promise<{
      html_url: string;
      default_branch: string;
      pushed_at: string;
      description: string | null;
    }>,
    githubFetch(`/repos/${owner}/${repo}/commits?per_page=5`) as Promise<
      {
        sha: string;
        commit: { message: string; author: { date: string; name: string } };
      }[]
    >,
    githubFetch(
      `/repos/${owner}/${repo}/issues?state=open&per_page=8&sort=updated`
    ) as Promise<
      { number: number; title: string; updated_at: string; pull_request?: unknown }[]
    >,
    githubFetch(
      `/repos/${owner}/${repo}/pulls?state=open&per_page=5&sort=updated`
    ) as Promise<{ number: number; title: string; updated_at: string }[]>,
    fetchRepoReadme(owner, repo),
  ]);

  const open_issues = issuesRaw
    .filter((i) => !i.pull_request)
    .map((i) => ({ number: i.number, title: i.title, updated_at: i.updated_at }));

  return {
    owner,
    repo,
    url: meta.html_url,
    default_branch: meta.default_branch,
    pushed_at: meta.pushed_at,
    description: meta.description,
    project_name: null,
    recent_commits: commits.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message,
      date: c.commit.author.date,
      author: c.commit.author.name,
    })),
    open_issues,
    open_prs: prs.map((p) => ({
      number: p.number,
      title: p.title,
      updated_at: p.updated_at,
    })),
    readme_excerpt: readme,
  };
}

export async function listUserRepos(): Promise<GitHubRepo[]> {
  if (!config.github.token) {
    throw new Error("GITHUB_TOKEN is required to list your repos");
  }
  const username = config.github.username;
  const path = username
    ? `/users/${username}/repos?sort=pushed&per_page=${config.github.syncLimit}`
    : `/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=${config.github.syncLimit}`;
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
  const cached = connectionCache?.status;
  return {
    token_configured: Boolean(config.github.token),
    auth_valid: cached?.ok ?? null,
    login: cached?.login ?? null,
    last_error: cached?.error ?? null,
    rate_limit_remaining: cached?.rate_limit_remaining ?? null,
    auto_sync: config.github.autoSync,
    username: config.github.username || null,
    watch_list: config.github.watchRepos,
    watched_count: repos.length,
    repos,
  };
}

function formatRepoBaseline(
  owner: string,
  repo: string,
  commits: { commit: { message: string; author: { date: string } } }[],
  issues: { title: string; number: number }[],
  prs: { title: string; number: number }[]
): string {
  const lines = [`Watching ${owner}/${repo}.`];
  if (commits[0]) {
    lines.push(`Latest commit: ${commits[0].commit.message.split("\n")[0]}`);
  }
  if (prs.length > 0) {
    lines.push(`Open PRs: ${prs.map((p) => `#${p.number} ${p.title}`).join("; ")}`);
  }
  if (issues.length > 0) {
    lines.push(`Open issues: ${issues.map((i) => `#${i.number} ${i.title}`).join("; ")}`);
  }
  return lines.join("\n");
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
    const baseline = formatRepoBaseline(row.owner, row.repo, commits, issues, prs);
    if (projectId) {
      db.prepare(
        "INSERT INTO project_updates (project_id, source, title, content, metadata) VALUES (?, ?, ?, ?, ?)"
      ).run(
        projectId,
        "github",
        `Baseline: ${row.owner}/${row.repo}`,
        baseline,
        JSON.stringify({ latest_sha: latestSha, baseline: true })
      );
      db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
    }
    return `Now watching ${row.owner}/${row.repo}. Baseline saved.`;
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
  try {
    const { refreshGitHubContext } = await import("./github-context.js");
    await refreshGitHubContext();
  } catch (err) {
    console.error("[github] Context refresh failed:", err);
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
