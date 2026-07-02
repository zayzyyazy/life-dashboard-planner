import type { Task, TaskBucket } from "../../types/task";
import { BUCKET_LABELS } from "../../lib/bucketUtils";
import { formatTimeRange } from "../../lib/scheduleUtils";
import { TAG_LABELS } from "../../lib/taskUtils";

type Props = {
  task: Task;
  projectName?: string;
  onToggle?: () => void;
  onMove?: (bucket: TaskBucket) => void;
  onDelete?: () => void;
  showDate?: boolean;
};

export function DashboardTaskRow({ task, projectName, onToggle, onMove, onDelete, showDate }: Props) {
  return (
    <div className={`dashboard-task-row ${task.done ? "done" : ""}`}>
      <button
        type="button"
        className={`task-check ${task.done ? "checked" : ""}`}
        onClick={onToggle}
        aria-label={task.done ? "Mark incomplete" : "Mark complete"}
      >
        {task.done ? "✓" : ""}
      </button>
      <div className="dashboard-task-body">
        <div className="dashboard-task-title">{task.title}</div>
        <div className="dashboard-task-meta">
          {showDate && <span>{task.date}</span>}
          {task.startTime && task.endTime && (
            <span>{formatTimeRange(task.startTime, task.endTime)}</span>
          )}
          <span className={`badge badge-${task.tag}`}>{TAG_LABELS[task.tag]}</span>
          {projectName && <span className="project-pill">{projectName}</span>}
        </div>
      </div>
      <div className="dashboard-task-actions">
        {onMove && task.bucket !== "now" && (
          <button type="button" className="btn btn-xs" onClick={() => onMove("now")} title="Move to Must Do Now">
            Now
          </button>
        )}
        {onMove && task.bucket !== "later" && task.bucket !== "now" && (
          <button type="button" className="btn btn-xs" onClick={() => onMove("later")} title="Move to Later">
            Later
          </button>
        )}
        {onMove && task.bucket !== "someday" && (
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => onMove("someday")} title="Move to Someday">
            {BUCKET_LABELS.someday}
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn btn-xs btn-danger" onClick={onDelete} aria-label="Delete">
            ×
          </button>
        )}
      </div>
    </div>
  );
}
