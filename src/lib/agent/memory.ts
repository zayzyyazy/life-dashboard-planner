import type { AgentMemoryEntry, AgentMemorySource, AgentMemoryState } from "../../types/agent";
import { createTaskId, nowIso } from "../taskUtils";

const KEY = "ldp_agent_memory";
const MAX_ENTRIES = 500;

function read(): AgentMemoryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { entries: [] };
    return JSON.parse(raw) as AgentMemoryState;
  } catch {
    return { entries: [] };
  }
}

function write(state: AgentMemoryState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function loadAgentMemory(): AgentMemoryState {
  return read();
}

export function saveAgentMemory(state: AgentMemoryState): void {
  write(state);
}

export function recordMemory(
  state: AgentMemoryState,
  content: string,
  source: AgentMemorySource,
  tags?: string[]
): AgentMemoryState {
  const entry: AgentMemoryEntry = {
    id: createTaskId(),
    content: content.trim(),
    source,
    tags,
    createdAt: nowIso(),
  };
  const entries = [entry, ...state.entries].slice(0, MAX_ENTRIES);
  const next = { entries };
  write(next);
  return next;
}

export function searchMemory(state: AgentMemoryState, query: string, limit = 8): AgentMemoryEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return state.entries.slice(0, limit);
  return state.entries
    .filter(
      (e) =>
        e.content.toLowerCase().includes(q) ||
        e.tags?.some((t) => t.toLowerCase().includes(q))
    )
    .slice(0, limit);
}

export function recentMemory(state: AgentMemoryState, limit = 12): AgentMemoryEntry[] {
  return state.entries.slice(0, limit);
}
