import type { ConversationTurn } from "./memory.js";

/** Rich text for structureCapture — substance from the thread, not meta summaries. */
export function buildSaveSourceText(params: {
  userMessage: string;
  conversationTurns: ConversationTurn[];
  actionContext?: string;
  projectName?: string | null;
}): string {
  const thread = params.conversationTurns
    .slice(-12)
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join("\n\n");

  return `Capture this conversation as an Obsidian note.

RULES FOR YOU (structuring model):
- Extract the ACTUAL project details, ideas, decisions, and next steps discussed
- NEVER write a note about "intention to save", "tracking and follow-up", or "schedule follow-up questions"
- Title must name the specific project/topic (e.g. "MacHealth Detective CLI")
- Route named projects to 03-Projects/{slug} (code mirrors to 02-Areas/Building/{slug})
- Use improvised ## sections in body — NOT fixed Done/Next/Shaky template
${params.projectName ? `- Active project name: ${params.projectName}` : ""}

CONVERSATION:
${thread || "(no prior turns)"}

LATEST USER MESSAGE:
${params.userMessage}

${params.actionContext ? `EXTRACTED CONTEXT:\n${params.actionContext}\n` : ""}`;
}

const SAVE_SIGNAL =
  /\b(project|build(?:ing)?|cli|tool|app|ship|mcp|marie|leaping|exam|learn|idea|health|detective|machealth|macbook|automation|startup|feature|implement|design|algorithm|uni|course|work(?:ing)? on|i'?m building|i want to build|personal project|side project|name it|call it|naming)\b/i;

const SKIP_SAVE_CLASSIFICATIONS = new Set([
  "greeting",
  "reminder",
  "reminder_complaint",
  "task",
  "task_complete",
  "brief_request",
  "github_query",
  "watch_request",
]);

/** Classifications that trigger save when combined with substantive thread. */
const SAVE_ELIGIBLE = new Set([
  "general",
  "project_update",
  "general_memory",
  "profile_memory",
  "decision",
  "question",
]);

export const OBSIDIAN_SAVE_TRIGGER_ACTIONS = new Set([
  "saved_project_update",
  "saved_knowledge",
  "saved_decision",
  "evolving_project",
]);

/** Detect substantive project/building thread worth saving to Obsidian. */
export function shouldOfferObsidianSave(
  classification: string,
  message: string,
  history: ConversationTurn[],
  actions: string[] = []
): boolean {
  if (actions.some((a) => OBSIDIAN_SAVE_TRIGGER_ACTIONS.has(a))) return true;
  if (SKIP_SAVE_CLASSIFICATIONS.has(classification)) return false;
  if (!SAVE_ELIGIBLE.has(classification)) return false;

  const combined = [message, ...history.slice(-12).map((t) => t.content)].join(" ");
  if (!SAVE_SIGNAL.test(combined)) return false;

  // Pure math / hours calculation with no ongoing project thread
  if (
    classification === "general" &&
    /\b\d+\s*hours?\b/i.test(combined) &&
    !/\b(build|cli|tool|project|detective|health|app)\b/i.test(combined)
  ) {
    return false;
  }

  const userTurns = [...history.filter((t) => t.role === "user"), { role: "user", content: message }];
  const userTurnCount = userTurns.length;

  // Multi-turn project conversation — offer save even if latest message is short
  if (userTurnCount >= 2 && SAVE_SIGNAL.test(combined)) return true;

  // Single substantial dump
  if (combined.length >= 120 && SAVE_SIGNAL.test(combined)) return true;

  // project_update / memory always worth offering when signal present
  if (
    (classification === "project_update" || classification === "general_memory") &&
    SAVE_SIGNAL.test(combined)
  ) {
    return true;
  }

  return false;
}

/** @deprecated use shouldOfferObsidianSave */
export function shouldProactivelyOfferSave(
  classification: string,
  message: string,
  history: ConversationTurn[]
): boolean {
  return shouldOfferObsidianSave(classification, message, history, []);
}

export function normalizeProjectName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const cleaned = name.trim();
  const known =
    cleaned.match(/\b(MacHealth(?:\s+Detective)?(?:\s+CLI)?)\b/i)?.[1] ??
    cleaned.match(/\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3}(?:\s+CLI|\s+App|\s+Tool)?)\b/)?.[1];
  if (known) return known.replace(/\s+/g, " ").trim();
  if (cleaned.length > 48) return cleaned.split(/\s+/).slice(0, 5).join(" ");
  return cleaned;
}

export function isBuildingThread(
  message: string,
  history: ConversationTurn[]
): boolean {
  return (
    looksLikeNewBuildingProject(message, history) ||
    Boolean(extractProjectNameFromThread(message, history))
  );
}

