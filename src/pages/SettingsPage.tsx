import { useEffect, useState } from "react";
import { exportAllData, generateToken, importAllData } from "../lib/storage";
import {
  buildCaptureUrl,
  shortcutApi,
  shortcutInstructions,
} from "../lib/shortcutApi";
import type { AppSettings } from "../types/settings";
import { useApp } from "../store/AppContext";
import { RenameDialog } from "../components/week/RenameDialog";

export function SettingsPage() {
  const {
    settings,
    updateSettings,
    shortcutStatus,
    processShortcutCapture,
    templates,
    courses,
    removeTemplate,
    renameTemplate,
    syncCourseBoxes,
    reloadFromStorage,
  } = useApp();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [localIp, setLocalIp] = useState("127.0.0.1");
  const [message, setMessage] = useState("");
  const [testText, setTestText] = useState("Study biology 2h\nGym tomorrow\nPay insurance Friday");
  const [renameTemplateId, setRenameTemplateId] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    shortcutApi.getLocalIp().then(setLocalIp).catch(() => setLocalIp("127.0.0.1"));
  }, []);

  const save = async () => {
    await updateSettings(draft);
    setMessage("Settings saved.");
  };

  const regenerateToken = () => {
    setDraft({ ...draft, shortcut: { ...draft.shortcut, token: generateToken() } });
  };

  const testCapture = async () => {
    try {
      const res = await shortcutApi.testCapture(testText);
      if (res.ok) {
        await processShortcutCapture(testText);
        setMessage(res.message);
      } else {
        setMessage(res.message);
      }
    } catch {
      await processShortcutCapture(testText);
      setMessage("Processed capture locally (browser test mode).");
    }
  };

  const lanUrl = buildCaptureUrl(draft.shortcut.port, draft.shortcut.token, localIp);
  const localUrl = buildCaptureUrl(draft.shortcut.port, draft.shortcut.token);

  return (
    <div style={{ maxWidth: 720 }}>
      <h3 style={{ marginBottom: "0.5rem" }}>Settings</h3>
      <p style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }}>
        iPhone Shortcut capture and saved planning boxes.
      </p>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.75rem" }}>
        Build: {__APP_BUILD_STAMP__} — if this date is old, run deploy script to refresh the Desktop app.
      </p>

      <div className="card">
        <h4 style={{ marginBottom: "0.75rem" }}>📱 iPhone Shortcut Capture</h4>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
          Pull text from your iPhone Shortcut → parses days and times → saves blocks automatically.
          Keep Life Dashboard open on your Mac while using the shortcut.
        </p>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <input
            type="checkbox"
            checked={draft.shortcut.enabled}
            onChange={(e) =>
              setDraft({ ...draft, shortcut: { ...draft.shortcut, enabled: e.target.checked } })
            }
          />
          Enable shortcut server
        </label>

        <div className="form-grid">
          <div>
            <label className="label">Port</label>
            <input
              className="input"
              type="number"
              value={draft.shortcut.port}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  shortcut: { ...draft.shortcut, port: Number(e.target.value) || 7823 },
                })
              }
            />
          </div>
          <div>
            <label className="label">Auth token</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input className="input" readOnly value={draft.shortcut.token} />
              <button className="btn" type="button" onClick={regenerateToken}>Regenerate</button>
            </div>
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "1rem 0" }}>
          <input
            type="checkbox"
            checked={draft.shortcut.autoSave}
            onChange={(e) =>
              setDraft({ ...draft, shortcut: { ...draft.shortcut, autoSave: e.target.checked } })
            }
          />
          Auto-save tasks after parse (skip approval step)
        </label>

        <p style={{ fontSize: "0.8rem", color: shortcutStatus.includes("disabled") ? "var(--text-muted)" : "var(--success)" }}>
          Status: {shortcutStatus || "Not started"}
        </p>

        <div style={{ marginTop: "1rem" }}>
          <label className="label">Capture URL (same Mac)</label>
          <div className="code-block">{localUrl}</div>
        </div>

        {localIp !== "127.0.0.1" && (
          <div style={{ marginTop: "0.75rem" }}>
            <label className="label">Capture URL (iPhone on same Wi‑Fi — use this in Shortcuts)</label>
            <div className="code-block">{lanUrl}</div>
          </div>
        )}

        <div className="code-block" style={{ marginTop: "1rem" }}>
          {shortcutInstructions(draft.shortcut.port, draft.shortcut.token, localIp !== "127.0.0.1" ? localIp : "127.0.0.1")}
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label className="label">Test capture text</label>
          <textarea
            className="textarea"
            rows={3}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
          />
          <button className="btn btn-primary" style={{ marginTop: "0.5rem" }} onClick={testCapture}>
            Test capture
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h4 style={{ marginBottom: "0.75rem" }}>Day assistant (Today page)</h4>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          Reminds you what you planned — works offline with rules, or use OpenAI for natural chat.
        </p>
        <div className="form-grid">
          <div>
            <label className="label">Provider</label>
            <select
              className="select"
              value={draft.llmProvider}
              onChange={(e) =>
                setDraft({ ...draft, llmProvider: e.target.value as AppSettings["llmProvider"] })
              }
            >
              <option value="mock">Offline (built-in)</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
        </div>
        {draft.llmProvider === "openai" && (
          <div className="form-grid" style={{ marginTop: "0.75rem" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="label">OpenAI API Key</label>
              <input
                className="input"
                type="password"
                value={draft.openaiApiKey}
                onChange={(e) => setDraft({ ...draft, openaiApiKey: e.target.value })}
                placeholder="sk-…"
              />
            </div>
            <div>
              <label className="label">Model</label>
              <input
                className="input"
                value={draft.openaiModel}
                onChange={(e) => setDraft({ ...draft, openaiModel: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h4 style={{ marginBottom: "0.75rem" }}>Planning boxes</h4>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          Remove boxes with × on the Plan palette. Use + Save box to add your own. Restore defaults if you hide built-ins.
        </p>
        <ul style={{ listStyle: "none", marginBottom: "0.75rem", padding: 0 }}>
          {templates.map((t) => (
            <li key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.35rem 0", fontSize: "0.85rem" }}>
              <span>{t.label}</span>
              {!t.isBuiltIn && (
                <span style={{ display: "flex", gap: "0.25rem" }}>
                  <button className="btn btn-sm btn-ghost" type="button" onClick={() => setRenameTemplateId(t.id)}>
                    Rename
                  </button>
                  <button className="btn btn-sm btn-ghost" type="button" onClick={() => removeTemplate(t.id)}>
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <h4 style={{ marginBottom: "0.5rem", fontSize: "0.9rem" }}>Courses (Study drop)</h4>
        <button className="btn btn-sm" type="button" onClick={() => syncCourseBoxes()}>
          Refresh from Course Dashboard
        </button>
        <ul style={{ listStyle: "none", marginTop: "0.75rem", padding: 0 }}>
          {courses.length === 0 ? (
            <li style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No courses found in ~/Documents/CourseDashboard</li>
          ) : (
            courses.map((c) => (
              <li key={c.storageKey} style={{ padding: "0.35rem 0", fontSize: "0.85rem" }}>
                {c.displayName}
                {c.examDate ? ` · exam ${c.examDate}` : ""}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h4 style={{ marginBottom: "0.75rem" }}>Backup</h4>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => {
              const blob = new Blob([exportAllData()], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `life-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
              setMessage("Backup downloaded.");
            }}
          >
            Export backup
          </button>
          <label className="btn btn-sm" style={{ cursor: "pointer" }}>
            Import backup
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    importAllData(String(reader.result));
                    reloadFromStorage();
                    setMessage("Backup imported.");
                  } catch {
                    setMessage("Import failed — invalid file.");
                  }
                };
                reader.readAsText(file);
              }}
            />
          </label>
        </div>
      </div>

      <button className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={save}>
        Save Settings
      </button>
      {message && <p style={{ marginTop: "0.75rem", color: "var(--success)" }}>{message}</p>}

      {renameTemplateId && (
        <RenameDialog
          title="Rename saved box"
          initialValue={templates.find((t) => t.id === renameTemplateId)?.label ?? ""}
          onConfirm={(label) => {
            renameTemplate(renameTemplateId, label);
            setRenameTemplateId(null);
          }}
          onCancel={() => setRenameTemplateId(null)}
        />
      )}
    </div>
  );
}
