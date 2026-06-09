import { useEffect, useRef, useState } from "react";
import {
  buildTodayScheduleContext,
  generateTodayAssistantReply,
  summarizeToday,
} from "../../lib/todayAssistant";
import { todayString } from "../../lib/dateUtils";
import type { ChatMessage } from "../../types/planner";
import { useApp } from "../../store/AppContext";

export function TodayAiPanel() {
  const { tasks, viewWeekStart, settings, provider } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const greeting: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: summarizeToday(tasks, todayString()),
      timestamp: new Date().toISOString(),
    };
    setMessages([greeting]);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      let reply: string;
      if (settings.llmProvider === "openai" && settings.openaiApiKey) {
        const response = await provider.generateResponse(
          `${trimmed}\n\n[Schedule context — overlaps during work shifts are normal, do not flag as conflicts]\n${buildTodayScheduleContext(tasks, viewWeekStart)}`,
          { mode: "today-reminder" },
          tasks
        );
        reply = response.reply || generateTodayAssistantReply(trimmed, tasks, viewWeekStart);
      } else {
        reply = generateTodayAssistantReply(trimmed, tasks, viewWeekStart);
      }

      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className={`today-ai-panel ${expanded ? "expanded" : "collapsed"}`}>
      <div className="today-ai-header">
        <div>
          <h4 style={{ margin: 0 }}>Day assistant</h4>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Reminders for what you planned — not a planner
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "−" : "+"}
        </button>
      </div>

      {expanded && (
        <>
          <div className="today-ai-quick">
            <button type="button" className="btn btn-sm" onClick={() => send("What's today?")}>
              Today
            </button>
            <button type="button" className="btn btn-sm" onClick={() => send("What's next?")}>
              Next
            </button>
            <button type="button" className="btn btn-sm" onClick={() => send("This week")}>
              Week
            </button>
          </div>

          <div className="today-ai-messages" ref={listRef}>
            {messages.map((m) => (
              <div key={m.id} className={`today-ai-msg today-ai-msg-${m.role}`}>
                <div className="today-ai-msg-body">{m.content}</div>
              </div>
            ))}
            {loading && <div className="today-ai-msg today-ai-msg-assistant">…</div>}
          </div>

          <form
            className="today-ai-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              className="input"
              placeholder="Ask about your day…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button className="btn btn-sm btn-primary" type="submit" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </aside>
  );
}
