import type { PlannerState } from "../types/planner";
import { DEFAULT_SETTINGS as defaults, type AppSettings } from "../types/settings";
import type { ActivityTemplate, SavedWeekTemplate } from "../types/template";
import { normalizeTaskDate, parseDayMentionFromText } from "./dateUtils";
import { enrichLoadedTasksWithTimes } from "./scheduleUtils";
import {
  mergeAllTemplates,
  TEMPLATE_SCHEMA_VERSION,
} from "./templates";
import { startOfWeek, toDateString } from "./dateUtils";
import type { CourseDashboardCourse } from "../types/template";
import { inferKindFromTask } from "./taskUtils";
import type { Task } from "../types/task";
import type { BoxKind } from "../types/box";

const KEYS = {
  tasks: "ldp_tasks",
  planner: "ldp_planner",
  settings: "ldp_settings",
  templates: "ldp_templates",
  weekTemplates: "ldp_week_templates",
  templateVersion: "ldp_template_version",
  courses: "ldp_courses",
  viewWeekStart: "ldp_view_week_start",
  hiddenBuiltinBoxes: "ldp_hidden_builtin_boxes",
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function sanitizeTask(t: Partial<Task>): Task | null {
  if (!t.id || !t.title || !t.date) return null;
  const text = `${t.title} ${t.notes ?? ""}`;
  const mentioned = parseDayMentionFromText(text);
  const repaired: Task = {
    id: t.id,
    title: String(t.title).trim() || "Untitled",
    notes: t.notes,
    date: normalizeTaskDate(mentioned ?? t.date),
    tag: t.tag ?? "personal",
    priority: t.priority ?? "medium",
    kind: inferKindFromTask(t as Task),
    estimatedHours: t.estimatedHours,
    startTime: t.startTime,
    endTime: t.endTime,
    done: Boolean(t.done),
    createdAt: t.createdAt ?? new Date().toISOString(),
    updatedAt: t.updatedAt ?? new Date().toISOString(),
    source: t.source,
    templateId: t.templateId,
    courseKey: t.courseKey,
    examDate: t.examDate,
    color: t.color,
  };
  return repaired;
}

export function loadTasks(): Task[] {
  const raw = read<Task[]>(KEYS.tasks, []);
  const sanitized = raw
    .map((t) => sanitizeTask(t))
    .filter((t): t is Task => t !== null);
  const tasks = enrichLoadedTasksWithTimes(sanitized);
  if (JSON.stringify(tasks) !== JSON.stringify(raw)) {
    write(KEYS.tasks, tasks);
  }
  return tasks;
}

export function saveTasks(tasks: Task[]): void {
  write(KEYS.tasks, tasks);
}

export function loadPlannerState(): PlannerState {
  return read<PlannerState>(KEYS.planner, {
    messages: [],
    pendingSuggestions: [],
    context: {},
  });
}

export function savePlannerState(state: PlannerState): void {
  write(KEYS.planner, state);
}

export function loadSettings(): AppSettings {
  const stored = read<Partial<AppSettings>>(KEYS.settings, {});
  return {
    ...defaults,
    ...stored,
    shortcut: { ...defaults.shortcut, ...stored.shortcut },
    planner: { ...defaults.planner, ...stored.planner },
  };
}

export function saveSettings(settings: AppSettings): void {
  write(KEYS.settings, settings);
}

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function loadTemplates(): ActivityTemplate[] {
  const stored = read<ActivityTemplate[]>(KEYS.templates, []);
  const merged = mergeAllTemplates(stored);
  const version = read<number>(KEYS.templateVersion, 0);
  if (version < TEMPLATE_SCHEMA_VERSION || JSON.stringify(merged) !== JSON.stringify(stored)) {
    write(KEYS.templates, merged);
    write(KEYS.templateVersion, TEMPLATE_SCHEMA_VERSION);
  }
  return merged;
}

export function loadViewWeekStart(): string {
  const stored = read<string | null>(KEYS.viewWeekStart, null);
  if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  return toDateString(startOfWeek());
}

export function saveViewWeekStart(weekStart: string): void {
  write(KEYS.viewWeekStart, weekStart);
}

export function loadHiddenBuiltinBoxes(): BoxKind[] {
  return read<BoxKind[]>(KEYS.hiddenBuiltinBoxes, []);
}

export function saveHiddenBuiltinBoxes(kinds: BoxKind[]): void {
  write(KEYS.hiddenBuiltinBoxes, kinds);
}

export function loadCourses(): CourseDashboardCourse[] {
  return read<CourseDashboardCourse[]>(KEYS.courses, []);
}

export function saveCourses(courses: CourseDashboardCourse[]): void {
  write(KEYS.courses, courses);
}

export function saveTemplates(templates: ActivityTemplate[]): void {
  write(KEYS.templates, templates);
}

export function loadWeekTemplates(): SavedWeekTemplate[] {
  return read<SavedWeekTemplate[]>(KEYS.weekTemplates, []);
}

export function saveWeekTemplates(templates: SavedWeekTemplate[]): void {
  write(KEYS.weekTemplates, templates);
}

export function exportAllData(): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: read<Task[]>(KEYS.tasks, []),
      planner: read<PlannerState>(KEYS.planner, { messages: [], pendingSuggestions: [], context: {} }),
      settings: read<Partial<AppSettings>>(KEYS.settings, {}),
      templates: read<ActivityTemplate[]>(KEYS.templates, []),
      weekTemplates: read<SavedWeekTemplate[]>(KEYS.weekTemplates, []),
    },
    null,
    2
  );
}

export function importAllData(json: string): void {
  const data = JSON.parse(json) as {
    tasks?: Task[];
    planner?: PlannerState;
    settings?: Partial<AppSettings>;
    templates?: ActivityTemplate[];
    weekTemplates?: SavedWeekTemplate[];
  };
  if (data.tasks) write(KEYS.tasks, data.tasks);
  if (data.planner) write(KEYS.planner, data.planner);
  if (data.settings) write(KEYS.settings, data.settings);
  if (data.templates) write(KEYS.templates, data.templates);
  if (data.weekTemplates) write(KEYS.weekTemplates, data.weekTemplates);
}

export function syncCoursesFromVault(courses: CourseDashboardCourse[]): {
  templates: ActivityTemplate[];
  courses: CourseDashboardCourse[];
} {
  saveCourses(courses);
  const templates = loadTemplates();
  return { templates, courses };
}

export const storageSchema = {
  tasks: {
    key: KEYS.tasks,
    shape: "Task[]",
    fields: ["id", "title", "notes", "date", "tag", "priority", "kind", "estimatedHours", "startTime", "endTime", "done", "createdAt", "updatedAt"],
  },
  planner: {
    key: KEYS.planner,
    shape: "PlannerState",
    fields: ["messages", "pendingSuggestions", "awaitingFollowUp", "context"],
  },
  settings: {
    key: KEYS.settings,
    shape: "AppSettings",
    fields: ["shortcut", "llmProvider", "openaiApiKey", "openaiModel", "ollamaBaseUrl", "ollamaModel"],
  },
} as const;
