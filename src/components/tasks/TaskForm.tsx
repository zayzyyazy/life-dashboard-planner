import { useState } from "react";
import type { Task, TaskDraft, TaskKind, TaskPriority, TaskTag } from "../../types/task";
import { todayString } from "../../lib/dateUtils";

type Props = {
  initial?: Partial<Task>;
  onSubmit: (draft: TaskDraft) => void;
  onCancel: () => void;
};

export function TaskForm({ initial, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.date ?? todayString());
  const [kind, setKind] = useState<TaskKind>(initial?.kind ?? "task");
  const [tag, setTag] = useState<TaskTag>(initial?.tag ?? "personal");
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? "medium");
  const [hours, setHours] = useState(initial?.estimatedHours?.toString() ?? "");
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!date) {
      setError("Date is required.");
      return;
    }
    onSubmit({
      title: title.trim(),
      date,
      kind,
      tag,
      priority,
      estimatedHours: hours ? Number(hours) : undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</p>}
      <div className="form-grid">
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="label">Title *</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Date *</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Type *</label>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
            <option value="event">Event (calendar block)</option>
            <option value="task">Task (to-do)</option>
            <option value="reminder">Reminder</option>
          </select>
        </div>
        <div>
          <label className="label">Tag *</label>
          <select className="select" value={tag} onChange={(e) => setTag(e.target.value as TaskTag)}>
            <option value="uni">University</option>
            <option value="work">Work</option>
            <option value="personal">Personal</option>
            <option value="health">Health</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="label">Priority *</label>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="label">Estimated hours</label>
          <input className="input" type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <div>
          <label className="label">Start time</label>
          <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <label className="label">End time</label>
          <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="label">Notes</label>
          <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save Task</button>
      </div>
    </form>
  );
}
