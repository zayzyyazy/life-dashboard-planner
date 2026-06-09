import type { PlannerResponse, WeekReview } from "../types/planner";
import type { SuggestedTask, Task } from "../types/task";
import type { AppSettings } from "../types/settings";
import { inferKind, parseCaptureText } from "./captureParser";
import { normalizeTaskDate, parseDayMentionFromText, todayString } from "./dateUtils";
import { parseTimeRangeFromText } from "./scheduleUtils";
import * as mock from "./mockPlannerAssistant";

function normalizeSuggestions(suggestions: SuggestedTask[]): SuggestedTask[] {
  return suggestions.map((s) => {
    const text = `${s.title} ${s.notes ?? ""}`;
    const mentioned = parseDayMentionFromText(text);
    const times = parseTimeRangeFromText(text);
    const hasTime = Boolean(times || (s.startTime && s.endTime));
    return {
      ...s,
      kind: s.kind ?? inferKind(text, hasTime),
      date: normalizeTaskDate(mentioned ?? s.date),
      ...(times
        ? {
            startTime: times.startTime,
            endTime: times.endTime,
            estimatedHours: times.estimatedHours,
          }
        : {}),
    };
  });
}

export interface PlannerProvider {
  generateResponse(
    message: string,
    context: Record<string, string>,
    tasks: Task[]
  ): Promise<PlannerResponse>;
  generatePlan(
    intent: string,
    context: Record<string, string>,
    tasks: Task[]
  ): Promise<PlannerResponse>;
  reviewWeek(tasks: Task[]): Promise<WeekReview>;
  parseCapture(text: string): Promise<SuggestedTask[]>;
}

class MockPlannerProvider implements PlannerProvider {
  async generateResponse(message: string, context: Record<string, string>, tasks: Task[]) {
    return mock.generateResponse(message, context, tasks);
  }
  async generatePlan(intent: string, context: Record<string, string>, tasks: Task[]) {
    return mock.generatePlan(intent, context, tasks);
  }
  async reviewWeek(tasks: Task[]) {
    return mock.reviewWeek(tasks);
  }
  async parseCapture(text: string) {
    return mock.parsePhoneCapture(text);
  }
}

class OpenAIPlannerProvider implements PlannerProvider {
  constructor(private settings: AppSettings) {}

  private async request(system: string, user: string): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.settings.openaiModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "{}";
  }

  async parseCapture(text: string): Promise<SuggestedTask[]> {
    if (!this.settings.openaiApiKey) return mock.parsePhoneCapture(text);
    const raw = await this.request(
      `Parse the user's phone capture. Return JSON: { "tasks": [{ "title", "date" (YYYY-MM-DD), "kind" (event|task|reminder), "tag", "priority", "estimatedHours?", "startTime?" (HH:mm), "endTime?" (HH:mm), "notes?" }] }. event=timed block (work/uni/meeting), task=to-do, reminder=nudge. Split multiple items. Today is ${todayString()}.`,
      text
    );
    try {
      const parsed = JSON.parse(raw);
      const tasks = parsed.tasks?.length ? parsed.tasks : parseCaptureText(text);
      return normalizeSuggestions(tasks);
    } catch {
      return mock.parsePhoneCapture(text);
    }
  }

  async generateResponse(message: string, context: Record<string, string>, tasks: Task[]) {
    const today = todayString();
    if (!this.settings.openaiApiKey) {
      return mock.generateResponse(message, context, tasks);
    }
    const raw = await this.request(
      `You are a life planning assistant. Today is ${today}. Return JSON: { "reply": string, "suggestions": [...], "followUp?": string, "contextUpdates?": { ... } }.

RULES:
- If the user asks to plan today/tomorrow/week WITHOUT listing specific tasks, return suggestions: [] and ask what they need to do. Set contextUpdates: { "awaiting": "plan-details", "planTarget": "today"|"tomorrow"|"week" } and followUp: "plan-details".
- Only return suggestions after the user describes their tasks OR context.awaiting is "plan-details".
- When planning "today", every suggestion date MUST be ${today}.
- Every suggestion MUST include kind (event|task|reminder), startTime and endTime when timed.
- Split multiple schedule items into separate suggestions. event=work/uni blocks, task=actionable, reminder=nudge.
- Dates must be YYYY-MM-DD, ${today} or later. Never use 2023.`,
      `Today: ${today}\nContext: ${JSON.stringify(context)}\nExisting tasks: ${tasks.length}\nUser: ${message}`
    );
    try {
      const parsed = JSON.parse(raw) as PlannerResponse;
      if (parsed.suggestions?.length) {
        parsed.suggestions = normalizeSuggestions(parsed.suggestions);
      }
      return parsed;
    } catch {
      return mock.generateResponse(message, context, tasks);
    }
  }

  async generatePlan(intent: string, context: Record<string, string>, tasks: Task[]) {
    return this.generateResponse(intent, context, tasks);
  }

  async reviewWeek(tasks: Task[]) {
    return mock.reviewWeek(tasks);
  }
}

export function createPlannerProvider(settings: AppSettings): PlannerProvider {
  if (settings.llmProvider === "openai" && settings.openaiApiKey) {
    return new OpenAIPlannerProvider(settings);
  }
  return new MockPlannerProvider();
}
