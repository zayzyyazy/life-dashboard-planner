import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseDate, shortDayName, toDateString, todayString, weekDays } from "../../lib/dateUtils";
import {
  blockHeightPx,
  gridYFromTime,
  GRID_ROW_PX,
  snappedMinutesFromClientY,
  timeFromGridY,
} from "../../lib/gridUtils";
import { openCourseDashboard } from "../../lib/tauriApi";
import {
  DAY_END,
  DAY_START,
  generateTimeSlots,
  minutesToTime,
  SLOT_MINUTES,
  timeToMinutes,
} from "../../lib/scheduleUtils";
import { BOX_DEFINITIONS, examCountdownLabel } from "../../lib/templates";
import type { BoxKind, PaletteItem } from "../../types/box";
import type { ActivityTemplate } from "../../types/template";
import type { Task } from "../../types/task";
import { BoxPalette } from "./BoxPalette";

type Props = {
  tasks: Task[];
  singleDay?: string;
  weekStart?: string;
  showPalette?: boolean;
  readOnly?: boolean;
  expanded?: boolean;
  savedTemplates?: ActivityTemplate[];
  sessionBoxes?: ActivityTemplate[];
  selectedPaletteItem?: PaletteItem | null;
  onAddSaved?: () => void;
  onAddOnce?: () => void;
  onPaletteSelect?: (item: PaletteItem) => void;
  onRenameTemplate?: (templateId: string) => void;
  hiddenBuiltinKinds?: BoxKind[];
  onRemoveBuiltin?: (kind: BoxKind) => void;
  onRemoveTemplate?: (templateId: string) => void;
  onRemoveSessionBox?: (templateId: string) => void;
  onRestoreBuiltinBoxes?: () => void;
  onSlotClick?: (date: string, startTime: string) => void;
  resolveTemplate?: (templateId: string) => ActivityTemplate | undefined;
  onEdit: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onPlacePalette: (item: PaletteItem, date: string, startTime: string) => void;
};

type BlockDrag = {
  taskId: string;
  mode: "move" | "resize";
  origStart: number;
  origEnd: number;
};

type DragPreview = {
  taskId: string;
  startTime: string;
  endTime: string;
};

type PaletteDrag = {
  item: PaletteItem;
  label: string;
  color: string;
  x: number;
  y: number;
};

function computeDragTimes(
  drag: BlockDrag,
  snapped: number
): { startTime: string; endTime: string; estimatedHours: number } {
  if (drag.mode === "move") {
    const duration = drag.origEnd - drag.origStart;
    const newStart = Math.max(
      timeToMinutes(DAY_START),
      Math.min(timeToMinutes("21:00"), snapped)
    );
    const newEnd = newStart + duration;
    return {
      startTime: minutesToTime(newStart),
      endTime: minutesToTime(newEnd),
      estimatedHours: Math.round((duration / 60) * 10) / 10,
    };
  }
  const newEnd = Math.max(drag.origStart + SLOT_MINUTES, snapped);
  return {
    startTime: minutesToTime(drag.origStart),
    endTime: minutesToTime(newEnd),
    estimatedHours: Math.round(((newEnd - drag.origStart) / 60) * 10) / 10,
  };
}

function paletteDragMeta(
  item: PaletteItem,
  resolveTemplate?: (id: string) => ActivityTemplate | undefined
): { label: string; color: string } {
  if (item.type === "builtin") {
    const box = BOX_DEFINITIONS[item.kind];
    return { label: box.label, color: box.color };
  }
  const t = resolveTemplate?.(item.templateId);
  return { label: t?.label ?? "Box", color: t?.color ?? "#a78bfa" };
}

