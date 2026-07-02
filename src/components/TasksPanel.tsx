import { useEffect, useState } from "react";
import { api, type Reminder, type Task } from "../lib/api";

export function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getTasks(), api.getReminders()])
      .then(([t, r]) => {
        setTasks(t);
        setReminders(r.filter((x) => x.status === "pending"));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <section className="panel"><p>Loading…</p></section>;

  return (
    <section className="panel">
      <h2>Tasks & Reminders</h2>
      <h3>Tasks</h3>
      {tasks.length === 0 ? (
        <p className="empty">No open tasks.</p>
      ) : (
        <ul className="list">
          {tasks.map((t) => (
            <li key={t.id} className={`list-item status-${t.status}`}>
              <strong>{t.title}</strong>
              <span className="muted">
                {t.project_name ?? "No project"}
                {t.due_date && ` · due ${t.due_date.slice(0, 10)}`}
                {t.blocked_reason && ` · blocked: ${t.blocked_reason}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3>Reminders</h3>
      {reminders.length === 0 ? (
        <p className="empty">No pending reminders.</p>
      ) : (
        <ul className="list">
          {reminders.map((r) => (
            <li key={r.id} className="list-item">
              <strong>{r.message}</strong>
              <span className="muted">due {new Date(r.due_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
