import { useApp, type Page } from "../../store/AppContext";

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "week", label: "Plan", icon: "📅" },
  { id: "today", label: "Today", icon: "☀️" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const { page, navigate } = useApp();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>Life Dashboard</h1>
        <p>Week Planner</p>
      </div>
      <nav>
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => navigate(item.id)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
