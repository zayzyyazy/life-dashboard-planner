/**
 * Mirror agent profile + knowledge into Obsidian so you can read/edit in the vault.
 * Folder: 02-Areas/Personal/About-Me.md + 02-Areas/Personal/Knowledge/*.md
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import {
  getProfile,
  listKnowledge,
  type KnowledgeEntry,
  type UserProfile,
  domainLabel,
} from "./profile.js";
import { reindexVault, syncVaultToGit } from "./obsidian-brain.js";

const PERSONAL_ROOT = "02-Areas/Personal";
const ABOUT_ME_PATH = `${PERSONAL_ROOT}/About-Me.md`;
const KNOWLEDGE_DIR = `${PERSONAL_ROOT}/Knowledge`;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function frontmatter(data: Record<string, string | string[]>): string {
  const lines = Object.entries(data).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: [${value.map((v) => JSON.stringify(v)).join(", ")}]`;
    }
    return `${key}: ${JSON.stringify(value)}`;
  });
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function buildAboutMeBody(profile: UserProfile): string {
  const sections: string[] = [
    "# About me",
    "",
    "Long-term memory the agent uses in every conversation. Edit here or teach the bot in chat (`remember: …`, `I like …`, `I don't like …`).",
    "",
  ];

  if (profile.summary?.trim()) {
    sections.push("## Summary", "", profile.summary.trim(), "");
  }
  if (profile.personal_work_context?.trim()) {
    sections.push("## Work & projects", "", profile.personal_work_context.trim(), "");
  }
  if (profile.university_context?.trim()) {
    sections.push("## University", "", profile.university_context.trim(), "");
  }
  if (profile.personal_life_context?.trim()) {
    sections.push("## Personal life", "", profile.personal_life_context.trim(), "");
  }
  if (profile.preferences?.trim()) {
    sections.push("## Preferences (likes, dislikes, communication)", "", profile.preferences.trim(), "");
  }

  const knowledge = listKnowledge();
  if (knowledge.length > 0) {
    sections.push("## Knowledge index", "");
    for (const entry of knowledge.slice(0, 40)) {
      const slug = slugify(entry.title);
      sections.push(`- [[Knowledge/${slug}|${entry.title}]] (${domainLabel(entry.domain)})`);
    }
    sections.push("");
  }

  return sections.join("\n");
}

async function writeMarkdown(relPath: string, body: string, meta: Record<string, string | string[]>) {
  const vaultRoot = config.vault.path;
  const abs = path.join(vaultRoot, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const content = frontmatter({
    ...meta,
    updated: new Date().toISOString(),
  }) + body;
  await fs.writeFile(abs, content, "utf8");
  return relPath;
}

function knowledgePath(entry: KnowledgeEntry): string {
  return `${KNOWLEDGE_DIR}/${slugify(entry.title)}.md`;
}

function buildKnowledgeBody(entry: KnowledgeEntry): string {
  return [
    `# ${entry.title}`,
    "",
    `**Domain:** ${domainLabel(entry.domain)}`,
    `**Source:** ${entry.source}`,
    "",
    entry.content.trim(),
    "",
  ].join("\n");
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<string[]> | null = null;

/** Debounced full profile sync — safe to call after every addKnowledge. */
export function scheduleProfileObsidianSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncProfileToObsidian().catch((err) => {
      console.warn("[profile-obsidian] sync failed:", err instanceof Error ? err.message : err);
    });
  }, 800);
}

/** Write About-Me + all knowledge notes to the vault. Returns paths written. */
export async function syncProfileToObsidian(): Promise<string[]> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const profile = getProfile();
    const paths: string[] = [];

    paths.push(
      await writeMarkdown(ABOUT_ME_PATH, buildAboutMeBody(profile), {
        title: "About Me",
        category: "Personal",
        source: "agent-profile",
        status: "filed",
        tags: ["profile", "agent-memory"],
      })
    );

    for (const entry of listKnowledge()) {
      paths.push(
        await writeMarkdown(knowledgePath(entry), buildKnowledgeBody(entry), {
          title: entry.title,
          category: "Personal",
          source: entry.source,
          status: "filed",
          domain: entry.domain,
          tags: ["profile", "agent-memory", entry.domain],
        })
      );
    }

    try {
      await reindexVault();
    } catch (err) {
      console.warn("[profile-obsidian] reindex skipped:", err instanceof Error ? err.message : err);
    }

    await syncVaultToGit("profile sync").catch((err) => {
      console.warn("[profile-obsidian] git sync failed:", err instanceof Error ? err.message : err);
    });

    console.log(`[profile-obsidian] Synced ${paths.length} note(s) under ${PERSONAL_ROOT}/`);
    return paths;
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

/** Sync a single new knowledge entry immediately; returns vault path. */
export async function syncKnowledgeEntryToObsidian(entry: KnowledgeEntry): Promise<string> {
  const rel = await writeMarkdown(knowledgePath(entry), buildKnowledgeBody(entry), {
    title: entry.title,
    category: "Personal",
    source: entry.source,
    status: "filed",
    domain: entry.domain,
    tags: ["profile", "agent-memory", entry.domain],
  });
  scheduleProfileObsidianSync();
  return rel;
}

export function profileObsidianPaths(): { aboutMe: string; knowledgeDir: string } {
  return { aboutMe: ABOUT_ME_PATH, knowledgeDir: KNOWLEDGE_DIR };
}
