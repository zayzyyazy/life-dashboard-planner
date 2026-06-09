import { useState } from "react";
import { AddBoxDialog } from "./AddBoxDialog";
import { DropDialog } from "./DropDialog";
import { RenameDialog } from "./RenameDialog";
import { SlotPickDialog } from "./SlotPickDialog";
import { WeekCalendarGrid } from "./WeekCalendarGrid";
import {
  BOX_DEFINITIONS,
  draftFromBox,
  draftFromTemplate,
} from "../../lib/templates";
import type { DropPlacement, PaletteItem, PendingDrop } from "../../types/box";
import type { CourseDashboardCourse } from "../../types/template";
import { useApp } from "../../store/AppContext";

type Props = {
  mode: "week" | "day";
  singleDay?: string;
  readOnly?: boolean;
  expanded?: boolean;
};

export function CalendarPlannerView({ mode, singleDay, readOnly = false, expanded = false }: Props) {
  const {
    tasks,
    courses,
    templates,
    sessionBoxes,
    viewWeekStart,
    editTask,
    removeTask,
    toggleDone,
    addTask,
    upsertTemplate,
    addSessionBox,
    findTemplate,
    renameTemplate,
    removeTemplate,
    hiddenBuiltinBoxes,
    hideBuiltinBox,
    restoreBuiltinBoxes,
    removeSessionBox,
  } = useApp();

  const [pendingDrop, setPendingDrop] = useState<PendingDrop>(null);
  const [addBoxMode, setAddBoxMode] = useState<"save" | "once" | null>(null);
  const [selectedPaletteItem, setSelectedPaletteItem] = useState<PaletteItem | null>(null);
  const [slotPick, setSlotPick] = useState<DropPlacement | null>(null);
  const [renameTemplateId, setRenameTemplateId] = useState<string | null>(null);

  const savedTemplates = templates.filter((t) => !t.isBuiltIn);

  const placePaletteItem = (item: PaletteItem, date: string, startTime: string) => {
    if (item.type === "builtin") {
      const placement: DropPlacement = { date, startTime };
      if (item.kind === "work" || item.kind === "study") {
        setPendingDrop(
          item.kind === "work"
            ? { type: "work", placement }
            : { type: "study", placement }
        );
        return;
      }
      const box = BOX_DEFINITIONS[item.kind];
      addTask(draftFromBox(item.kind, date, startTime, box.defaultHours));
      return;
    }

    const template = findTemplate(item.templateId);
    if (!template) return;
    setPendingDrop({
      type: "template",
      placement: { date, startTime },
      templateId: item.templateId,
    });
  };

  const handlePlacePalette = (item: PaletteItem, date: string, startTime: string) => {
    placePaletteItem(item, date, startTime);
    setSelectedPaletteItem(null);
  };

  const handleSlotClick = (date: string, startTime: string) => {
    if (selectedPaletteItem) {
      placePaletteItem(selectedPaletteItem, date, startTime);
      setSelectedPaletteItem(null);
      return;
    }
    setSlotPick({ date, startTime });
  };

  const confirmWork = (hours: number) => {
    if (!pendingDrop || pendingDrop.type !== "work") return;
    const { date, startTime } = pendingDrop.placement;
    addTask(draftFromBox("work", date, startTime, hours));
    setPendingDrop(null);
  };

  const confirmStudy = (course: CourseDashboardCourse, courseIndex: number, hours: number) => {
    if (!pendingDrop || pendingDrop.type !== "study") return;
    const { date, startTime } = pendingDrop.placement;
    addTask(draftFromBox("study", date, startTime, hours, course, courseIndex));
    setPendingDrop(null);
  };

  const confirmTemplate = (hours: number) => {
    if (!pendingDrop || pendingDrop.type !== "template") return;
    const template = findTemplate(pendingDrop.templateId);
    if (!template) return;
    const { date, startTime } = pendingDrop.placement;
    addTask(draftFromTemplate(template, date, startTime, hours));
    setPendingDrop(null);
  };

  const pendingTemplate =
    pendingDrop?.type === "template" ? findTemplate(pendingDrop.templateId) : undefined;

  return (
    <>
      {selectedPaletteItem && !readOnly && (
        <p className="place-mode-hint">
          {paletteItemLabel(selectedPaletteItem, findTemplate)} selected — click a time slot to place
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setSelectedPaletteItem(null)}
          >
            Cancel
          </button>
        </p>
      )}

      <WeekCalendarGrid
        tasks={tasks}
        singleDay={mode === "day" ? singleDay : undefined}
        weekStart={mode === "week" ? viewWeekStart : undefined}
        showPalette={!readOnly}
        readOnly={readOnly}
        expanded={expanded}
        savedTemplates={savedTemplates}
        sessionBoxes={sessionBoxes}
        selectedPaletteItem={selectedPaletteItem}
        resolveTemplate={findTemplate}
        onAddSaved={() => setAddBoxMode("save")}
        onAddOnce={() => setAddBoxMode("once")}
        onPaletteSelect={setSelectedPaletteItem}
        hiddenBuiltinKinds={hiddenBuiltinBoxes}
        onRenameTemplate={setRenameTemplateId}
        onRemoveBuiltin={hideBuiltinBox}
        onRemoveTemplate={removeTemplate}
        onRemoveSessionBox={removeSessionBox}
        onRestoreBuiltinBoxes={restoreBuiltinBoxes}
        onSlotClick={readOnly ? undefined : handleSlotClick}
        onEdit={editTask}
        onDelete={removeTask}
        onToggle={toggleDone}
        onPlacePalette={handlePlacePalette}
      />

      {slotPick && (
        <SlotPickDialog
          date={slotPick.date}
          startTime={slotPick.startTime}
          savedTemplates={savedTemplates}
          sessionBoxes={sessionBoxes}
          onPick={(item) => {
            placePaletteItem(item, slotPick.date, slotPick.startTime);
            setSlotPick(null);
          }}
          onCancel={() => setSlotPick(null)}
        />
      )}

      {pendingDrop?.type === "work" && (
        <DropDialog
          mode="work"
          placement={pendingDrop.placement}
          onConfirm={confirmWork}
          onCancel={() => setPendingDrop(null)}
        />
      )}

      {pendingDrop?.type === "study" && (
        <DropDialog
          mode="study"
          placement={pendingDrop.placement}
          courses={courses}
          onConfirm={(course, idx, hours) => confirmStudy(course, idx, hours)}
          onCancel={() => setPendingDrop(null)}
        />
      )}

      {pendingDrop?.type === "template" && pendingTemplate && (
        <DropDialog
          mode="template"
          placement={pendingDrop.placement}
          label={pendingTemplate.label}
          defaultHours={pendingTemplate.defaultHours}
          onConfirm={confirmTemplate}
          onCancel={() => setPendingDrop(null)}
        />
      )}

      {addBoxMode && (
        <AddBoxDialog
          mode={addBoxMode}
          onCancel={() => setAddBoxMode(null)}
          onConfirm={(template) => {
            if (addBoxMode === "save") {
              upsertTemplate(template);
            } else {
              addSessionBox(template);
            }
            setAddBoxMode(null);
          }}
        />
      )}

      {renameTemplateId && (
        <RenameDialog
          title="Rename saved box"
          initialValue={findTemplate(renameTemplateId)?.label ?? ""}
          onConfirm={(label) => {
            renameTemplate(renameTemplateId, label);
            setRenameTemplateId(null);
          }}
          onCancel={() => setRenameTemplateId(null)}
        />
      )}
    </>
  );
}

function paletteItemLabel(
  item: PaletteItem,
  findTemplate: (id: string) => { label: string } | undefined
): string {
  if (item.type === "builtin") return BOX_DEFINITIONS[item.kind].label;
  return findTemplate(item.templateId)?.label ?? "Box";
}
