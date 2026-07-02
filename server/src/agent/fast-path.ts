import type { ClassificationResult } from "./classifier.js";
import { getSetting } from "../db/index.js";
import {
  extractReminderContent,
  looksLikeReminder,
  looksLikeReminderComplaint,
  looksLikeTimeFollowUp,
  parseBareDateTime,
  parseDueDate,
} from "./parse-due.js";

interface ConversationTurn {
  role: string;
  content: string;
}

/** Reliable keyword classification before LLM — fixes tasks/reminders not saving. */
export function tryFastClassify(
  message: string,
  recentTurns: ConversationTurn[] = []
): ClassificationResult | null {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (looksLikeReminderComplaint(trimmed)) {
    return {
      classification: "reminder_complaint",
      project_name: null,
      life_domain: null,
      confidence: 0.95,
      extracted: { content: trimmed },
      needs_clarification: false,
      clarification_question: null,
    };
  }

  // Follow-up: "23:36", "Jul 2nd 23:35", "Thursday" after a reminder thread
  const followUp = tryReminderFollowUp(trimmed, recentTurns);
  if (followUp) return followUp;

  if (looksLikeReminder(trimmed)) {
    const due_at = parseDueDate(trimmed) ?? undefined;
    const content = extractReminderContent(trimmed);
    if (!due_at) {
      return {
        classification: "reminder",
        project_name: null,
        life_domain: null,
        confidence: 0.9,
        extracted: { content },
        needs_clarification: true,
        clarification_question: "When? Reply with a time — e.g. 23:30, in 5 minutes, or Jul 2 23:35",
      };
    }
    return {
      classification: "reminder",
      project_name: null,
      life_domain: null,
      confidence: 0.95,
      extracted: { content, due_at },
      needs_clarification: false,
      clarification_question: null,
    };
  }

  if (
    /^(task|todo)\s*:/i.test(trimmed) ||
    /\badd\s+task\b/i.test(trimmed) ||
    /\bnew\s+task\b/i.test(trimmed)
  ) {
    const title = trimmed
      .replace(/^(task|todo)\s*:\s*/i, "")
      .replace(/\badd\s+task\s*:?\s*/i, "")
      .replace(/\bnew\s+task\s*:?\s*/i, "")
      .trim();
    return {
      classification: "task",
      project_name: null,
      life_domain: null,
      confidence: 0.95,
      extracted: {
        title: title.slice(0, 120),
        content: title,
        due_at: parseDueDate(trimmed) ?? undefined,
      },
      needs_clarification: false,
      clarification_question: null,
    };
  }

  if (
    /\b(mark|done with|finished|completed|complete)\b/i.test(trimmed) &&
    (/\bdone\b/i.test(trimmed) || /\bfinished\b/i.test(trimmed) || /\bcomplete/i.test(trimmed))
  ) {
    const title = trimmed
      .replace(/\b(mark|done with|finished|completed|complete)\b/gi, "")
      .replace(/\b(the|task|as)\b/gi, "")
      .trim();
    return {
      classification: "task_complete",
      project_name: null,
      life_domain: null,
      confidence: 0.9,
      extracted: { title: title || trimmed, content: title },
      needs_clarification: false,
      clarification_question: null,
    };
  }

  if (/\bwhat('?s| is)\s+(happening|new|changed)\s+(on|in)\s+(my\s+)?github\b/i.test(trimmed)) {
    return {
      classification: "github_query",
      project_name: null,
      life_domain: null,
      confidence: 0.95,
      extracted: { content: trimmed },
      needs_clarification: false,
      clarification_question: null,
    };
  }

  if (
    /\b(remember|save)\s+(this|that|about me)\b/i.test(trimmed) ||
    /^for\s+(university|uni|work|personal)\s*:/i.test(trimmed)
  ) {
    const isProfile =
      /\babout\s+me\b/i.test(trimmed) ||
      /\b(i\s+(study|work|am|live))\b/i.test(trimmed) ||
      /^for\s+(university|uni|work|personal)\s*:/i.test(trimmed);
    return {
      classification: isProfile ? "profile_memory" : "general_memory",
      project_name: null,
      life_domain: null,
      confidence: 0.85,
      extracted: {
        title: "Note",
        content: trimmed,
      },
      needs_clarification: false,
      clarification_question: null,
    };
  }

  if (/\badd\s+(this|that)\s+to\b/i.test(trimmed) || /\bupdate\s+on\b/i.test(lower)) {
    return {
      classification: "project_update",
      project_name: extractProjectName(trimmed),
      life_domain: null,
      confidence: 0.8,
      extracted: {
        title: "Update",
        content: trimmed,
      },
      needs_clarification: false,
      clarification_question: null,
    };
  }

  return null;
}

function tryReminderFollowUp(
  message: string,
  recentTurns: ConversationTurn[]
): ClassificationResult | null {
  if (!looksLikeTimeFollowUp(message) && !isAwaitingReminderTime(recentTurns)) {
    return null;
  }

  const due_at =
    parseBareDateTime(message) ??
    parseDueDate(message) ??
    parseDueDate(`at ${message}`) ??
    parseDueDate(`on ${message}`);

  if (!due_at && /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(message)) {
    const fallback = parseDueDate(`on ${message} 9:00`);
    const content = extractReminderSubject(recentTurns);
    if (fallback && content) {
      return buildReminderFollowUp(content, fallback);
    }
  }

  if (!due_at) return null;

  const content = extractReminderSubject(recentTurns);
  if (!content) return null;

  return buildReminderFollowUp(content, due_at);
}

function buildReminderFollowUp(content: string, due_at: string): ClassificationResult {
  return {
    classification: "reminder",
    project_name: null,
    life_domain: null,
    confidence: 0.95,
    extracted: { content, due_at },
    needs_clarification: false,
    clarification_question: null,
  };
}

function isAwaitingReminderTime(turns: ConversationTurn[]): boolean {
  const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant");
  if (!lastAssistant) return false;
  const c = lastAssistant.content.toLowerCase();
  return (
    c.includes("when?") ||
    c.includes("when should i remind") ||
    c.includes("reply with a time") ||
    c.includes("more context")
  );
}

function extractReminderSubject(turns: ConversationTurn[]): string | null {
  const pending = getSetting("pending_reminder_draft");
  if (pending?.trim()) return pending.trim();

  for (const t of [...turns].reverse()) {
    if (t.role !== "user") continue;
    const text = t.content.trim();
    if (looksLikeTimeFollowUp(text) || text.length < 3) continue;

    if (looksLikeReminder(text) || /\b(call|mom|dad|remind)\b/i.test(text)) {
      const content = extractReminderContent(text);
      if (content.length >= 2) return content;
    }

    // "call mom on thursday 23:30"
    const callMatch = text.match(/\b(call|text|ping)\s+(.+)/i);
    if (callMatch) {
      const content = extractReminderContent(callMatch[2]);
      if (content.length >= 2) return content;
    }
  }

  // From assistant's last reminder confirmation: 'call mom'
  const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant");
  const quoted = lastAssistant?.content.match(/"([^"]+)"/);
  if (quoted?.[1]) return quoted[1];

  return null;
}

function extractProjectName(message: string): string | null {
  const match = message.match(/\b(?:add\s+(?:this|that)\s+to|update\s+on)\s+(?:the\s+)?(.+?)(?:\s*:|$)/i);
  return match?.[1]?.trim() ?? null;
}
