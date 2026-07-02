import { useEffect, useState } from "react";
import { api, type KnowledgeEntry, type UserProfile } from "../lib/api";

const DOMAINS = [
  { id: "personal_work", label: "Personal work" },
  { id: "university", label: "University" },
  { id: "personal_life", label: "Personal life" },
  { id: "general", label: "General" },
] as const;

export function ProfilePanel() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newNote, setNewNote] = useState({ domain: "general", title: "", content: "" });

  const load = () => {
    api
      .getProfile()
      .then((data) => {
        setProfile(data.profile);
        setKnowledge(data.knowledge);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateProfile(profile);
      setProfile(updated.profile);
      setMessage("Profile saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!newNote.title.trim() || !newNote.content.trim()) return;
    try {
      await api.addKnowledge(newNote);
      setNewNote({ domain: newNote.domain, title: "", content: "" });
      load();
      setMessage("Knowledge added.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
  };

  const removeNote = async (id: number) => {
    await api.deleteKnowledge(id);
    load();
  };

  if (loading || !profile) return <section className="panel"><p>Loading…</p></section>;

  return (
    <section className="panel profile-panel">
      <h2>About you</h2>
      <p className="hint">
        Teach your agent who you are. It keeps personal work and university separate.
        You can also say in chat: &quot;Remember about me: …&quot; or &quot;For university: …&quot;
      </p>

      <div className="profile-form">
        <label>
          Name
          <input
            value={profile.name ?? ""}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
        </label>
        <label>
          Short summary
          <textarea
            value={profile.summary ?? ""}
            onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
            rows={2}
          />
        </label>
        <label>
          Personal work context
          <textarea
            value={profile.personal_work_context ?? ""}
            onChange={(e) => setProfile({ ...profile, personal_work_context: e.target.value })}
            rows={3}
            placeholder="Startups, Marie/Leaping AI, MCP, QA app…"
          />
        </label>
        <label>
          University context
          <textarea
            value={profile.university_context ?? ""}
            onChange={(e) => setProfile({ ...profile, university_context: e.target.value })}
            rows={3}
            placeholder="Degree, courses, deadlines…"
          />
        </label>
        <label>
          Personal life context
          <textarea
            value={profile.personal_life_context ?? ""}
            onChange={(e) => setProfile({ ...profile, personal_life_context: e.target.value })}
            rows={2}
          />
        </label>
        <button onClick={saveProfile} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>

      <h3>Knowledge notes</h3>
      <div className="knowledge-add">
        <select
          value={newNote.domain}
          onChange={(e) => setNewNote({ ...newNote, domain: e.target.value })}
        >
          {DOMAINS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Title"
          value={newNote.title}
          onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
        />
        <textarea
          placeholder="What should the agent remember?"
          value={newNote.content}
          onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
          rows={2}
        />
        <button onClick={addNote}>Add note</button>
      </div>

      {knowledge.length === 0 ? (
        <p className="empty">No knowledge notes yet.</p>
      ) : (
        <ul className="list">
          {knowledge.map((k) => (
            <li key={k.id} className="list-item">
              <div className="list-item-main">
                <strong>
                  [{DOMAINS.find((d) => d.id === k.domain)?.label ?? k.domain}] {k.title}
                </strong>
                <p>{k.content}</p>
              </div>
              <button className="btn-secondary btn-small" onClick={() => removeNote(k.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && <p className="banner">{message}</p>}
    </section>
  );
}