export function shouldAutoSaveToObsidian(
  classification: string,
  message: string,
  history: ConversationTurn[],
  actions: string[] = []
): boolean {
  if (shouldConfirmObsidianSave(actions)) return false;

  const userTurnCount =
    history.filter((t) => t.role === "user").length + 1;

  if (actions.includes("saved_project_update")) return true;

  // Wait for at least 2 user turns before auto-saving a new project thread
  if (actions.includes("evolving_project")) {
    return userTurnCount >= 2 && shouldOfferObsidianSave(classification, message, history, actions);
  }

  const hasProjectThread =
    isBuildingThread(message, history) || classification === "project_update";

  if (hasProjectThread && shouldOfferObsidianSave(classification, message, history, actions)) {
    return userTurnCount >= 2;
  }

  return false;
}

/** Only explicit save: commands need confirmation. */
export function shouldConfirmObsidianSave(actions: string[] = []): boolean {
  return actions.some((a) => a === "saved_knowledge" || a === "saved_decision");
}

export function saveOfferLine(hint?: string): string {
  if (hint) {
    return `💾 Save this to Obsidian (${hint})? Reply yes / no / edit: …`;
  }
  return "💾 Save this to Obsidian? Reply yes / no / edit: …";
}

export function formatAutoSaveMessage(result: {
  paths: string[];
  action?: "merged" | "created";
  message?: string;
  deletedDuplicates?: string[];
}): string {
  if (result.message?.startsWith("Merged into")) {
    const lines = [result.message.split("\n")[0]!];
    if (result.paths.length > 1) {
      lines.push(...result.paths.slice(1).map((p) => `(also) ${p}`));
    }
    return lines.join("\n");
  }
  if (result.paths.length === 0) return "Saved to Obsidian.";
  if (result.paths.length === 1) return `Saved to Obsidian: ${result.paths[0]}`;
  return `Saved to Obsidian:\n${result.paths.map((p) => `- ${p}`).join("\n")}`;
}

/** Remove prior save footers so we don't duplicate after auto-save. */
export function stripSaveFooters(text: string): string {
  return text
    .replace(/\n*💾 Save (this )?to Obsidian\?[^\n]*/gi, "")
    .replace(/\n*Saved to Obsidian:[\s\S]*?(?=\n\n[A-Z]|$)/gi, "")
    .replace(/\n*\(Couldn't auto-save to Obsidian[^\n]*\)/gi, "")
    .trim();
}

/** Strip false persistence claims when save hasn't happened yet. */
export function stripFalseSaveClaims(text: string): string {
  return text
    .replace(
      /\n*(I've saved|I saved|saved (this|the|your|it).*?(notes|obsidian|vault)[^\n]*\.?\n*)/gi,
      "\n"
    )
    .replace(/\n*(I'll check in with you[^\n]*\.?\n*)/gi, "\n")
    .replace(/\n*(I'll keep track of (this|the|your)[^\n]*\.?\n*)/gi, "\n")
    .replace(/\n*(I'll check in on your progress[^\n]*\.?\n*)/gi, "\n")
    .replace(/\n*(Let me know if you need[^\n]*(?:\n|$))/gi, "\n")
    .trim();
}

export function looksLikeNewBuildingProject(
  message: string,
  history: ConversationTurn[]
): boolean {
  const combined = [message, ...history.slice(-10).map((t) => t.content)].join(" ");
  return (
    SAVE_SIGNAL.test(combined) &&
    /\b(cli|tool|app|build(?:ing)?|side project|personal project|detective|health|macbook|machealth|automation|script|agent)\b/i.test(
      combined
    )
  );
}

export function extractProjectNameFromThread(
  message: string,
  history: ConversationTurn[]
): string | null {
  const combined = [message, ...history.slice(-12).map((t) => t.content)].join("\n");

  const patterns = [
    /(?:call|name|naming) it ['"]?([A-Za-z][A-Za-z0-9\s-]{2,45}(?:CLI|App|Tool)?)/i,
    /(?:project|tool|cli) (?:called|named) ['"]?([A-Za-z][^.\n]{2,45})/i,
    /['"]([A-Z][A-Za-z0-9\s-]{3,45}(?:CLI|App|Tool)?)['"]/,
    /\b(MacHealth(?:\s+Detective)?(?:\s+CLI)?)\b/i,
    /\b(MacBook\s+Health\s+Detective(?:\s+CLI)?)\b/i,
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    const name = match?.[1]?.trim();
    if (name && name.length >= 3 && !/^(it|this|that|the|yes|no)$/i.test(name)) {
      return name;
    }
  }

  return null;
}

export function buildThreadActionContext(
  message: string,
  history: ConversationTurn[],
  projectName?: string | null
): string {
  const name = projectName ?? extractProjectNameFromThread(message, history);
  const recent = history
    .slice(-8)
    .map((t) => `${t.role}: ${t.content.slice(0, 300)}`)
    .join("\n");
  const label = name ? `Building project "${name}"` : "Project/building discussion";
  return `${label}\n\nThread:\n${recent}\n\nLatest: ${message.slice(0, 400)}`;
}
