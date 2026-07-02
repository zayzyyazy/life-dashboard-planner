export type MessageClassification =
  | "project_update"
  | "task"
  | "reminder"
  | "decision"
  | "question"
  | "general_memory"
  | "watch_request"
  | "brief_request"
  | "general";

export interface ClassificationResult {
  classification: MessageClassification;
  project_name: string | null;
  confidence: number;
  extracted: {
    title?: string;
    content?: string;
    due_at?: string;
    repo_url?: string;
    folder_path?: string;
    blocked_reason?: string;
  };
  needs_clarification: boolean;
  clarification_question: string | null;
}

const CLASSIFIER_PROMPT = `You classify user messages for a personal life/project planner agent.

Projects the user tracks:
- Marie / Leaping AI
- MCP Server
- QA Call Analysis App
- Project Planner
- Life Planner Agent

Classify each message into exactly one type:
- project_update: new info/status about a project
- task: actionable item with optional due date
- reminder: time-based reminder ("remind me tomorrow", "ask me Friday")
- decision: a decision made or recorded
- question: asking the agent something
- general_memory: general note to remember
- watch_request: watch a GitHub repo or local folder
- brief_request: enable/configure daily brief emails
- general: casual chat

Return JSON:
{
  "classification": "...",
  "project_name": "exact project name or null",
  "confidence": 0.0-1.0,
  "extracted": {
    "title": "short title if applicable",
    "content": "main content",
    "due_at": "ISO 8601 date/datetime if mentioned, else null",
    "repo_url": "GitHub URL if watch request",
    "folder_path": "local path if watch request",
    "blocked_reason": "if task is blocked"
  },
  "needs_clarification": false,
  "clarification_question": null
}

If project is unclear and confidence < 0.7, set needs_clarification true with one short question.
Parse relative dates (tomorrow, next week, Friday) relative to today. Today is {{TODAY}}.`;

import { chatCompletion } from "./openai.js";

export async function classifyMessage(
  message: string,
  today: string
): Promise<ClassificationResult> {
  const prompt = CLASSIFIER_PROMPT.replace("{{TODAY}}", today);
  const raw = await chatCompletion(
    [
      { role: "system", content: prompt },
      { role: "user", content: message },
    ],
    { json: true }
  );

  try {
    const parsed = JSON.parse(raw) as ClassificationResult;
    return {
      classification: parsed.classification ?? "general",
      project_name: parsed.project_name ?? null,
      confidence: parsed.confidence ?? 0.5,
      extracted: parsed.extracted ?? {},
      needs_clarification: parsed.needs_clarification ?? false,
      clarification_question: parsed.clarification_question ?? null,
    };
  } catch {
    return {
      classification: "general",
      project_name: null,
      confidence: 0,
      extracted: { content: message },
      needs_clarification: false,
      clarification_question: null,
    };
  }
}
