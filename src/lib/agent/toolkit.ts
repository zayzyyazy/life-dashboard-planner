import type { AgentMemoryState } from "../../types/agent";
import type { Project, ProjectDraft } from "../../types/project";
import type { Task, TaskDraft } from "../../types/task";
import { fetchAgentIntegrations, openAgentIntegration } from "./integrations";

type Deps = {
  getTasks: () => Task[];
  getProjects: () => Project[];
  getMemory: () => AgentMemoryState;
  setMemory: (m: AgentMemoryState) => void;
  addTask: (draft: TaskDraft) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  addProject: (draft: ProjectDraft) => void;
  shortcutStatus: string;
};

export function createAgentToolkit(deps: Deps) {
  return {
    getTasks: deps.getTasks,
    getProjects: deps.getProjects,
    getMemory: deps.getMemory,
    setMemory: deps.setMemory,
    addTask: deps.addTask,
    updateTask: deps.updateTask,
    addProject: deps.addProject,
    getIntegrations: () => fetchAgentIntegrations(deps.shortcutStatus, deps.getProjects().length),
    openIntegration: openAgentIntegration,
  };
}
