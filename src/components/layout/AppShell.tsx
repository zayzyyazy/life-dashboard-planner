import { MiniModeView } from "../MiniModeView";
import { Header } from "./Header";
import { MobileNav, Sidebar } from "./Sidebar";
import { AiPlannerPage } from "../../pages/AiPlannerPage";
import { DashboardPage } from "../../pages/DashboardPage";
import { WeekCalendarPage } from "../../pages/WeekCalendarPage";
import { SettingsPage } from "../../pages/SettingsPage";
import { useApp } from "../../store/AppContext";

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Your command center" },
  planner: { title: "Your Agent", subtitle: "Give updates — I'll plan, remember, and act" },
  week: { title: "Schedule", subtitle: "Week calendar view" },
  settings: { title: "Settings", subtitle: "Preferences & integrations" },
};

export function AppShell() {
  const { page, isMiniMode } = useApp();

  if (isMiniMode) {
    return (
      <div className="app-shell mini-shell">
        <MiniModeView />
      </div>
    );
  }

  const pageMeta = PAGE_TITLES[page] ?? PAGE_TITLES.dashboard;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header title={pageMeta.title} subtitle={pageMeta.subtitle} />
        <main className="page-content">
          {page === "dashboard" && <DashboardPage />}
          {page === "planner" && <AiPlannerPage />}
          {page === "week" && <WeekCalendarPage />}
          {page === "settings" && <SettingsPage />}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
