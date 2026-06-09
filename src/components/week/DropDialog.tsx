import { useState } from "react";
import { examCountdownLabel } from "../../lib/templates";
import type { DropPlacement } from "../../types/box";
import type { CourseDashboardCourse } from "../../types/template";

type WorkProps = {
  mode: "work";
  placement: DropPlacement;
  onConfirm: (hours: number) => void;
  onCancel: () => void;
};

type StudyProps = {
  mode: "study";
  placement: DropPlacement;
  courses: CourseDashboardCourse[];
  onConfirm: (course: CourseDashboardCourse, courseIndex: number, hours: number) => void;
  onCancel: () => void;
};

type TemplateProps = {
  mode: "template";
  placement: DropPlacement;
  label: string;
  defaultHours: number;
  onConfirm: (hours: number) => void;
  onCancel: () => void;
};

type Props = WorkProps | StudyProps | TemplateProps;

export function DropDialog(props: Props) {
  const { placement, onCancel } = props;
  const [customHours, setCustomHours] = useState(
    props.mode === "work" ? 4 : props.mode === "template" ? props.defaultHours : 2
  );
  const [selectedCourse, setSelectedCourse] = useState(0);

  const timeLabel = `${placement.date} at ${placement.startTime}`;

  if (props.mode === "template") {
    const presets = [0.5, 1, 2, props.defaultHours].filter(
      (h, i, arr) => arr.indexOf(h) === i
    );
    return (
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h4>{props.label}</h4>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{timeLabel}</p>
          <div className="drop-dialog-options">
            {presets.map((h) => (
              <button key={h} type="button" className="btn" onClick={() => props.onConfirm(h)}>
                {h}h
              </button>
            ))}
          </div>
          <label className="label" style={{ marginTop: "0.75rem" }}>
            Custom hours
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              className="input"
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={customHours}
              onChange={(e) => setCustomHours(Number(e.target.value) || 1)}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => props.onConfirm(customHours)}
            >
              Place
            </button>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (props.mode === "work") {
    return (
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h4>Work block</h4>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{timeLabel}</p>
          <div className="drop-dialog-options">
            {[4, 6, 8].map((h) => (
              <button
                key={h}
                type="button"
                className="btn"
                onClick={() => props.onConfirm(h)}
              >
                {h} hours
              </button>
            ))}
          </div>
          <label className="label" style={{ marginTop: "0.75rem" }}>
            Custom hours
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              className="input"
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={customHours}
              onChange={(e) => setCustomHours(Number(e.target.value) || 1)}
            />
            <button type="button" className="btn btn-primary" onClick={() => props.onConfirm(customHours)}>
              Place
            </button>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const courses = props.courses;
  if (!courses.length) {
    return (
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h4>No courses found</h4>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Add courses in Course Dashboard first. Vault: ~/Documents/CourseDashboard
          </p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const course = courses[selectedCourse];
  const exam = examCountdownLabel(course.examDate);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h4>Study block</h4>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{timeLabel}</p>
        <label className="label">Course</label>
        <select
          className="select"
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(Number(e.target.value))}
        >
          {courses.map((c, i) => (
            <option key={c.storageKey} value={i}>
              {c.displayName}
              {c.examDate ? ` (exam ${c.examDate})` : ""}
            </option>
          ))}
        </select>
        {exam && (
          <p style={{ fontSize: "0.8rem", color: "var(--warning, #fbbf24)", marginTop: "0.5rem" }}>
            {exam}
          </p>
        )}
        <label className="label" style={{ marginTop: "0.75rem" }}>
          Duration (hours)
        </label>
        <input
          className="input"
          type="number"
          min={0.5}
          max={6}
          step={0.5}
          value={customHours}
          onChange={(e) => setCustomHours(Number(e.target.value) || 2)}
        />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => props.onConfirm(course, selectedCourse, customHours)}
          >
            Place {customHours}h
          </button>
        </div>
      </div>
    </div>
  );
}
