import { useEffect, useState } from "react";
import { api, type Update } from "../lib/api";

export function UpdatesPanel() {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getUpdates().then(setUpdates).finally(() => setLoading(false));
  }, []);

  return (
    <section className="panel">
      <h2>Recent Updates</h2>
      {loading ? (
        <p>Loading…</p>
      ) : updates.length === 0 ? (
        <p className="empty">No updates yet.</p>
      ) : (
        <ul className="list">
          {updates.map((u) => (
            <li key={u.id} className="list-item">
              <div className="list-item-main">
                <strong>{u.title}</strong>
                <span className="muted">
                  {u.project_name} · {u.source} · {new Date(u.created_at).toLocaleString()}
                </span>
                <p>{u.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
