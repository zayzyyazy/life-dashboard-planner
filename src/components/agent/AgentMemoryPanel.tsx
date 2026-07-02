import type { AgentMemoryEntry } from "../../types/agent";
import { formatHeaderDate } from "../../lib/dateUtils";

type Props = {
  entries: AgentMemoryEntry[];
};

export function AgentMemoryPanel({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <aside className="agent-memory-panel">
        <h4>Agent memory</h4>
        <p className="bucket-empty">Updates you share will be remembered here.</p>
      </aside>
    );
  }

  return (
    <aside className="agent-memory-panel">
      <h4>Recent updates</h4>
      <ul className="agent-memory-list">
        {entries.map((e) => (
          <li key={e.id} className="agent-memory-item">
            <span className="agent-memory-source">{sourceLabel(e.source)}</span>
            <p>{e.content}</p>
            <time>{formatMemoryTime(e.createdAt)}</time>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function sourceLabel(source: AgentMemoryEntry["source"]): string {
  switch (source) {
    case "chat": return "Chat";
    case "shortcut": return "Phone";
    case "tool": return "Agent";
    default: return "System";
  }
}

function formatMemoryTime(iso: string): string {
  try {
    const d = new Date(iso);
    const today = formatHeaderDate(new Date());
    const entryDay = formatHeaderDate(d);
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return entryDay === today ? `Today ${time}` : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
