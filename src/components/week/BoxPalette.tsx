import { useRef } from "react";
import { BOX_DEFINITIONS } from "../../lib/templates";
import type { BoxKind, PaletteItem } from "../../types/box";
import type { ActivityTemplate } from "../../types/template";

const BUILTIN_ORDER: BoxKind[] = ["work", "study", "cleaning", "gym", "admin"];
const DRAG_THRESHOLD = 8;

type Props = {
  savedTemplates: ActivityTemplate[];
  sessionBoxes: ActivityTemplate[];
  hiddenBuiltinKinds?: BoxKind[];
  selectedItem?: PaletteItem | null;
  onPointerDown: (item: PaletteItem, e: React.PointerEvent) => void;
  onSelect: (item: PaletteItem) => void;
  onAddSaved: () => void;
  onAddOnce: () => void;
  onRenameTemplate?: (templateId: string) => void;
  onRemoveBuiltin?: (kind: BoxKind) => void;
  onRemoveTemplate?: (templateId: string) => void;
  onRemoveSessionBox?: (templateId: string) => void;
  onRestoreBuiltinBoxes?: () => void;
};

function isSameItem(a: PaletteItem | null | undefined, b: PaletteItem): boolean {
  if (!a) return false;
  if (a.type === "builtin" && b.type === "builtin") return a.kind === b.kind;
  if (a.type === "template" && b.type === "template") return a.templateId === b.templateId;
  return false;
}

function PaletteButton({
  item,
  label,
  meta,
  color,
  selected,
  once,
  onPointerDown,
  onSelect,
  onRename,
  onRemove,
}: {
  item: PaletteItem;
  label: string;
  meta: string;
  color: string;
  selected: boolean;
  once?: boolean;
  onPointerDown: (item: PaletteItem, e: React.PointerEvent) => void;
  onSelect: (item: PaletteItem) => void;
  onRename?: () => void;
  onRemove?: () => void;
}) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;

    const onMove = (ev: PointerEvent) => {
      if (!startRef.current || draggedRef.current) return;
      const dx = ev.clientX - startRef.current.x;
      const dy = ev.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        draggedRef.current = true;
        onPointerDown(item, e);
      }
    };

    const onUp = () => {
      if (!draggedRef.current && startRef.current) {
        onSelect(item);
      }
      startRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className={`palette-box-row ${selected ? "selected" : ""}`}>
      <button
        type="button"
        className={`minimal-box ${once ? "minimal-box-once" : ""}`}
        style={{ borderLeftColor: color }}
        onPointerDown={handlePointerDown}
      >
        <span className="minimal-box-label">{label}</span>
        <span className="minimal-box-meta">{meta}</span>
      </button>
      <div className="palette-box-actions">
        {onRename && (
          <button
            type="button"
            className="btn btn-sm btn-ghost palette-icon-btn"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
          >
            ✎
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className="btn btn-sm btn-ghost palette-icon-btn"
            title="Remove from palette"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export function BoxPalette({
  savedTemplates,
  sessionBoxes,
  hiddenBuiltinKinds = [],
  selectedItem,
  onPointerDown,
  onSelect,
  onAddSaved,
  onAddOnce,
  onRenameTemplate,
  onRemoveBuiltin,
  onRemoveTemplate,
  onRemoveSessionBox,
  onRestoreBuiltinBoxes,
}: Props) {
  const visibleBuiltins = BUILTIN_ORDER.filter((k) => !hiddenBuiltinKinds.includes(k));
  const hasHidden = hiddenBuiltinKinds.length > 0;

  return (
    <aside className="minimal-palette box-palette-extended">
      <div className="minimal-palette-title">Drag or tap a box</div>
      <p className="palette-hint">Tap a box, then click a time — or drag onto the grid</p>

      {visibleBuiltins.map((kind) => {
        const box = BOX_DEFINITIONS[kind];
        const item: PaletteItem = { type: "builtin", kind };
        return (
          <PaletteButton
            key={kind}
            item={item}
            label={box.label}
            meta={
              kind === "work"
                ? "pick hours"
                : kind === "study"
                  ? "pick course"
                  : `${box.defaultHours}h`
            }
            color={box.color}
            selected={isSameItem(selectedItem, item)}
            onPointerDown={onPointerDown}
            onSelect={onSelect}
            onRemove={onRemoveBuiltin ? () => onRemoveBuiltin(kind) : undefined}
          />
        );
      })}

      {savedTemplates.length > 0 && (
        <>
          <div className="palette-section-label">Saved</div>
          {savedTemplates.map((t) => {
            const item: PaletteItem = { type: "template", templateId: t.id };
            return (
              <PaletteButton
                key={t.id}
                item={item}
                label={t.label}
                meta={`${t.defaultHours}h`}
                color={t.color}
                selected={isSameItem(selectedItem, item)}
                onPointerDown={onPointerDown}
                onSelect={onSelect}
                onRename={onRenameTemplate ? () => onRenameTemplate(t.id) : undefined}
                onRemove={onRemoveTemplate ? () => onRemoveTemplate(t.id) : undefined}
              />
            );
          })}
        </>
      )}

      {sessionBoxes.length > 0 && (
        <>
          <div className="palette-section-label">One-time</div>
          {sessionBoxes.map((t) => {
            const item: PaletteItem = { type: "template", templateId: t.id };
            return (
              <PaletteButton
                key={t.id}
                item={item}
                label={t.label}
                meta={`${t.defaultHours}h · once`}
                color={t.color}
                selected={isSameItem(selectedItem, item)}
                once
                onPointerDown={onPointerDown}
                onSelect={onSelect}
                onRemove={onRemoveSessionBox ? () => onRemoveSessionBox(t.id) : undefined}
              />
            );
          })}
        </>
      )}

      <div className="palette-add-row">
        <button type="button" className="btn btn-sm" onClick={onAddSaved}>
          + Save box
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onAddOnce}>
          + Once
        </button>
      </div>

      {hasHidden && onRestoreBuiltinBoxes && (
        <button type="button" className="btn btn-sm btn-ghost palette-restore-btn" onClick={onRestoreBuiltinBoxes}>
          Restore default boxes
        </button>
      )}
    </aside>
  );
}
