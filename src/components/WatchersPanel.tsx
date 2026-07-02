import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface WatchedRepo {
  id: number;
  owner: string;
  repo: string;
  url: string;
  project_name: string | null;
  last_checked_at: string | null;
}

interface WatchedFolder {
  id: number;
  path: string;
  project_name: string | null;
  last_checked_at: string | null;
}

export function WatchersPanel() {
  const [repos, setRepos] = useState<WatchedRepo[]>([]);
  const [folders, setFolders] = useState<WatchedFolder[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    Promise.all([api.getWatchedRepos(), api.getWatchedFolders()])
      .then(([r, f]) => {
        setRepos(r as WatchedRepo[]);
        setFolders(f as WatchedFolder[]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const addRepo = async () => {
    if (!repoUrl.trim()) return;
    setError(null);
    try {
      await api.watchRepo(repoUrl.trim());
      setRepoUrl("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  const addFolder = async () => {
    if (!folderPath.trim()) return;
    setError(null);
    try {
      await api.watchFolder(folderPath.trim());
      setFolderPath("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <section className="panel">
      <h2>Watchers</h2>
      {error && <p className="error">{error}</p>}

      <div className="watch-form">
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
        />
        <button onClick={addRepo}>Watch Repo</button>
      </div>
      <div className="watch-form">
        <input
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          placeholder="/Users/you/projects/my-app"
        />
        <button onClick={addFolder}>Watch Folder</button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <h3>GitHub Repos</h3>
          {repos.length === 0 ? (
            <p className="empty">No repos watched.</p>
          ) : (
            <ul className="list">
              {repos.map((r) => (
                <li key={r.id} className="list-item">
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.owner}/{r.repo}
                  </a>
                  <span className="muted">
                    {r.last_checked_at
                      ? `checked ${new Date(r.last_checked_at).toLocaleString()}`
                      : "not checked yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3>Local Folders</h3>
          {folders.length === 0 ? (
            <p className="empty">No folders watched.</p>
          ) : (
            <ul className="list">
              {folders.map((f) => (
                <li key={f.id} className="list-item">
                  <code>{f.path}</code>
                  <span className="muted">
                    {f.last_checked_at
                      ? `checked ${new Date(f.last_checked_at).toLocaleString()}`
                      : "not checked yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
