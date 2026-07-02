import { buildDailyBriefing } from "../dailyBriefing";
import { tasksInBucket } from "../bucketUtils";
import { todayString } from "../dateUtils";
import { inferPriority, inferTag } from "../taskUtils";
import type { AgentIntegration, AgentToolCall, AgentToolName } from "../../types/agent";
import type { Project, ProjectDraft } from "../../types/project";
import type { Task, TaskBucket, TaskDraft } from "../../types/task";
import type { AgentMemoryState } from "../../types/agent";
import { recordMemory, searchMemory } from "./memory";

export type AgentToolkit = {
  getTasks: () => Task[];
  getProjects: () => Project[];
  getMemory: () => AgentMemoryState;
  setMemory: (memory: AgentMemoryState) => void;
  addTask: (draft: TaskDraft) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  addProject: (draft: ProjectDraft) => void;
  getIntegrations: () => Promise<AgentIntegration[]>;
  openIntegration: (id: string) => Promise<string>;
};

export const TOOL_DEFINITIONS = [
  {
    name: "get_dashboard",
    description: "Get a summary of must-dos, today's schedule, later items, projects, and recent memory",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_tasks",
    description: "List open tasks, optionally filtered by bucket or project",
    parameters: {
      type: "object",
      properties: {
        bucket: { type: "string", enum: ["now", "scheduled", "later", "someday"] },
        projectId: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "add_task",
    description: "Add a new task or scheduled block",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        bucket: { type: "string", enum: ["now", "scheduled", "later", "someday"] },
        date: { type: "string", description: "YYYY-MM-DD" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        startTime: { type: "string" },
        endTime: { type: "string" },
        notes: { type: "string" },
        projectId: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Update a task — mark done, change bucket, priority, or date",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        title: { type: "string" },
        bucket: { type: "string", enum: ["now", "scheduled", "later", "someday"] },
        done: { type: "boolean" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        date: { type: "string" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "list_projects",
    description: "List all projects",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "add_project",
    description: "Create a new project to group related work",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "record_memory",
    description: "Remember a fact, preference, or update the user shared for future reference",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["content"],
    },
  },
  {
    name: "search_memory",
    description: "Search past updates and remembered context",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_integrations",
    description: "List local apps and integrations the agent can access",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "open_integration",
    description: "Open a connected local app (e.g. course_dashboard)",
    parameters: {
      type: "object",
      properties: {
        integrationId: { type: "string" },
      },
      required: ["integrationId"],
    },
  },
] as const;

export async function executeTool(
  name: AgentToolName,
  args: Record<string, unknown>,
  toolkit: AgentToolkit
): Promise<{ result: string; memoriesRecorded: number; tasksChanged: number }> {
  const tasks = toolkit.getTasks();
  const projects = toolkit.getProjects();
  const memory = toolkit.getMemory();
  let memoriesRecorded = 0;
  let tasksChanged = 0;

  switch (name) {
    case "get_dashboard": {
      const briefing = buildDailyBriefing(tasks, projects);
      const recent = memory.entries.slice(0, 5).map((e) => e.content);
      return {
        result: JSON.stringify({
          briefing: briefing.summary,
          stats: briefing.stats,
          nextUp: briefing.nextUp,
          recentMemory: recent,
        }),
        memoriesRecorded,
        tasksChanged,
      };
    }
    case "list_tasks": {
      const bucket = args.bucket as TaskBucket | undefined;
      const projectId = args.projectId as string | undefined;
      const limit = (args.limit as number) ?? 20;
      let list = tasks.filter((t) => !t.done);
      if (bucket) list = list.filter((t) => t.bucket === bucket);
      if (projectId) list = list.filter((t) => t.projectId === projectId);
      return {
        result: JSON.stringify(
          list.slice(0, limit).map((t) => ({
            id: t.id,
            title: t.title,
            bucket: t.bucket,
            date: t.date,
            priority: t.priority,
            done: t.done,
            projectId: t.projectId,
          }))
        ),
        memoriesRecorded,
        tasksChanged,
      };
    }
    case "add_task": {
      const title = String(args.title ?? "").trim();
      if (!title) return { result: JSON.stringify({ error: "title required" }), memoriesRecorded, tasksChanged };
      const bucket = (args.bucket as TaskBucket) ?? "later";
      toolkit.addTask({
        title,
        date: (args.date as string) ?? todayString(),
        tag: inferTag(title),
        priority: (args.priority as Task["priority"]) ?? inferPriority(title),
        bucket,
        startTime: args.startTime as string | undefined,
        endTime: args.endTime as string | undefined,
        notes: args.notes as string | undefined,
        projectId: args.projectId as string | undefined,
        source: "ai",
      });
      tasksChanged = 1;
      return { result: JSON.stringify({ ok: true, title, bucket }), memoriesRecorded, tasksChanged };
    }
    case "update_task": {
      const taskId = String(args.taskId ?? "");
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return { result: JSON.stringify({ error: "task not found" }), memoriesRecorded, tasksChanged };
      const patch: Partial<Task> = {};
      if (args.title) patch.title = String(args.title);
      if (args.bucket) patch.bucket = args.bucket as TaskBucket;
      if (args.done !== undefined) patch.done = Boolean(args.done);
      if (args.priority) patch.priority = args.priority as Task["priority"];
      if (args.date) patch.date = String(args.date);
      toolkit.updateTask(taskId, patch);
      tasksChanged = 1;
      return { result: JSON.stringify({ ok: true, taskId, patch }), memoriesRecorded, tasksChanged };
    }
    case "list_projects":
      return {
        result: JSON.stringify(
          projects.map((p) => ({ id: p.id, name: p.name, status: p.status, description: p.description }))
        ),
        memoriesRecorded,
        tasksChanged,
      };
    case "add_project": {
      const name = String(args.name ?? "").trim();
      if (!name) return { result: JSON.stringify({ error: "name required" }), memoriesRecorded, tasksChanged };
      toolkit.addProject({ name, description: args.description as string | undefined, color: "#6c8cff", status: "active" });
      return { result: JSON.stringify({ ok: true, name }), memoriesRecorded, tasksChanged };
    }
    case "record_memory": {
      const content = String(args.content ?? "").trim();
      if (!content) return { result: JSON.stringify({ error: "content required" }), memoriesRecorded, tasksChanged };
      const tags = args.tags as string[] | undefined;
      toolkit.setMemory(recordMemory(memory, content, "tool", tags));
      memoriesRecorded = 1;
      return { result: JSON.stringify({ ok: true, recorded: content }), memoriesRecorded, tasksChanged };
    }
    case "search_memory": {
      const query = String(args.query ?? "");
      const hits = searchMemory(memory, query);
      return {
        result: JSON.stringify(hits.map((e) => ({ content: e.content, tags: e.tags, at: e.createdAt }))),
        memoriesRecorded,
        tasksChanged,
      };
    }
    case "list_integrations": {
      const integrations = await toolkit.getIntegrations();
      return { result: JSON.stringify(integrations), memoriesRecorded, tasksChanged };
    }
    case "open_integration": {
      const id = String(args.integrationId ?? "");
      const msg = await toolkit.openIntegration(id);
      return { result: JSON.stringify({ ok: true, message: msg }), memoriesRecorded, tasksChanged };
    }
    default:
      return { result: JSON.stringify({ error: `unknown tool: ${name}` }), memoriesRecorded, tasksChanged };
  }
}

import { createTaskId } from "../taskUtils";

export function toolCallId(): string {
  return createTaskId();
}

export function summarizeTasksForAgent(tasks: Task[]): string {
  const mustDo = tasksInBucket(tasks, "now");
  const scheduled = tasksInBucket(tasks, "scheduled").filter((t) => t.date === todayString());
  return `Must do: ${mustDo.length}, Scheduled today: ${scheduled.length}, Total open: ${tasks.filter((t) => !t.done).length}`;
}

export async function runToolCalls(
  calls: AgentToolCall[],
  toolkit: AgentToolkit
): Promise<{ calls: AgentToolCall[]; memoriesRecorded: number; tasksChanged: number }> {
  let memoriesRecorded = 0;
  let tasksChanged = 0;
  const executed: AgentToolCall[] = [];

  for (const call of calls) {
    const { result, memoriesRecorded: m, tasksChanged: t } = await executeTool(
      call.name,
      call.arguments,
      toolkit
    );
    memoriesRecorded += m;
    tasksChanged += t;
    executed.push({ ...call, result });
  }

  return { calls: executed, memoriesRecorded, tasksChanged };
}
