import { addDays, startOfWeek, toDateString, weekDays } from "./dateUtils";
import { minutesToTime, timeToMinutes } from "./scheduleUtils";
import { createTask, createTaskId, nowIso } from "./taskUtils";
import type { BoxKind } from "../types/box";
import type {
  ActivityTemplate,
  CourseDashboardCourse,
  SavedWeekSlot,
  SavedWeekTemplate,
} from "../types/template";
import type { Task, TaskDraft, TaskKind, TaskTag } from "../types/task";

export const TEMPLATE_SCHEMA_VERSION = 2;

const COURSE_COLORS = ["#6c8cff", "#4ade80", "#a78bfa", "#fbbf24", "#f472b6", "#38bdf8"];

export const BOX_DEFINITIONS: Record<
  BoxKind,
  { id: string; label: string; tag: TaskTag; defaultHours: number; color: string; kind: TaskKind }
> = {
  work: { id: "box-work", label: "Work", tag: "work", defaultHours: 8, color: "#f59e0b", kind: "event" },
  study: { id: "box-study", label: "Study", tag: "uni", defaultHours: 2, color: "#6c8cff", kind: "event" },
  cleaning: { id: "box-cleaning", label: "Cleaning", tag: "personal", defaultHours: 2, color: "#fb923c", kind: "task" },
  gym: { id: "box-gym", label: "Gym", tag: "health", defaultHours: 1, color: "#4ade80", kind: "event" },
  admin: { id: "box-admin", label: "Admin", tag: "admin", defaultHours: 1, color: "#94a3b8", kind: "task" },
};

export function builtInLifeTemplates(): ActivityTemplate[] {
  return (Object.keys(BOX_DEFINITIONS) as BoxKind[]).map((kind) => ({
    ...BOX_DEFINITIONS[kind],
    isBuiltIn: true,
  }));
}

export function mergeAllTemplates(stored: ActivityTemplate[]): ActivityTemplate[] {
  const builtIn = builtInLifeTemplates();
  const builtInIds = new Set(builtIn.map((t) => t.id));
  const custom = stored.filter((t) => !t.isBuiltIn && !builtInIds.has(t.id));
  return [...builtIn, ...custom];
}

export function draftFromTemplate(
  template: ActivityTemplate,
  date: string,
  startTime: string,
  hours?: number
): TaskDraft {
  return createBlockDraft({
    date,
    startTime,
    hours: hours ?? template.defaultHours,
    label: template.label,
    tag: template.tag,
    color: template.color,
    kind: template.kind,
    templateId: template.id,
    courseKey: template.courseKey,
    examDate: template.examDate,
  });
}

function weekDaysFromAnchor(weekStart?: string): Date[] {
  const anchor = weekStart ? new Date(weekStart + "T12:00:00") : undefined;
  return weekDays(anchor);
}

export function courseColor(index: number): string {
  return COURSE_COLORS[index % COURSE_COLORS.length];
}

export function mergeTemplatesWithCourses(
  _existing: ActivityTemplate[],
  _courses: CourseDashboardCourse[]
): ActivityTemplate[] {
  return builtInLifeTemplates();
}

export function createBlockDraft(params: {
  date: string;
  startTime: string;
  hours: number;
  label: string;
  tag: TaskTag;
  color: string;
  kind: TaskKind;
  templateId: string;
  courseKey?: string;
  examDate?: string;
}): TaskDraft {
  const startMin = timeToMinutes(params.startTime);
  const endMin = startMin + Math.round(params.hours * 60);
  return {
    title: params.label,
    date: params.date,
    tag: params.tag,
    priority: params.examDate ? "high" : "medium",
    kind: params.kind,
    estimatedHours: params.hours,
    startTime: params.startTime,
    endTime: minutesToTime(endMin),
    source: "box",
    templateId: params.templateId,
    courseKey: params.courseKey,
    examDate: params.examDate,
    color: params.color,
  };
}

