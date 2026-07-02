import { useState } from "react";
import type { TaskBucket } from "../../types/task";
import { BUCKET_DESCRIPTIONS, BUCKET_LABELS } from "../../lib/bucketUtils";
import type { Task } from "../../types/task";
import { DashboardTaskRow } from "./DashboardTaskRow";

type Props = {
  bucket: TaskBucket;
  tasks: Task[];
  projectNames: Record<string, string>;
  onToggle: (id: string) => void;
  onMove: (id: string, bucket: TaskBucket) => void;
  onDelete: (id: string) => void;
  onAdd?: (title: string) => void;
  showDate?: boolean;
  collapsed?: boolean;
};

export function BucketSection({
  bucket,
  tasks,
  projectNames,
  onToggle,
  onMove,
  onDelete,
  onAdd,
  showDate,
  collapsed: defaultCollapsed,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !onAdd) return;
    onAdd(newTitle.trim());
    setNewTitle("");
    setAdding(false);
  };

  return (
    <section className={`bucket-section bucket-${bucket}`}>
      <button
        type="button"
        className="bucket-section-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div>
          <h3>{BUCKET_LABELS[bucket]}</h3>
          <p>{BUCKET_DESCRIPTIONS[bucket]}</p>
        </div>
        <span className="bucket-count">{tasks.length}</span>
      </button>

      {!collapsed && (
        <div className="bucket-section-body">
          {tasks.length === 0 ? (
            <p className="bucket-empty">Nothing here yet</p>
          ) : (
            <div className="bucket-task-list">
              {tasks.map((task) => (
                <DashboardTaskRow
                  key={task.id}
                  task={task}
                  projectName={task.projectId ? projectNames[task.projectId] : undefined}
                  onToggle={() => onToggle(task.id)}
                  onMove={(b) => onMove(task.id, b)}
                  onDelete={() => onDelete(task.id)}
                  showDate={showDate}
                />
              ))}
            </div>
          )}
          {onAdd && (
            adding ? (
              <form className="bucket-quick-add" onSubmit={submitAdd}>
                <input
                  className="input"
                  placeholder="Add item…"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn btn-primary btn-sm">Add</button>
                <button type="button" className="btn btn-sm" onClick={() => setAdding(false)}>Cancel</button>
              </form>
            ) : (
              <button type="button" className="bucket-add-btn" onClick={() => setAdding(true)}>
                + Add to {BUCKET_LABELS[bucket]}
              </button>
            )
          )}
        </div>
      )}
    </section>
  );
}
