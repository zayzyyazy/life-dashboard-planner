import { useApp, type Page } from "../../store/AppContext";

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "🏠" },
  { id: "planner", label: "Agent", icon: "🤖" },
  { id: "week", label: "Schedule", icon: "📅" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const { page, navigate } = useApp();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>Life Dashboard</h1>
        <p>Plan · Track · Chat</p>
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

export function MobileNav() {
  const { page, navigate } = useApp();

  return (
    <nav className="mobile-nav">
      {NAV.map((item) => (
        <button
          key={item.id}
          className={`mobile-nav-item ${page === item.id ? "active" : ""}`}
          onClick={() => navigate(item.id)}
        >
          <span className="mobile-nav-icon">{item.icon}</span>
          <span className="mobile-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
