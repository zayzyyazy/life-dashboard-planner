import { useEffect, useRef, useState } from "react";
import { SuggestedTaskCard } from "../components/tasks/SuggestedTaskCard";
import { useApp } from "../store/AppContext";

const QUICK = [
  "Plan Today",
  "Plan Tomorrow",
  "Plan This Week",
  "Review My Week",
  "Add Study Blocks",
  "Add Gym Sessions",
  "Balance My Schedule",
];

export function AiPlannerPage() {
  const {
    planner,
    settings,
    lastAutoSavedAt,
    lastAutoSavedCount,
    sendPlannerMessage,
    runQuickAction,
    approveSuggestions,
    rejectSuggestions,
    clearPlannerChat,
  } = useApp();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lastAutoSavedAt > 0 && settings.planner.autoSave) {
      setBanner(`${lastAutoSavedCount} task(s) added — see Week or All Tasks`);
      const t = setTimeout(() => setBanner(""), 5000);
      return () => clearTimeout(t);
    }
  }, [lastAutoSavedAt, lastAutoSavedCount, settings.planner.autoSave]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setInput("");
    await sendPlannerMessage(text);
    setLoading(false);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const autoSaveOn = settings.planner.autoSave;

  return (
    <div>
      {banner && (
        <div className="autosave-banner">{banner}</div>
      )}

      <div className="quick-actions">
        {QUICK.map((q) => (
          <button key={q} className="btn btn-sm" onClick={() => runQuickAction(q)} disabled={loading}>
            {q}
          </button>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={clearPlannerChat} disabled={loading}>
          Clear chat
        </button>
      </div>

      <div className="planner-layout">
        <div className="chat-panel">
          <div className="chat-messages">
            {planner.messages.length === 0 && (
              <p className="empty-state">
                Tell me what you need to do this week — exams, gym, work days, assignments…
                I'll ask follow-ups and suggest a schedule.
              </p>
            )}
            {planner.messages.map((m) => (
              <div key={m.id} className={`chat-bubble ${m.role}`}>
                {m.content}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <form
            className="chat-input-row"
            onSubmit={(e) => { e.preventDefault(); send(input); }}
          >
            <input
              className="input"
              placeholder="Plan my week… I have an exam Friday…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "…" : "Send"}
            </button>
          </form>
        </div>

        <aside className="suggestions-panel">
          <div className="section-title">Suggested Tasks</div>
          {autoSaveOn ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Auto-save is on. New suggestions are added to your task list immediately.
              Turn off in Settings to preview before saving.
            </p>
          ) : planner.pendingSuggestions.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Approve a plan to add tasks to your calendar.
            </p>
          ) : (
            <>
              <div className="stack">
                {planner.pendingSuggestions.map((s, i) => (
                  <SuggestedTaskCard key={`${s.title}-${i}`} task={s} />
                ))}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <button className="btn btn-primary" onClick={approveSuggestions}>
                  Approve Plan
                </button>
                <button className="btn" onClick={rejectSuggestions}>
                  Reject Plan
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
