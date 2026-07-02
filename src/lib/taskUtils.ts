import type { Task, TaskDraft, TaskKind, TaskPriority, TaskTag } from "../types/task";
import { inferBucket } from "./bucketUtils";

export function createTaskId(): string {
  return crypto.randomUUID();
}

export { createTaskId as newTaskId };

export function nowIso(): string {
  return new Date().toISOString();
}

export function createTask(draft: TaskDraft): Task {
  const ts = nowIso();
  return {
    id: createTaskId(),
    title: (draft.title ?? "").trim() || "Untitled",
    notes: draft.notes?.trim() || undefined,
    date: draft.date,
    tag: draft.tag,
    priority: draft.priority,
    kind: draft.kind ?? "task",
    bucket: draft.bucket ?? (draft.startTime ? "scheduled" : inferBucket({
      date: draft.date,
      priority: draft.priority,
      startTime: draft.startTime,
      done: draft.done ?? false,
    })),
    estimatedHours: draft.estimatedHours,
    startTime: draft.startTime,
    endTime: draft.endTime,
    done: draft.done ?? false,
    source: draft.source,
    templateId: draft.templateId,
    courseKey: draft.courseKey,
    examDate: draft.examDate,
    color: draft.color,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function updateTask(task: Task, patch: Partial<Task>): Task {
  return { ...task, ...patch, updatedAt: nowIso() };
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function sortByPriority(a: Task, b: Task): number {
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
}

export function sortByDate(a: Task, b: Task): number {
  return a.date.localeCompare(b.date);
}

export const TAG_LABELS: Record<TaskTag, string> = {
  uni: "University",
  work: "Work",
  personal: "Personal",
  health: "Health",
  admin: "Admin",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const KIND_LABELS: Record<TaskKind, string> = {
  event: "Event",
  task: "Task",
  reminder: "Reminder",
};

export function inferKindFromTask(task: Pick<Task, "title" | "notes" | "startTime" | "endTime" | "kind">): TaskKind {
  if (task.kind) return task.kind;
  const text = `${task.title} ${task.notes ?? ""}`;
  const hasTime = Boolean(task.startTime && task.endTime);
  if (/\b(remind\s+me|don't forget|remember\s+to)\b/i.test(text)) return "reminder";
  if (hasTime && /\b(work|uni|lecture|meeting|class)\b/i.test(text)) return "event";
  return hasTime ? "event" : "task";
}

export function inferTag(text: string): TaskTag {
  const t = text.toLowerCase();
  if (/exam|study|lecture|assignment|uni|university|course|homework/.test(t)) return "uni";
  if (/gym|workout|run|health|sleep|meditat/.test(t)) return "health";
  if (/meeting|work|client|project|email/.test(t)) return "work";
  if (/pay|insurance|bill|admin|tax|renew/.test(t)) return "admin";
  return "personal";
}

export function inferPriority(text: string): TaskPriority {
  const t = text.toLowerCase();
  if (/urgent|asap|important|exam|deadline/.test(t)) return "high";
  if (/maybe|sometime|optional/.test(t)) return "low";
  return "medium";
}

export function splitLinesToTasks(text: string, defaultDate: string): TaskDraft[] {
  return text
    .split(/\n|;/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter((line) => line.length > 2)
    .map((line) => ({
      title: line.slice(0, 120),
      date: defaultDate,
      kind: "task" as const,
      tag: inferTag(line),
      priority: inferPriority(line),
      estimatedHours: /study|workout|gym/.test(line.toLowerCase()) ? 1 : undefined,
      notes: line.length > 120 ? line : undefined,
    }));
}
