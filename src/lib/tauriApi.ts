import type { CourseDashboardCourse } from "../types/template";

function normalizeCourse(raw: Record<string, unknown>): CourseDashboardCourse {
  const storageKey = String(raw.storageKey ?? raw.storage_key ?? "");
  const displayName = String(
    raw.displayName ?? raw.display_name ?? (storageKey.replace(/_/g, " ") || "Course")
  );
  const examDate = (raw.examDate ?? raw.exam_date) as string | undefined;
  const personalDifficulty = (raw.personalDifficulty ?? raw.personal_difficulty) as
    | number
    | undefined;
  return { storageKey, displayName, examDate, personalDifficulty };
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error("Tauri not available");
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

export async function readCourseDashboardCourses(): Promise<CourseDashboardCourse[]> {
  if (!isTauri()) return [];
  try {
    const raw = await invoke<Record<string, unknown>[]>("read_course_dashboard_courses");
    return raw.map(normalizeCourse);
  } catch {
    return [];
  }
}

export async function openCourseDashboard(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_course_dashboard");
}
