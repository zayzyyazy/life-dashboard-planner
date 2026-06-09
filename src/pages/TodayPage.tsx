import { useState } from "react";
import { todayString } from "../lib/dateUtils";
import { TodayAiPanel } from "../components/today/TodayAiPanel";
import { CalendarPlannerView } from "../components/week/CalendarPlannerView";
import { FullViewOverlay } from "../components/week/FullViewOverlay";
import { useApp } from "../store/AppContext";

export function TodayPage() {
  const { tasks } = useApp();
  const today = todayString();
  const [fullView, setFullView] = useState(false);

  const todayTasks = tasks.filter((t) => t.date === today);
  const done = todayTasks.filter((t) => t.done).length;

  return (
    <div className="week-calendar-page today-page">
      <div className="week-toolbar">
        <div>
          <h3 style={{ margin: 0 }}>Today</h3>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            {today} · {done}/{todayTasks.length} blocks done
          </p>
          <button
            className="btn btn-sm"
            type="button"
            style={{ marginTop: "0.5rem" }}
            onClick={() => setFullView(true)}
          >
            Full day view
          </button>
        </div>
      </div>

      <div className="today-layout">
        <TodayAiPanel />
        <div className="today-calendar-wrap">
          <CalendarPlannerView mode="day" singleDay={today} readOnly />
        </div>
      </div>

      {fullView && (
        <FullViewOverlay
          title="Today"
          subtitle={`${today} · tap a box or click a time slot to add blocks`}
          onClose={() => setFullView(false)}
        >
          <CalendarPlannerView mode="day" singleDay={today} expanded />
        </FullViewOverlay>
      )}
    </div>
  );
}
