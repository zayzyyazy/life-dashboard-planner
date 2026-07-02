#!/usr/bin/env node
/**
 * Verify GitHub token and list watched repos.
 * Run: npm run test:github
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) {
    console.error("❌ No .env file found");
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const token = process.env.GITHUB_TOKEN?.trim();
if (!token || token.includes("your")) {
  console.error("❌ GITHUB_TOKEN not set in .env");
  console.log("\nFix:");
  console.log("  1. GitHub → Settings → Developer settings → Personal access tokens");
  console.log("  2. Create token with 'repo' scope (classic) or repo access (fine-grained)");
  console.log("  3. Add to .env: GITHUB_TOKEN=ghp_... or github_pat_...");
  process.exit(1);
}

console.log("Testing GitHub token…\n");

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  Authorization: `Bearer ${token}`,
  "User-Agent": "life-planner-agent-test",
};

try {
  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) {
    const body = await userRes.text();
    console.error(`❌ Auth failed (${userRes.status})`);
    console.error(body.slice(0, 300));
    console.log("\nToken is invalid or expired. Create a new one at:");
    console.log("  https://github.com/settings/tokens");
    process.exit(1);
  }
  const user = await userRes.json();
  console.log(`✓ Authenticated as @${user.login}`);

  const reposRes = await fetch(
    "https://api.github.com/user/repos?affiliation=owner,collaborator&sort=pushed&per_page=5",
    { headers }
  );
  const repos = await reposRes.json();
  if (Array.isArray(repos) && repos.length > 0) {
    console.log(`✓ Can list repos (${repos.length} recent):`);
    for (const r of repos) {
      console.log(`  - ${r.full_name} (pushed ${r.pushed_at?.slice(0, 10) ?? "?"})`);
    }
  }

  const rateRes = await fetch("https://api.github.com/rate_limit", { headers });
  const rate = await rateRes.json();
  console.log(`✓ API rate limit remaining: ${rate.rate?.remaining ?? "?"}`);

  console.log("\n✓ GitHub ready. Run: npm run setup");
} catch (err) {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
}
