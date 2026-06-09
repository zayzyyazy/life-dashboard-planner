import { useState } from "react";
import { CalendarPlannerView } from "../components/week/CalendarPlannerView";
import { FullViewOverlay } from "../components/week/FullViewOverlay";
import { RenameDialog } from "../components/week/RenameDialog";
import { weekLabel } from "../lib/templates";
import { useApp } from "../store/AppContext";

export function WeekCalendarPage() {
  const {
    weekTemplates,
    viewWeekStart,
    copyLastWeek,
    saveWeekAs,
    applySavedWeek,
    goToPrevWeek,
    goToNextWeek,
    goToThisWeek,
    renameWeekTemplate,
    removeWeekTemplate,
  } = useApp();

  const [saveName, setSaveName] = useState("");
  const [fullView, setFullView] = useState(false);
  const [renameWeekId, setRenameWeekId] = useState<string | null>(null);

  const renameWeek = renameWeekId
    ? weekTemplates.find((w) => w.id === renameWeekId)
    : undefined;

  return (
    <div className="week-calendar-page">
      <div className="week-toolbar">
        <div>
          <h3 style={{ margin: 0 }}>Plan your week</h3>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            {weekLabel(viewWeekStart)} · drag, tap a box, or click a time slot
          </p>
          <div className="week-nav">
            <button className="btn btn-sm btn-ghost" type="button" onClick={goToPrevWeek}>
              ← Prev week
            </button>
            <button className="btn btn-sm btn-ghost" type="button" onClick={goToThisWeek}>
              This week
            </button>
            <button className="btn btn-sm btn-ghost" type="button" onClick={goToNextWeek}>
              Next week →
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setFullView(true)}>
              Full week view
            </button>
          </div>
        </div>
        <div className="week-toolbar-actions">
          <button className="btn btn-sm" type="button" onClick={copyLastWeek}>
            Copy last week
          </button>
          <div className="week-save-row">
            <input
              className="input"
              placeholder="Save week as…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              style={{ width: 140 }}
            />
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => {
                if (saveName.trim()) {
                  saveWeekAs(saveName);
                  setSaveName("");
                }
              }}
            >
              Save
            </button>
          </div>
          {weekTemplates.length > 0 && (
            <select
              className="select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) applySavedWeek(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Apply template…</option>
              {weekTemplates.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {weekTemplates.length > 0 && (
        <div className="saved-weeks-row">
          <span className="saved-weeks-label">Saved weeks:</span>
          {weekTemplates.map((w) => (
            <span key={w.id} className="saved-week-chip">
              {w.name}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setRenameWeekId(w.id)}
              >
                ✎
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => removeWeekTemplate(w.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <CalendarPlannerView mode="week" />

      {fullView && (
        <FullViewOverlay
          title="Week planner"
          subtitle={`${weekLabel(viewWeekStart)} · click a time slot or tap a box`}
          onClose={() => setFullView(false)}
        >
          <CalendarPlannerView mode="week" expanded />
        </FullViewOverlay>
      )}

      {renameWeek && (
        <RenameDialog
          title="Rename saved week"
          initialValue={renameWeek.name}
          onConfirm={(name) => {
            renameWeekTemplate(renameWeek.id, name);
            setRenameWeekId(null);
          }}
          onCancel={() => setRenameWeekId(null)}
        />
      )}
    </div>
  );
}
