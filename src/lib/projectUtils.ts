import type { Project, ProjectDraft } from "../types/project";
import { PROJECT_COLORS } from "../types/project";
import type { Task } from "../types/task";
import { createTaskId, nowIso } from "./taskUtils";

export function createProject(draft: ProjectDraft): Project {
  const ts = nowIso();
  return {
    id: createTaskId(),
    name: draft.name.trim() || "Untitled Project",
    color: draft.color || PROJECT_COLORS[0],
    description: draft.description?.trim() || undefined,
    status: draft.status ?? "active",
    createdAt: ts,
    updatedAt: ts,
  };
}

export function updateProject(project: Project, patch: Partial<Project>): Project {
  return { ...project, ...patch, updatedAt: nowIso() };
}

export function projectTaskCounts(tasks: Task[], projectId: string) {
  const projectTasks = tasks.filter((t) => t.projectId === projectId && !t.done);
  return {
    total: projectTasks.length,
    now: projectTasks.filter((t) => t.bucket === "now").length,
    scheduled: projectTasks.filter((t) => t.bucket === "scheduled").length,
    later: projectTasks.filter((t) => t.bucket === "later").length,
  };
}
