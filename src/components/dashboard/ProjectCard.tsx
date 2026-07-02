import type { CSSProperties } from "react";
import type { Project } from "../../types/project";
import { projectTaskCounts } from "../../lib/projectUtils";
import type { Task } from "../../types/task";

type Props = {
  project: Project;
  tasks: Task[];
  onClick?: () => void;
};

export function ProjectCard({ project, tasks, onClick }: Props) {
  const counts = projectTaskCounts(tasks, project.id);

  return (
    <button type="button" className="project-card" onClick={onClick} style={{ "--project-color": project.color } as CSSProperties}>
      <div className="project-card-header">
        <span className="project-dot" />
        <span className="project-card-name">{project.name}</span>
      </div>
      {project.description && (
        <p className="project-card-desc">{project.description}</p>
      )}
      <div className="project-card-stats">
        <span>{counts.total} open</span>
        {counts.now > 0 && <span className="stat-urgent">{counts.now} now</span>}
        {counts.scheduled > 0 && <span>{counts.scheduled} scheduled</span>}
      </div>
    </button>
  );
}
