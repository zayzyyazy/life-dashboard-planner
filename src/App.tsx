import { useState } from "react";
import { api } from "./lib/api";
import { ProfilePanel } from "./components/ProfilePanel";
import { BriefPanel } from "./components/BriefPanel";
import { ChatPanel } from "./components/ChatPanel";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { TasksPanel } from "./components/TasksPanel";
import { UpdatesPanel } from "./components/UpdatesPanel";
import { WatchersPanel } from "./components/WatchersPanel";

type Tab = "chat" | "brief" | "projects" | "tasks" | "profile" | "watchers" | "updates";

const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "brief", label: "Brief" },
  { id: "projects", label: "Projects" },
  { id: "tasks", label: "Tasks" },
  { id: "profile", label: "About you" },
  { id: "watchers", label: "Watchers" },
  { id: "updates", label: "Updates" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const testEmail = async () => {
    setEmailMsg(null);
    try {
      await api.sendTestEmail();
      setEmailMsg("Test email sent.");
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : "Email failed");
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Life Planner Agent</h1>
          <p className="subtitle">Personal project brain · local-first · always-on</p>
        </div>
        <button className="btn-secondary" onClick={testEmail}>
          Test Email
        </button>
      </header>
      {emailMsg && <p className="banner">{emailMsg}</p>}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === "chat" && <ChatPanel />}
        {tab === "brief" && <BriefPanel />}
        {tab === "projects" && <ProjectsPanel />}
        {tab === "tasks" && <TasksPanel />}
        {tab === "profile" && <ProfilePanel />}
        {tab === "watchers" && <WatchersPanel />}
        {tab === "updates" && <UpdatesPanel />}
      </main>

      <footer className="footer">
        <span>SQLite memory · OpenAI · No shell access by default</span>
      </footer>
    </div>
  );
}
