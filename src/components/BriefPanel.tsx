import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "../lib/api";

export function BriefPanel() {
  const [content, setContent] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getBrief()
      .then((b) => {
        setContent(b.content);
        setDate(b.date);
      })
      .catch((err) => setMessage(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const send = async () => {
    setSending(true);
    setMessage(null);
    try {
      await api.sendBrief();
      setMessage("Daily brief emailed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Today&apos;s Brief {date && <span className="muted">— {date}</span>}</h2>
        <div className="btn-row">
          <button onClick={load} disabled={loading}>
            Refresh
          </button>
          <button onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Email Brief"}
          </button>
        </div>
      </div>
      {loading ? (
        <p>Generating brief…</p>
      ) : (
        <div className="brief-content">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
      {message && <p className={message.includes("failed") ? "error" : "success"}>{message}</p>}
    </section>
  );
}
