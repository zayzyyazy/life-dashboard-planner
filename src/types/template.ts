import type { TaskKind, TaskTag } from "./task";

export type ActivityTemplate = {
  id: string;
  label: string;
  tag: TaskTag;
  defaultHours: number;
  color: string;
  kind: TaskKind;
  courseKey?: string;
  examDate?: string;
  isBuiltIn?: boolean;
};

export type SavedWeekSlot = {
  weekdayIndex: number;
  templateId: string;
  label: string;
  tag: TaskTag;
  defaultHours: number;
  color: string;
  kind: TaskKind;
  startTime?: string;
  endTime?: string;
  courseKey?: string;
  examDate?: string;
};

export type SavedWeekTemplate = {
  id: string;
  name: string;
  slots: SavedWeekSlot[];
  createdAt: string;
};

export type CourseDashboardCourse = {
  storageKey: string;
  displayName: string;
  examDate?: string;
  personalDifficulty?: number;
};
