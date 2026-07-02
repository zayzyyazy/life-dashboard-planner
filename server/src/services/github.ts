import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { chatCompletion } from "../agent/openai.js";

export interface RepoRef {
  owner: string;
  repo: string;
}

export function parseRepoUrl(url: string): RepoRef {
  const cleaned = url.trim().replace(/\.git$/, "");
  const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!match) {
    throw new Error("Invalid GitHub repo URL. Expected https://github.com/owner/repo");
  }
  return { owner: match[1], repo: match[2] };
}

export function addWatchedRepo(
  url: string,
  projectId?: number | null
): { id: number; owner: string; repo: string } {
  const { owner, repo } = parseRepoUrl(url);
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO watched_repos (project_id, owner, repo, url) VALUES (?, ?, ?, ?)
       ON CONFLICT(owner, repo) DO UPDATE SET project_id = COALESCE(excluded.project_id, project_id)
       RETURNING id, owner, repo`
    )
    .get(projectId ?? null, owner, repo, url) as { id: number; owner: string; repo: string };
  return result;
}

async function githubFetch(path: string) {
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

  if (row.project_id) {
    db.prepare(
      "INSERT INTO project_updates (project_id, source, title, content, metadata) VALUES (?, ?, ?, ?, ?)"
    ).run(
      row.project_id,
      "github",
      `GitHub: ${row.owner}/${row.repo}`,
      summary,
      JSON.stringify({ latest_sha: latestSha })
    );
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(
      row.project_id
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
