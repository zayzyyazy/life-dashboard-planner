import type { AgentIntegration } from "../../types/agent";
import { readCourseDashboardCourses, openCourseDashboard } from "../tauriApi";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function fetchAgentIntegrations(
  shortcutStatus: string,
  courseCount: number
): Promise<AgentIntegration[]> {
  const integrations: AgentIntegration[] = [
    {
      id: "life_dashboard",
      name: "Life Dashboard",
      status: "connected",
      description: "Tasks, projects, buckets, schedule",
      capabilities: ["add_task", "update_task", "projects", "memory", "dashboard"],
    },
    {
      id: "iphone_shortcut",
      name: "iPhone Shortcut",
      status: shortcutStatus.includes("Listening") ? "connected" : "available",
      description: "Voice/text capture from your phone",
      capabilities: ["capture", "quick_updates"],
    },
  ];

  if (isTauri()) {
    const courses = await readCourseDashboardCourses();
    integrations.push({
      id: "course_dashboard",
      name: "Course Dashboard",
      status: courses.length > 0 ? "connected" : "available",
      description: `${courses.length || courseCount} courses in vault`,
      capabilities: ["read_courses", "open_app", "study_blocks"],
    });
  } else {
    integrations.push({
      id: "course_dashboard",
      name: "Course Dashboard",
      status: "unavailable",
      description: "Requires desktop app",
      capabilities: [],
    });
  }

  return integrations;
}

export async function openAgentIntegration(id: string): Promise<string> {
  if (id === "course_dashboard") {
    await openCourseDashboard();
    return "Opened Course Dashboard";
  }
  return `Integration ${id} has no open action`;
}
