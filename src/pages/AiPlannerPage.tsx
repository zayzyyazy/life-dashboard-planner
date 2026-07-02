import { useEffect, useRef, useState } from "react";
import { AgentMemoryPanel } from "../components/agent/AgentMemoryPanel";
import { useApp } from "../store/AppContext";

const QUICK = [
  "What's on my plate today?",
  "Plan my day",
  "What can you access?",
  "Remember: ",
  "Move urgent stuff to must-do",
];

export function AiPlannerPage() {
  const {
    planner,
    agentMemory,
    lastAutoSavedAt,
    lastAutoSavedCount,
    sendPlannerMessage,
    runQuickAction,
    clearPlannerChat,
  } = useApp();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lastAutoSavedAt > 0) {
      setBanner(`Agent updated ${lastAutoSavedCount} task(s) — check Dashboard`);
      const t = setTimeout(() => setBanner(""), 5000);
      return () => clearTimeout(t);
    }
  }, [lastAutoSavedAt, lastAutoSavedCount]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setInput("");
    await sendPlannerMessage(text);
    setLoading(false);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="agent-page">
      {banner && <div className="autosave-banner">{banner}</div>}

      <p className="agent-intro">
        Your personal planner agent. Dump updates, plans, and random thoughts — I'll remember them,
        organize your tasks, and connect to your local apps.
      </p>

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

      <div className="planner-layout agent-layout">
        <div className="chat-panel">
          <div className="chat-messages">
            {planner.messages.length === 0 && (
              <p className="empty-state">
                Hey — I'm your planner agent. Tell me what's going on: deadlines, ideas, what you
                finished, what's stressing you out. I'll turn it into a plan.
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
              placeholder="Update me… exam Friday, finished the report, gym at 5…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "…" : "Send"}
            </button>
          </form>
        </div>

        <AgentMemoryPanel entries={agentMemory.entries.slice(0, 12)} />
      </div>
    </div>
  );
}
