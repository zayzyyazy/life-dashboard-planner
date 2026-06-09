import { formatHeaderDate, getWeekNumber } from "../../lib/dateUtils";
import { enterMiniMode } from "../../lib/windowControls";
import { useApp } from "../../store/AppContext";

export function Header() {
  const { setMiniMode } = useApp();
  const now = new Date();

  const handleMiniMode = async () => {
    await enterMiniMode();
    setMiniMode(true);
  };

  return (
    <header className="header">
      <div className="header-row">
        <div>
          <h2>{formatHeaderDate(now)}</h2>
          <p>Week {getWeekNumber(now)}</p>
        </div>
        <button className="btn btn-sm mini-mode-btn" onClick={handleMiniMode} title="Compact always-on-top view">
          Mini Mode
        </button>
      </div>
    </header>
  );
}
