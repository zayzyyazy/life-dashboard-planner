import { parseCaptureText } from "../captureParser";
import { todayString, parseDayMentionFromText } from "../dateUtils";
import { inferPriority } from "../taskUtils";
import type { AgentTurn } from "../../types/agent";
import type { AgentToolkit } from "./tools";
import { toolCallId } from "./tools";

export async function mockAgentTurn(userMessage: string, toolkit: AgentToolkit): Promise<AgentTurn> {
  const text = userMessage.trim();
  const lower = text.toLowerCase();
  const tasks = toolkit.getTasks();

  // Remember / note patterns
  if (/^(remember|note|keep in mind|don't forget that|fyi)/i.test(lower)) {
    const content = text.replace(/^(remember|note|keep in mind|don't forget that|fyi)[:\s]*/i, "").trim();
    return {
      reply: `Got it — I'll remember that.`,
      toolCalls: [{ id: toolCallId(), name: "record_memory", arguments: { content, tags: ["user-note"] } }],
      memoriesRecorded: 0,
      tasksChanged: 0,
    };
  }

  // What's on my plate / dashboard
  if (/what('s| is) (on my plate|today|my day|the plan)|dashboard|summary|status/i.test(lower)) {
    return {
      reply: "Let me pull up your dashboard.",
      toolCalls: [{ id: toolCallId(), name: "get_dashboard", arguments: {} }],
      memoriesRecorded: 0,
      tasksChanged: 0,
    };
  }

  // List must dos
  if (/must.?do|urgent|priority|what do i need/i.test(lower)) {
    return {
      reply: "Here are your must-do items:",
      toolCalls: [{ id: toolCallId(), name: "list_tasks", arguments: { bucket: "now", limit: 15 } }],
      memoriesRecorded: 0,
      tasksChanged: 0,
    };
  }

  // Mark done
  const doneMatch = text.match(/(?:done|finished|completed)\s+(.+)/i);
  if (doneMatch) {
    const needle = doneMatch[1].toLowerCase();
    const match = tasks.find((t) => !t.done && t.title.toLowerCase().includes(needle));
    if (match) {
      return {
        reply: `Marked "${match.title}" as done.`,
        toolCalls: [{ id: toolCallId(), name: "update_task", arguments: { taskId: match.id, done: true } }],
        memoriesRecorded: 0,
        tasksChanged: 0,
      };
    }
  }

  // Move to now
  const nowMatch = text.match(/(?:move|add)\s+(.+?)\s+to\s+(?:must.?do|now|urgent)/i);
  if (nowMatch) {
    const needle = nowMatch[1].toLowerCase();
    const match = tasks.find((t) => !t.done && t.title.toLowerCase().includes(needle));
    if (match) {
      return {
        reply: `Moved "${match.title}" to Must Do Now.`,
        toolCalls: [{ id: toolCallId(), name: "update_task", arguments: { taskId: match.id, bucket: "now", priority: "high" } }],
        memoriesRecorded: 0,
        tasksChanged: 0,
      };
    }
  }

  // Create project
  const projectMatch = text.match(/(?:new project|create project|start project)[:\s]+(.+)/i);
  if (projectMatch) {
    const name = projectMatch[1].trim();
    return {
      reply: `Created project "${name}".`,
      toolCalls: [{ id: toolCallId(), name: "add_project", arguments: { name } }],
      memoriesRecorded: 0,
      tasksChanged: 0,
    };
  }

  // Integrations
  if (/what (apps|integrations)|what can you access|connected/i.test(lower)) {
    return {
      reply: "Here are the local integrations I can access:",
      toolCalls: [{ id: toolCallId(), name: "list_integrations", arguments: {} }],
      memoriesRecorded: 0,
      tasksChanged: 0,
    };
  }

  // Plan today vague
  if (/plan\s+(my\s+)?(today|day|week)/i.test(lower) && text.split(/\s+/).length < 12) {
    return {
      reply: "What do you need to get done? List your tasks, meetings, and any fixed times — I'll organize them into must-dos, schedule, and later.",
      toolCalls: [],
      memoriesRecorded: 0,
      tasksChanged: 0,
    };
  }

  // Capture-style multi-item or single task
  const parsed = parseCaptureText(text);
  if (parsed.length > 0) {
    const toolCalls = parsed.map((s) => ({
      id: toolCallId(),
      name: "add_task" as const,
      arguments: {
        title: s.title,
        bucket: s.startTime ? "scheduled" : s.priority === "high" ? "now" : "later",
        date: s.date,
        priority: s.priority,
        startTime: s.startTime,
        endTime: s.endTime,
        notes: s.notes,
      },
    }));
    return {
      reply: `Added ${parsed.length} item${parsed.length === 1 ? "" : "s"} to your plan.`,
      toolCalls,
      memoriesRecorded: 0,
      tasksChanged: 0,
    };
  }

  // Single line add
  if (text.length > 2 && text.length < 200 && !text.includes("?")) {
    const date = parseDayMentionFromText(text) ?? todayString();
    return {
      reply: `Added "${text}" to your plan.`,
      toolCalls: [
        {
          id: toolCallId(),
          name: "add_task",
          arguments: {
            title: text.slice(0, 120),
            bucket: inferPriority(text) === "high" ? "now" : "later",
            date,
            priority: inferPriority(text),
          },
        },
      ],
      memoriesRecorded: 0,
      tasksChanged: 0,
    };
  }

  // Default: record as memory + offer help
  return {
    reply: "I saved that as context. Want me to turn it into tasks, schedule something, or add it to a project?",
    toolCalls: [{ id: toolCallId(), name: "record_memory", arguments: { content: text, tags: ["update"] } }],
    memoriesRecorded: 0,
    tasksChanged: 0,
  };
}
