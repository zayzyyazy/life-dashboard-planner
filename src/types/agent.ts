export type AgentMemorySource = "chat" | "shortcut" | "system" | "tool";

export type AgentMemoryEntry = {
  id: string;
  content: string;
  source: AgentMemorySource;
  tags?: string[];
  createdAt: string;
};

export type AgentIntegration = {
  id: string;
  name: string;
  status: "connected" | "available" | "unavailable";
  description: string;
  capabilities: string[];
};

export type AgentToolName =
  | "get_dashboard"
  | "list_tasks"
  | "add_task"
  | "update_task"
  | "list_projects"
  | "add_project"
  | "record_memory"
  | "search_memory"
  | "list_integrations"
  | "open_integration";

export type AgentToolCall = {
  id: string;
  name: AgentToolName;
  arguments: Record<string, unknown>;
  result?: string;
};

export type AgentTurn = {
  reply: string;
  toolCalls: AgentToolCall[];
  memoriesRecorded: number;
  tasksChanged: number;
};

export type AgentMemoryState = {
  entries: AgentMemoryEntry[];
};
