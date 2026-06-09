import { DAY_START, SLOT_MINUTES, timeToMinutes, minutesToTime } from "./scheduleUtils";

export const GRID_ROW_PX = 28;

export function timeFromGridY(y: number): string {
  const adjusted = Math.max(0, y);
  const slotIdx = Math.round(adjusted / GRID_ROW_PX);
  const minutes = timeToMinutes(DAY_START) + slotIdx * SLOT_MINUTES;
  return minutesToTime(minutes);
}

export function snappedMinutesFromClientY(y: number): number {
  const slotIdx = Math.round(Math.max(0, y) / GRID_ROW_PX);
  return timeToMinutes(DAY_START) + slotIdx * SLOT_MINUTES;
}

export function gridYFromTime(time: string): number {
  const diff = timeToMinutes(time) - timeToMinutes(DAY_START);
  return Math.max(0, (diff / SLOT_MINUTES) * GRID_ROW_PX);
}

export function blockHeightPx(startTime: string, endTime: string): number {
  const mins = timeToMinutes(endTime) - timeToMinutes(startTime);
  return Math.max(GRID_ROW_PX, (mins / SLOT_MINUTES) * GRID_ROW_PX) - 2;
}
