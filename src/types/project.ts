export type ProjectStatus = "active" | "paused" | "done";

export type Project = {
  id: string;
  name: string;
  color: string;
  description?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDraft = Omit<Project, "id" | "createdAt" | "updatedAt">;

export const PROJECT_COLORS = [
  "#6c8cff",
  "#4ade80",
  "#fbbf24",
  "#f87171",
  "#c084fc",
  "#22d3ee",
  "#fb923c",
  "#a3e635",
] as const;
