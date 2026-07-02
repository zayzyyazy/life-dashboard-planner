export type MessageClassification =
  | "project_update"
  | "task"
  | "reminder"
  | "decision"
  | "question"
  | "general_memory"
  | "profile_memory"
  | "watch_request"
  | "brief_request"
  | "general";

export type LifeDomain = "personal_work" | "university" | "personal_life" | "general";

export interface ClassificationResult {
  classification: MessageClassification;
  project_name: string | null;
  life_domain: LifeDomain | null;
  confidence: number;
  extracted: {
    title?: string;
    content?: string;
    due_at?: string;
    repo_url?: string;
    folder_path?: string;
    blocked_reason?: string;
    life_domain?: LifeDomain | null;
  };
  needs_clarification: boolean;
  clarification_question: string | null;
}

import { chatCompletion } from "../services/openai.js";
import { formatPersonalContextForPrompt, getProjectListForClassifier } from "../services/profile.js";

function buildClassifierPrompt(today: string): string {
  const projects = getProjectListForClassifier();
  const personal = formatPersonalContextForPrompt();

  return `You classify user messages for a personal life/project planner agent that knows THIS specific user.

${personal}

Projects the user tracks:
${projects}

Life domains — keep these separate:
- personal_work: startups, Marie/Leaping AI, MCP, QA app, client/coding work
- university: courses, lectures, assignments, exams, professors, campus
- personal_life: health, family, errands, hobbies (not work or school)
- general: facts about the user that apply everywhere

Classify each message into exactly one type:
- project_update: new info/status about a work project
- task: actionable item with optional due date
- reminder: time-based reminder ("remind me tomorrow", "ask me Friday")
- decision: a decision made or recorded
- question: asking the agent something
- profile_memory: user teaching you about themselves ("remember", "about me", "I study", "I work on", "for university", "know that I")
- general_memory: other notes to remember (not about the user specifically)
- watch_request: watch a GitHub repo or local folder
- brief_request: enable/configure daily brief emails
- general: casual chat

Return JSON:
{
  "classification": "...",
  "project_name": "exact project name or null",
  "life_domain": "personal_work | university | personal_life | general | null",
  "confidence": 0.0-1.0,
  "extracted": {
    "title": "short title if applicable",
    "content": "main content",
    "due_at": "ISO 8601 date/datetime if mentioned, else null",
    "repo_url": "GitHub URL if watch request",
    "folder_path": "local path if watch request",
    "blocked_reason": "if task is blocked",
    "life_domain": "same as life_domain field"
  },
  "needs_clarification": false,
  "clarification_question": null
}

For university-related items use life_domain university. For startup/work projects use personal_work.
If project is unclear and confidence < 0.7, set needs_clarification true with one short question.
Parse relative dates (tomorrow, next week, Friday) relative to today. Today is ${today}.`;
}

export async function classifyMessage(
  message: string,
  today: string
): Promise<ClassificationResult> {
  const prompt = buildClassifierPrompt(today);
  const raw = await chatCompletion(
    [
      { role: "system", content: prompt },
      { role: "user", content: message },
    ],
    { json: true }
  );

  try {
    const parsed = JSON.parse(raw) as ClassificationResult;
    const lifeDomain =
      parsed.life_domain ?? parsed.extracted?.life_domain ?? null;
    return {
      classification: parsed.classification ?? "general",
      project_name: parsed.project_name ?? null,
      life_domain: lifeDomain,
      confidence: parsed.confidence ?? 0.5,
      extracted: { ...parsed.extracted, life_domain: lifeDomain },
      needs_clarification: parsed.needs_clarification ?? false,
      clarification_question: parsed.clarification_question ?? null,
    };
  } catch {
    return {
      classification: "general",
      project_name: null,
      life_domain: null,
      confidence: 0,
      extracted: { content: message },
      needs_clarification: false,
      clarification_question: null,
    };
  }
}