export function draftFromBox(
  boxKind: BoxKind,
  date: string,
  startTime: string,
  hours: number,
  course?: CourseDashboardCourse,
  courseIndex = 0
): TaskDraft {
  const box = BOX_DEFINITIONS[boxKind];
  if (boxKind === "study" && course) {
    return createBlockDraft({
      date,
      startTime,
      hours,
      label: course.displayName,
      tag: "uni",
      color: courseColor(courseIndex),
      kind: "event",
      templateId: box.id,
      courseKey: course.storageKey,
      examDate: course.examDate,
    });
  }
  return createBlockDraft({
    date,
    startTime,
    hours,
    label: box.label,
    tag: box.tag,
    color: box.color,
    kind: box.kind,
    templateId: box.id,
  });
}

export function copyPreviousWeekTasks(tasks: Task[], weekStart?: string): Task[] {
  const currentWeekDates = weekDaysFromAnchor(weekStart).map(toDateString);
  const prevWeekDates = currentWeekDates.map((d) => addDays(d, -7));
  const prevTasks = tasks.filter((t) => prevWeekDates.includes(t.date) && !t.done);

  const cloned: Task[] = [];
  for (const t of prevTasks) {
    const idx = prevWeekDates.indexOf(t.date);
    if (idx < 0) continue;
    const ts = nowIso();
    cloned.push({
      ...t,
      id: createTaskId(),
      date: currentWeekDates[idx],
      done: false,
      source: "copy-week",
      createdAt: ts,
      updatedAt: ts,
    });
  }
  return cloned;
}

export function currentWeekToSlots(tasks: Task[], weekStart?: string): SavedWeekSlot[] {
  const days = weekDaysFromAnchor(weekStart);
  const slots: SavedWeekSlot[] = [];
  for (let i = 0; i < days.length; i++) {
    const dateStr = toDateString(days[i]);
    const dayTasks = tasks.filter((t) => t.date === dateStr);
    for (const t of dayTasks) {
      slots.push({
        weekdayIndex: i,
        templateId: t.templateId ?? t.id,
        label: t.title,
        tag: t.tag,
        defaultHours: t.estimatedHours ?? 1,
        color: t.color ?? "#6c8cff",
        kind: t.kind,
        startTime: t.startTime,
        endTime: t.endTime,
        courseKey: t.courseKey,
        examDate: t.examDate,
      });
    }
  }
  return slots;
}

export function createTaskFromTemplate(
  template: ActivityTemplate,
  date: string,
  _existingTasks: Task[]
): Task {
  const startTime = "09:00";
  const hours = template.defaultHours;
  const startMin = timeToMinutes(startTime);
  const endMin = startMin + Math.round(hours * 60);
  return createTask({
    title: template.label,
    date,
    tag: template.tag,
    priority: "medium",
    kind: template.kind,
    estimatedHours: hours,
    startTime,
    endTime: minutesToTime(endMin),
    source: "box",
    templateId: template.id,
    color: template.color,
  });
}

export function applyWeekTemplate(
  template: SavedWeekTemplate,
  _existingTasks: Task[],
  weekStart?: string
): Task[] {
  const days = weekDaysFromAnchor(weekStart);
  const newTasks: Task[] = [];
  for (const slot of template.slots) {
    const date = toDateString(days[slot.weekdayIndex]);
    const ts = nowIso();
    newTasks.push({
      id: createTaskId(),
      title: slot.label,
      date,
      tag: slot.tag,
      priority: slot.examDate ? "high" : "medium",
      kind: slot.kind,
      bucket: slot.startTime ? "scheduled" : "later",
      estimatedHours: slot.defaultHours,
      startTime: slot.startTime,
      endTime: slot.endTime,
      done: false,
      source: "box",
      templateId: slot.templateId,
      courseKey: slot.courseKey,
      examDate: slot.examDate,
      color: slot.color,
      createdAt: ts,
      updatedAt: ts,
    });
  }
  return newTasks;
}

export function examCountdownLabel(examDate?: string): string | null {
  if (!examDate) return null;
  const today = toDateString(new Date());
  const diff = Math.ceil(
    (new Date(examDate).getTime() - new Date(today).getTime()) / 86400000
  );
  if (diff < 0) return "Exam passed";
  if (diff === 0) return "Exam today";
  return `Exam in ${diff}d`;
}

export function weekLabel(weekStart?: string): string {
  const start = weekStart
    ? new Date(weekStart + "T12:00:00")
    : startOfWeek();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}
