import { useEffect } from "react";
import {
  buildDailyBriefing,
  markDailyUpdateShown,
  requestDailyNotification,
  shouldShowDailyUpdate,
  type DailyBriefing,
} from "../../lib/dailyBriefing";
import type { Project } from "../../types/project";
import type { Task } from "../../types/task";

type Props = {
  tasks: Task[];
  projects: Project[];
  onOpenChat?: () => void;
};

export function DailyBriefingCard({ tasks, projects, onOpenChat }: Props) {
  const briefing = buildDailyBriefing(tasks, projects);
  const isNewDay = shouldShowDailyUpdate();

  useEffect(() => {
    if (isNewDay && typeof Notification !== "undefined" && Notification.permission === "granted") {
      requestDailyNotification(briefing);
    }
  }, [isNewDay, briefing]);

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      requestDailyNotification(briefing);
    }
  };

  const dismiss = () => markDailyUpdateShown();

  return (
    <section className={`daily-briefing ${isNewDay ? "is-new-day" : ""}`}>
      <div className="daily-briefing-header">
        <div>
          <h3>{briefing.greeting}</h3>
          <p>{briefing.summary}</p>
        </div>
        {isNewDay && (
          <span className="daily-badge">Today's update</span>
        )}
      </div>

      <div className="briefing-stats">
        <Stat value={briefing.stats.mustDo} label="Must do" urgent={briefing.stats.mustDo > 0} />
        <Stat value={briefing.stats.scheduledToday} label="Today" />
        <Stat value={briefing.stats.later} label="Later" />
        <Stat value={briefing.stats.doneToday} label="Done" success />
      </div>

      {briefing.nextUp && (
        <div className="briefing-next">
          <span className="briefing-next-label">Up next</span>
          <span>{briefing.nextUp}</span>
        </div>
      )}

      <ul className="briefing-highlights">
        {briefing.highlights.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>

      <div className="briefing-actions">
        {onOpenChat && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenChat}>
            Chat to plan
          </button>
        )}
        {typeof Notification !== "undefined" && Notification.permission === "default" && (
          <button type="button" className="btn btn-sm" onClick={enableNotifications}>
            Enable daily alerts
          </button>
        )}
        {isNewDay && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={dismiss}>
            Dismiss
          </button>
        )}
      </div>
    </section>
  );
}

function Stat({ value, label, urgent, success }: { value: number; label: string; urgent?: boolean; success?: boolean }) {
  return (
    <div className={`briefing-stat ${urgent ? "urgent" : ""} ${success ? "success" : ""}`}>
      <div className="briefing-stat-value">{value}</div>
      <div className="briefing-stat-label">{label}</div>
    </div>
  );
}

export type { DailyBriefing };
