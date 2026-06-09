import { BOX_DEFINITIONS } from "../../lib/templates";
import type { BoxKind, PaletteItem } from "../../types/box";
import type { ActivityTemplate } from "../../types/template";

const BUILTIN_ORDER: BoxKind[] = ["work", "study", "cleaning", "gym", "admin"];

type Props = {
  date: string;
  startTime: string;
  savedTemplates: ActivityTemplate[];
  sessionBoxes: ActivityTemplate[];
  onPick: (item: PaletteItem) => void;
  onCancel: () => void;
};

export function SlotPickDialog({
  date,
  startTime,
  savedTemplates,
  sessionBoxes,
  onPick,
  onCancel,
}: Props) {
  const timeLabel = `${date} at ${startTime}`;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal slot-pick-modal" onClick={(e) => e.stopPropagation()}>
        <h4>Add block</h4>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{timeLabel}</p>
        <div className="slot-pick-grid">
          {BUILTIN_ORDER.map((kind) => {
            const box = BOX_DEFINITIONS[kind];
            return (
              <button
                key={kind}
                type="button"
                className="slot-pick-btn"
                style={{ borderLeftColor: box.color }}
                onClick={() => onPick({ type: "builtin", kind })}
              >
                {box.label}
              </button>
            );
          })}
          {savedTemplates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="slot-pick-btn"
              style={{ borderLeftColor: t.color }}
              onClick={() => onPick({ type: "template", templateId: t.id })}
            >
              {t.label}
            </button>
          ))}
          {sessionBoxes.map((t) => (
            <button
              key={t.id}
              type="button"
              className="slot-pick-btn slot-pick-btn-once"
              style={{ borderLeftColor: t.color }}
              onClick={() => onPick({ type: "template", templateId: t.id })}
            >
              {t.label} (once)
            </button>
          ))}
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
