import { useEffect, useState } from "react";
import { api, type TelegramStatus } from "../lib/api";

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-row">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function TelegramStatusPanel() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getTelegramStatus()
      .then(setStatus)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading Telegram status…</p>;
  if (!status) return null;

  return (
    <div className="telegram-status">
      <h3>Telegram</h3>
      <StatusRow label="Enabled" value={status.enabled ? "Yes" : "No"} />
      <StatusRow label="Bot token configured" value={status.token_configured ? "Yes" : "No"} />
      <StatusRow
        label="Allowed user IDs configured"
        value={status.allowed_users_configured ? "Yes" : "No"}
      />
      <StatusRow label="Voice enabled" value={status.voice_enabled ? "Yes" : "No"} />
      <StatusRow
        label="Last Telegram message"
        value={
          status.last_message_at
            ? new Date(status.last_message_at).toLocaleString()
            : "None yet"
        }
      />
    </div>
  );
}