export function WeekCalendarGrid({
  tasks,
  singleDay,
  weekStart,
  showPalette = true,
  readOnly = false,
  expanded = false,
  savedTemplates = [],
  sessionBoxes = [],
  selectedPaletteItem,
  onAddSaved,
  onAddOnce,
  onPaletteSelect,
  onRenameTemplate,
  hiddenBuiltinKinds,
  onRemoveBuiltin,
  onRemoveTemplate,
  onRemoveSessionBox,
  onRestoreBuiltinBoxes,
  onSlotClick,
  resolveTemplate,
  onEdit,
  onDelete,
  onToggle,
  onPlacePalette,
}: Props) {
  const slots = useMemo(() => generateTimeSlots(), []);
  const days = useMemo(() => {
    if (singleDay) {
      const d = new Date(singleDay + "T12:00:00");
      return [d];
    }
    const anchor = weekStart ? parseDate(weekStart) : undefined;
    return weekDays(anchor);
  }, [singleDay, weekStart]);

  const dayDates = days.map(toDateString);
  const gridRef = useRef<HTMLDivElement>(null);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDrag | null>(null);
  const [blockDrag, setBlockDrag] = useState<BlockDrag | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState(1);

  const timedTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          dayDates.includes(t.date) &&
          t.startTime &&
          t.endTime &&
          t.kind !== "reminder"
      ),
    [tasks, dayDates]
  );

  const yInDayColumn = useCallback((clientY: number, dayEl: HTMLElement): number => {
    const grid = gridRef.current;
    const rect = dayEl.getBoundingClientRect();
    const scrollTop = grid?.scrollTop ?? 0;
    return clientY - rect.top + scrollTop;
  }, []);

  const hitTest = useCallback(
    (clientX: number, clientY: number): { date: string; startTime: string } | null => {
      const grid = gridRef.current;
      if (!grid) return null;
      const dayEls = grid.querySelectorAll<HTMLElement>("[data-day-date]");
      for (const el of dayEls) {
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          const date = el.dataset.dayDate!;
          const y = yInDayColumn(clientY, el);
          const startTime = timeFromGridY(y);
          return { date, startTime };
        }
      }
      return null;
    },
    [yInDayColumn]
  );

  const onPalettePointerDown = (item: PaletteItem, e: React.PointerEvent) => {
    const meta = paletteDragMeta(item, resolveTemplate);
    setPaletteDrag({ item, ...meta, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!paletteDrag) return;

    const onMove = (e: PointerEvent) => {
      setPaletteDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : null));
    };

    const onUp = (e: PointerEvent) => {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit && paletteDrag) {
        onPlacePalette(paletteDrag.item, hit.date, hit.startTime);
      }
      setPaletteDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [paletteDrag, hitTest, onPlacePalette]);

  useEffect(() => {
    if (!blockDrag || readOnly) return;

    const task = tasks.find((t) => t.id === blockDrag.taskId);
    if (!task) return;

    const onMove = (e: PointerEvent) => {
      const dayEl = gridRef.current?.querySelector(
        `[data-day-date="${task.date}"]`
      ) as HTMLElement | null;
      if (!dayEl) return;

      const snapped = snappedMinutesFromClientY(yInDayColumn(e.clientY, dayEl));
      const times = computeDragTimes(blockDrag, snapped);
      setDragPreview({
        taskId: blockDrag.taskId,
        startTime: times.startTime,
        endTime: times.endTime,
      });
    };

    const onUp = (e: PointerEvent) => {
      const dayEl = gridRef.current?.querySelector(
        `[data-day-date="${task.date}"]`
      ) as HTMLElement | null;
      if (dayEl) {
        const snapped = snappedMinutesFromClientY(yInDayColumn(e.clientY, dayEl));
        const times = computeDragTimes(blockDrag, snapped);
        onEdit(blockDrag.taskId, {
          startTime: times.startTime,
          endTime: times.endTime,
          estimatedHours: times.estimatedHours,
        });
      }
      setBlockDrag(null);
      setDragPreview(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [blockDrag, tasks, onEdit, yInDayColumn, readOnly]);

  const todayBlocks = tasks
    .filter((t) => t.date === todayString() && t.startTime)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  const getBlockTimes = (task: Task): { startTime: string; endTime: string } => {
    if (dragPreview?.taskId === task.id) {
      return { startTime: dragPreview.startTime, endTime: dragPreview.endTime };
    }
    return { startTime: task.startTime!, endTime: task.endTime! };
  };

  const layoutClass = [
    "calendar-layout",
    singleDay ? "calendar-single-day" : "",
    readOnly ? "calendar-readonly" : "",
    !showPalette && singleDay ? "calendar-no-palette" : "",
    expanded ? "calendar-expanded" : "",
    onSlotClick && !readOnly ? "calendar-slot-clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleDayColumnClick = (dateStr: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !onSlotClick) return;
    if ((e.target as HTMLElement).closest(".calendar-block")) return;
    const startTime = timeFromGridY(yInDayColumn(e.clientY, e.currentTarget));
    onSlotClick(dateStr, startTime);
  };

  return (
    <div className={layoutClass}>
      {showPalette && !readOnly && (
        <BoxPalette
          savedTemplates={savedTemplates}
          sessionBoxes={sessionBoxes}
          selectedItem={selectedPaletteItem}
          onPointerDown={onPalettePointerDown}
          onSelect={(item) => onPaletteSelect?.(item)}
          onAddSaved={onAddSaved ?? (() => {})}
          onAddOnce={onAddOnce ?? (() => {})}
          hiddenBuiltinKinds={hiddenBuiltinKinds}
          onRenameTemplate={onRenameTemplate}
          onRemoveBuiltin={onRemoveBuiltin}
          onRemoveTemplate={onRemoveTemplate}
          onRemoveSessionBox={onRemoveSessionBox}
          onRestoreBuiltinBoxes={onRestoreBuiltinBoxes}
        />
      )}

      <div className="calendar-grid-wrap" ref={gridRef}>
        <div
          className="calendar-header"
          style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}
        >
          <div className="calendar-corner" />
          {days.map((day) => {
            const dateStr = toDateString(day);
            const isToday = dateStr === todayString();
            return (
              <div key={dateStr} className={`calendar-day-header ${isToday ? "is-today" : ""}`}>
                {shortDayName(day)}
                <span className="calendar-day-num">{day.getDate()}</span>
              </div>
            );
          })}
        </div>

        <div
          className="calendar-body"
          style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}
        >
          <div className="calendar-time-col">
            {slots.map((slot) => (
              <div key={slot} className="calendar-time-label" style={{ height: GRID_ROW_PX }}>
                {slot.endsWith(":00") ? slot : ""}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dateStr = toDateString(day);
            const dayBlocks = timedTasks.filter((t) => t.date === dateStr);
            return (
              <div
                key={dateStr}
                className="calendar-day-col"
                data-day-date={dateStr}
                style={{ height: slots.length * GRID_ROW_PX }}
                onClick={(e) => handleDayColumnClick(dateStr, e)}
              >
                {dayBlocks.map((task) => {
                  const { startTime, endTime } = getBlockTimes(task);
                  const top = gridYFromTime(startTime);
                  const height = blockHeightPx(startTime, endTime);
                  const exam = examCountdownLabel(task.examDate);
                  const isDragging = dragPreview?.taskId === task.id;
                  return (
                    <div
                      key={task.id}
                      className={`calendar-block calendar-block-${task.tag} ${task.done ? "done" : ""} ${isDragging ? "dragging" : ""} ${readOnly ? "read-only" : ""}`}
                      style={{
                        top,
                        height,
                        borderLeftColor: task.color ?? undefined,
                      }}
                      onPointerDown={
                        readOnly
                          ? undefined
                          : (e) => {
                              if ((e.target as HTMLElement).closest("button, .resize-handle"))
                                return;
                              setBlockDrag({
                                taskId: task.id,
                                mode: "move",
                                origStart: timeToMinutes(task.startTime!),
                                origEnd: timeToMinutes(task.endTime!),
                              });
                            }
                      }
                      onDoubleClick={
                        readOnly
                          ? undefined
                          : () => {
                              setEditId(task.id);
                              setEditHours(task.estimatedHours ?? 1);
                            }
                      }
                    >
                      <div className="calendar-block-title">{task.title}</div>
                      <div className="calendar-block-time">
                        {startTime}–{endTime}
                        {exam && <span className="calendar-exam"> · {exam}</span>}
                      </div>
                      <div
                        className="calendar-block-actions"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {!readOnly && task.tag === "uni" && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              openCourseDashboard();
                            }}
                          >
                            Study
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggle(task.id);
                          }}
                        >
                          {task.done ? "Undo" : "Done"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(task.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                      {!readOnly && (
                        <div
                          className="resize-handle"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setBlockDrag({
                              taskId: task.id,
                              mode: "resize",
                              origStart: timeToMinutes(task.startTime!),
                              origEnd: timeToMinutes(task.endTime!),
                            });
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {paletteDrag && (
        <div
          className="drag-ghost"
          style={{
            left: paletteDrag.x + 12,
            top: paletteDrag.y + 12,
            borderLeftColor: paletteDrag.color,
          }}
        >
          {paletteDrag.label}
        </div>
      )}

      {singleDay && todayBlocks.length > 0 && (
        <div className="today-checklist">
          <div className="section-title">Today&apos;s blocks</div>
          {todayBlocks.map((t) => (
            <label key={t.id} className="today-check-item">
              <input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)} />
              <span style={{ textDecoration: t.done ? "line-through" : "none" }}>
                {t.startTime} {t.title}
              </span>
            </label>
          ))}
        </div>
      )}

      {editId && !readOnly && (
        <div className="modal-overlay" onClick={() => setEditId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h4>Edit block</h4>
            <label className="label">Hours</label>
            <input
              className="input"
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={editHours}
              onChange={(e) => setEditHours(Number(e.target.value) || 1)}
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setEditId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const task = tasks.find((t) => t.id === editId);
                  if (task?.startTime) {
                    const start = timeToMinutes(task.startTime);
                    const end = start + Math.round(editHours * 60);
                    onEdit(editId, {
                      estimatedHours: editHours,
                      endTime: minutesToTime(Math.min(timeToMinutes(DAY_END), end)),
                    });
                  }
                  setEditId(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
