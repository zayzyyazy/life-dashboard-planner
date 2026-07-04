#!/usr/bin/env node
/**
 * Shows what the agent actually has loaded — run: npm run check:knowledge
 */
const base = process.env.LIFE_PLANNER_URL ?? "http://127.0.0.1:3847";

async function main() {
  console.log("Life Planner — agent knowledge check\n");
  try {
    const res = await fetch(`${base}/agent/knowledge`);
    if (!res.ok) {
      console.log(`❌ Server not reachable at ${base} (is daemon running?)`);
      console.log("   npm run fix:telegram");
      process.exit(1);
    }
    const k = await res.json();

    console.log(`Profile loaded: ${k.profile_loaded ? `yes (${k.profile_name})` : "NO — run npm run seed:profile -- --force"}`);
    console.log(`Knowledge notes: ${k.knowledge_entries}`);
    console.log(`GitHub repos watched: ${k.watched_repos}${k.github_token ? "" : " (GITHUB_TOKEN missing)"}`);
    console.log(`Chat messages in memory: ${k.recent_messages}`);
    console.log(`Project memory chars: ${k.project_memory_chars}`);
    console.log("\nProjects:");
    for (const p of k.projects) {
      const repos = p.linked_repos.length ? p.linked_repos.join(", ") : "no repos linked";
      console.log(`  ${p.update_count > 0 ? "✓" : "⚠"} ${p.name}: ${p.update_count} updates · ${repos}`);
    }

    const empty = k.projects.filter((p) => p.update_count === 0);
    if (empty.length) {
      console.log("\n⚠ Empty projects:", empty.map((p) => p.name).join(", "));
      console.log("  Fix: npm run setup   (GitHub sync + project seed)");
    }
    if (!k.profile_loaded) {
      console.log("\n⚠ Profile empty — agent won't know who you are");
      console.log("  Fix: npm run seed:profile -- --force");
    }
    if (k.watched_repos === 0 && k.github_token) {
      console.log("\n⚠ Token set but no repos watched — run npm run setup");
    }
    console.log("\nTelegram: send /knowledge to the bot for same report");
  } catch (err) {
    console.error("Failed:", err.message);
    process.exit(1);
  }
}

main();
