import type { Task } from "../../types/task";
import { formatTimeRange } from "../../lib/scheduleUtils";
import { KIND_LABELS, PRIORITY_LABELS, TAG_LABELS } from "../../lib/taskUtils";

type Props = {
  task: Task;
  onToggle?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
};

export function TaskCard({ task, onToggle, onEdit, onDelete, compact }: Props) {
  return (
    <div className={`task-card ${task.done ? "done" : ""}`}>
      <div className="task-title">{task.title}</div>
      {!compact && task.notes && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
          {task.notes}
        </p>
      )}
      <div className="task-meta">
        <span className="badge" style={{ background: "var(--bg)" }}>{task.date}</span>
        {task.startTime && task.endTime && (
          <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            {formatTimeRange(task.startTime, task.endTime)}
          </span>
        )}
        <span className="badge" style={{ background: "var(--bg)" }}>{KIND_LABELS[task.kind]}</span>
        <span className={`badge badge-${task.tag}`}>{TAG_LABELS[task.tag]}</span>
        <span className={`badge badge-${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
        {task.estimatedHours != null && (
          <span className="badge" style={{ background: "var(--bg)" }}>{task.estimatedHours}h</span>
        )}
        {task.done && <span className="badge" style={{ color: "var(--success)" }}>✓ Done</span>}
      </div>
      {(onToggle || onEdit || onDelete) && (
        <div className="task-actions">
          {onToggle && task.kind !== "event" && (
            <button className="btn btn-sm" onClick={onToggle}>
              {task.done ? "Undo" : task.kind === "reminder" ? "Dismiss" : "Complete"}
            </button>
          )}
          {onEdit && <button className="btn btn-sm" onClick={onEdit}>Edit</button>}
          {onDelete && <button className="btn btn-sm btn-danger" onClick={onDelete}>Delete</button>}
        </div>
      )}
    </div>
  );
}
