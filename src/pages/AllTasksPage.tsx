import { useMemo, useState } from "react";
import { TaskCard } from "../components/tasks/TaskCard";
import { TaskForm } from "../components/tasks/TaskForm";
import type { Task, TaskKind, TaskPriority, TaskTag } from "../types/task";
import { sortByDate, sortByPriority } from "../lib/taskUtils";
import { useApp } from "../store/AppContext";

export function AllTasksPage() {
  const { tasks, addTask, editTask, removeTask, toggleDone } = useApp();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<TaskKind | "">("");
  const [tag, setTag] = useState<TaskTag | "">("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [status, setStatus] = useState<"all" | "open" | "done">("all");
  const [sort, setSort] = useState<"date" | "priority" | "created">("date");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q));
    }
    if (kind) list = list.filter((t) => t.kind === kind);
    if (tag) list = list.filter((t) => t.tag === tag);
    if (priority) list = list.filter((t) => t.priority === priority);
    if (status === "open") list = list.filter((t) => !t.done);
    if (status === "done") list = list.filter((t) => t.done);
    if (sort === "date") {
      list.sort((a, b) => {
        const d = sortByDate(a, b);
        if (d !== 0) return d;
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
        if (a.startTime) return -1;
        if (b.startTime) return 1;
        return 0;
      });
    }
    if (sort === "priority") list.sort(sortByPriority);
    if (sort === "created") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [tasks, search, kind, tag, priority, status, sort]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h3>All Tasks ({filtered.length})</h3>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + New Task
        </button>
      </div>

      <div className="filters-row">
        <div>
          <label className="label">Search</label>
          <input className="input" placeholder="Title or notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as TaskKind | "")}>
            <option value="">All</option>
            <option value="event">Event</option>
            <option value="task">Task</option>
            <option value="reminder">Reminder</option>
          </select>
        </div>
        <div>
          <label className="label">Tag</label>
          <select className="select" value={tag} onChange={(e) => setTag(e.target.value as TaskTag | "")}>
            <option value="">All</option>
            <option value="uni">University</option>
            <option value="work">Work</option>
            <option value="personal">Personal</option>
            <option value="health">Health</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority | "")}>
            <option value="">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div>
          <label className="label">Sort</label>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="date">Due date</option>
            <option value="priority">Priority</option>
            <option value="created">Created</option>
          </select>
        </div>
      </div>

      <div className="stack">
        {filtered.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            onToggle={() => toggleDone(t.id)}
            onEdit={() => { setEditing(t); setShowForm(true); }}
            onDelete={() => removeTask(t.id)}
          />
        ))}
        {filtered.length === 0 && <p className="empty-state">No tasks match your filters.</p>}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "1rem" }}>{editing ? "Edit Task" : "Create Task"}</h3>
            <TaskForm
              initial={editing ?? undefined}
              onCancel={() => setShowForm(false)}
              onSubmit={(draft) => {
                if (editing) {
                  editTask(editing.id, draft);
                } else {
                  addTask(draft);
                }
                setShowForm(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
