import { useEffect, useState } from "react";
import type { WeekReview } from "../types/planner";
import { TAG_LABELS } from "../lib/taskUtils";
import { useApp } from "../store/AppContext";

export function ReviewPage() {
  const { tasks, provider } = useApp();
  const [review, setReview] = useState<WeekReview | null>(null);

  useEffect(() => {
    provider.reviewWeek(tasks).then(setReview);
  }, [tasks, provider]);

  if (!review) return <p className="empty-state">Loading insights…</p>;

  return (
    <div>
      <div className="scorecard-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="scorecard">
          <div className="scorecard-value">{review.completedThisWeek}</div>
          <div className="scorecard-label">Completed this week</div>
        </div>
        <div className="scorecard">
          <div className="scorecard-value">{review.completionPercent}%</div>
          <div className="scorecard-label">Completion rate</div>
        </div>
        <div className="scorecard">
          <div className="scorecard-value">{review.overdueCount}</div>
          <div className="scorecard-label">Overdue</div>
        </div>
        <div className="scorecard">
          <div className="scorecard-value" style={{ fontSize: "1rem" }}>
            {TAG_LABELS[review.mostActiveCategory as keyof typeof TAG_LABELS] ?? review.mostActiveCategory}
          </div>
          <div className="scorecard-label">Most active category</div>
        </div>
      </div>

      <div className="section-title">Weekly Health Check</div>
      <div className="scorecard-grid" style={{ marginBottom: "1.5rem" }}>
        {Object.entries(review.categoryScores).map(([cat, score]) => (
          <div key={cat} className="scorecard">
            <div className="scorecard-value">{score}%</div>
            <div className="scorecard-label">{TAG_LABELS[cat as keyof typeof TAG_LABELS] ?? cat}</div>
          </div>
        ))}
      </div>

      <div className="section-title">Insights</div>
      <ul className="insight-list">
        {review.insights.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      {review.upcomingDeadlines.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: "1.5rem" }}>Upcoming Deadlines</div>
          <ul className="insight-list">
            {review.upcomingDeadlines.map((d, i) => (
              <li key={i}>{d.date} — {d.title}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
