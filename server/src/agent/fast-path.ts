import type { ClassificationResult } from "./classifier.js";
import { parseDueDate } from "./parse-due.js";

/** Reliable keyword classification before LLM — fixes tasks/reminders not saving. */
export function tryFastClassify(message: string): ClassificationResult | null {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (
    /^remind\s+me\b/i.test(trimmed) ||
    /\bremind\s+me\s+(to|about|at|in|on|tomorrow|next)\b/i.test(trimmed)
  ) {
    const content = trimmed
      .replace(/^remind\s+me\s+(to\s+)?/i, "")
      .replace(/\b(tomorrow|today|next\s+\w+|in\s+\d+\s+\w+|at\s+[\d:]+\s*(am|pm)?)\b/gi, "")
      .trim();
    return {
      classification: "reminder",
      project_name: null,
      life_domain: null,
      confidence: 0.95,
      extracted: {
        content: content || trimmed,
        due_at: parseDueDate(trimmed) ?? undefined,
      },
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

function extractProjectName(message: string): string | null {
  const match = message.match(/\b(?:add\s+(?:this|that)\s+to|update\s+on)\s+(?:the\s+)?(.+?)(?:\s*:|$)/i);
  return match?.[1]?.trim() ?? null;
}
