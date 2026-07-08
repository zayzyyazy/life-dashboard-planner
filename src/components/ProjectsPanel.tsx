import { useEffect, useState } from "react";
import { api, type Project } from "../lib/api";

export function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProjects().then(setProjects).finally(() => setLoading(false));
  }, []);

  if (loading) return <section className="panel"><p>Loading projects…</p></section>;

  return (
    <section className="panel">
      <h2>Projects</h2>
      <ul className="list">
        {projects.map((p) => (
          <li key={p.id} className="list-item">
            <div className="list-item-main">
              <strong>{p.name}</strong>
              <span className="muted">{p.description}</span>
            </div>
            <div className="list-item-meta">
              <span>{p.open_tasks} open tasks</span>
              <span>{p.update_count} updates</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
