import { addDays, todayString } from "./dateUtils";
import type { Task, TaskBucket } from "../types/task";

export const BUCKET_LABELS: Record<TaskBucket, string> = {
  now: "Must Do Now",
  scheduled: "Scheduled",
  later: "Later",
  someday: "Someday",
};

export const BUCKET_DESCRIPTIONS: Record<TaskBucket, string> = {
  now: "Urgent — do these first",
  scheduled: "On your calendar with a time or date",
  later: "Coming up soon, not urgent yet",
  someday: "Ideas and backlog for when you have time",
};

export function inferBucket(task: Pick<Task, "date" | "priority" | "startTime" | "done">): TaskBucket {
  if (task.startTime) return "scheduled";

  const today = todayString();
  const inWeek = addDays(today, 7);
  const inMonth = addDays(today, 30);

  if (task.priority === "high" && task.date <= today) return "now";
  if (task.date <= inWeek) return task.priority === "high" ? "now" : "scheduled";
  if (task.date <= inMonth) return "later";
  return "someday";
}

export function migrateTaskBucket(task: Partial<Task>): TaskBucket {
  if (task.bucket) return task.bucket;
  return inferBucket({
    date: task.date ?? todayString(),
    priority: task.priority ?? "medium",
    startTime: task.startTime,
    done: Boolean(task.done),
  });
}

export function sortByBucketPriority(a: Task, b: Task): number {
  const bucketOrder: Record<TaskBucket, number> = { now: 0, scheduled: 1, later: 2, someday: 3 };
  const bucketDiff = bucketOrder[a.bucket] - bucketOrder[b.bucket];
  if (bucketDiff !== 0) return bucketDiff;
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const priDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
  if (priDiff !== 0) return priDiff;
  return a.date.localeCompare(b.date);
}

export function filterOpenTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.done);
}

export function tasksInBucket(tasks: Task[], bucket: TaskBucket): Task[] {
  return filterOpenTasks(tasks)
    .filter((t) => t.bucket === bucket)
    .sort(sortByBucketPriority);
}
