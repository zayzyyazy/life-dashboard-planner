import { useState } from "react";
import type { ActivityTemplate } from "../../types/template";
import type { TaskKind, TaskTag } from "../../types/task";
import { createTaskId } from "../../lib/taskUtils";

const TAGS: TaskTag[] = ["personal", "work", "uni", "health", "admin"];
const COLORS = ["#a78bfa", "#f472b6", "#38bdf8", "#fb923c", "#94a3b8", "#4ade80"];

type Props = {
  mode: "save" | "once";
  onConfirm: (template: ActivityTemplate) => void;
  onCancel: () => void;
};

export function AddBoxDialog({ mode, onConfirm, onCancel }: Props) {
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState(1);
  const [tag, setTag] = useState<TaskTag>("personal");
  const [color, setColor] = useState(COLORS[0]);

  const handleSubmit = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onConfirm({
      id: createTaskId(),
      label: trimmed,
      tag,
      defaultHours: hours,
      color,
      kind: "event" as TaskKind,
      isBuiltIn: false,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h4>{mode === "save" ? "Save box" : "One-time box"}</h4>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          {mode === "save"
            ? "Saved boxes stay in your palette after restart."
            : "One-time boxes disappear when you close the app."}
        </p>
        <label className="label">Name</label>
        <input
          className="input"
          placeholder="e.g. Dentist"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
        <label className="label" style={{ marginTop: "0.75rem" }}>
          Default hours
        </label>
        <input
          className="input"
          type="number"
          min={0.5}
          max={8}
          step={0.5}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value) || 1)}
        />
        <label className="label" style={{ marginTop: "0.75rem" }}>
          Category
        </label>
        <select className="select" value={tag} onChange={(e) => setTag(e.target.value as TaskTag)}>
          {TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="label" style={{ marginTop: "0.75rem" }}>
          Color
        </label>
        <div className="color-picker-row">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch ${color === c ? "selected" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>
            {mode === "save" ? "Save" : "Add once"}
          </button>
        </div>
      </div>
    </div>
  );
}
