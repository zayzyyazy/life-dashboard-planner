import { useMemo, useState } from "react";
import { formatHeaderDate, isOverdue, todayString } from "../lib/dateUtils";
import { exitMiniMode } from "../lib/windowControls";
import { useApp } from "../store/AppContext";

export function MiniModeView() {
  const { tasks, addTask, toggleDone, setMiniMode } = useApp();
  const [quickText, setQuickText] = useState("");
  const today = todayString();

  const { overdueCount, todayOpen, doneToday, percent } = useMemo(() => {
    const overdue = tasks.filter((t) => isOverdue(t.date, t.done));
    const open = tasks.filter((t) => t.date === today && !t.done);
    const done = tasks.filter((t) => t.date === today && t.done);
    const total = open.length + done.length;
    const pct = total ? Math.round((done.length / total) * 100) : 0;
    return { overdueCount: overdue.length, todayOpen: open, doneToday: done.length, percent: pct };
  }, [tasks, today]);

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickText.trim();
    if (!title) return;
    addTask({
      title,
      date: today,
      tag: "personal",
      priority: "medium",
      done: false,
    });
    setQuickText("");
  };

  const handleExit = async () => {
    await exitMiniMode();
    setMiniMode(false);
  };

  return (
    <div className="mini-mode">
      <div className="mini-mode-header">
        <div>
          <div className="mini-mode-date">{formatHeaderDate()}</div>
          <div className="mini-mode-stats">
            {percent}% done · {doneToday} completed
            {overdueCount > 0 && (
              <span className="mini-overdue"> · {overdueCount} overdue</span>
            )}
          </div>
        </div>
        <button className="btn btn-sm" onClick={handleExit}>
          Exit
        </button>
      </div>

      <div className="mini-progress-bar">
        <div className="mini-progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <form className="mini-quick-add" onSubmit={handleQuickAdd}>
        <input
          className="input"
          placeholder="Quick add for today…"
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
        />
      </form>

      <div className="mini-task-list">
        {todayOpen.length === 0 ? (
          <p className="mini-empty">No open tasks today. Add one above.</p>
        ) : (
          todayOpen.map((task) => (
            <div key={task.id} className="mini-task-card">
              <button
                className="mini-check"
                onClick={() => toggleDone(task.id)}
                aria-label="Mark done"
              >
                ○
              </button>
              <span className="mini-task-title">{task.title}</span>
              <button
                className="btn btn-sm btn-ghost mini-done-btn"
                onClick={() => toggleDone(task.id)}
              >
                Done
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
