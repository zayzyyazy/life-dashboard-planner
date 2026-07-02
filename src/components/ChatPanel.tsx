import { useState } from "react";
import { api } from "../lib/api";

export function ChatPanel() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    setError(null);
    try {
      const result = await api.chat(text);
      setMessages((m) => [...m, { role: "assistant", content: result.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel chat-panel">
      <h2>Chat</h2>
      <p className="hint">
        Try: &quot;Add this to the Marie project&quot;, &quot;Remind me tomorrow to ask Marc&quot;,
        &quot;Watch this GitHub repo&quot;, &quot;Send me a daily brief every morning&quot;
      </p>
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="empty">No messages yet. Say hello or add a project update.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="chat-bubble assistant">Thinking…</div>}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="chat-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Message your agent…"
          disabled={loading}
        />
        <button onClick={send} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </section>
  );
}
