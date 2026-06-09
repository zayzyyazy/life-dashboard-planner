import { MiniModeView } from "../MiniModeView";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { TodayPage } from "../../pages/TodayPage";
import { WeekCalendarPage } from "../../pages/WeekCalendarPage";
import { SettingsPage } from "../../pages/SettingsPage";
import { useApp } from "../../store/AppContext";

export function AppShell() {
  const { page, isMiniMode } = useApp();

  if (isMiniMode) {
    return (
      <div className="app-shell mini-shell">
        <MiniModeView />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header />
        <main className="page-content">
          {page === "today" && <TodayPage />}
          {page === "week" && <WeekCalendarPage />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
