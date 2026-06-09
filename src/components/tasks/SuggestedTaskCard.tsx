import type { SuggestedTask } from "../../types/task";
import { formatTimeRange } from "../../lib/scheduleUtils";
import { KIND_LABELS, PRIORITY_LABELS, TAG_LABELS } from "../../lib/taskUtils";

export function SuggestedTaskCard({ task }: { task: SuggestedTask }) {
  return (
    <div className="task-card" style={{ borderStyle: "dashed", borderColor: "var(--accent)" }}>
      <div className="task-title">{task.title}</div>
      <div className="task-meta">
        <span className="badge" style={{ background: "var(--bg)" }}>{task.date}</span>
        <span className="badge" style={{ background: "var(--bg)" }}>{KIND_LABELS[task.kind]}</span>
        <span className={`badge badge-${task.tag}`}>{TAG_LABELS[task.tag]}</span>
        <span className={`badge badge-${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
        {task.startTime && task.endTime && (
          <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            {formatTimeRange(task.startTime, task.endTime)}
          </span>
        )}
        {task.estimatedHours != null && (
          <span className="badge" style={{ background: "var(--bg)" }}>{task.estimatedHours}h</span>
        )}
      </div>
    </div>
  );
}
