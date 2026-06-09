export type TaskTag = "uni" | "work" | "personal" | "health" | "admin";
export type TaskPriority = "low" | "medium" | "high";
export type TaskKind = "event" | "task" | "reminder";
export type TaskSource = "manual" | "box" | "capture" | "ai" | "copy-week";

export type Task = {
  id: string;
  title: string;
  notes?: string;
  date: string;
  tag: TaskTag;
  priority: TaskPriority;
  kind: TaskKind;
  estimatedHours?: number;
  startTime?: string;
  endTime?: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  source?: TaskSource;
  templateId?: string;
  courseKey?: string;
  examDate?: string;
  color?: string;
};

export type TaskDraft = Omit<Task, "id" | "createdAt" | "updatedAt" | "done" | "kind"> & {
  kind?: TaskKind;
  done?: boolean;
};

export type SuggestedTask = {
  title: string;
  date: string;
  tag: TaskTag;
  priority: TaskPriority;
  kind: TaskKind;
  estimatedHours?: number;
  startTime?: string;
  endTime?: string;
  notes?: string;
};
