import { useMemo, useState } from "react";
import { BucketSection } from "../components/dashboard/BucketSection";
import { DailyBriefingCard } from "../components/dashboard/DailyBriefingCard";
import { ProjectCard } from "../components/dashboard/ProjectCard";
import { AgentMemoryPanel } from "../components/agent/AgentMemoryPanel";
import { tasksInBucket } from "../lib/bucketUtils";
import { todayString } from "../lib/dateUtils";
import { PROJECT_COLORS } from "../types/project";
import { useApp } from "../store/AppContext";

export function DashboardPage() {
  const {
    tasks,
    projects,
    agentMemory,
    navigate,
    toggleDone,
    editTask,
    removeTask,
    addTask,
    addProject,
  } = useApp();

  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectColor, setProjectColor] = useState<string>(PROJECT_COLORS[0]);

  const today = todayString();
  const projectNames = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const mustDo = tasksInBucket(tasks, "now");
  const scheduledToday = tasksInBucket(tasks, "scheduled").filter((t) => t.date === today);
  const later = tasksInBucket(tasks, "later");
  const someday = tasksInBucket(tasks, "someday");
  const activeProjects = projects.filter((p) => p.status === "active");

  const moveBucket = (id: string, bucket: Parameters<typeof editTask>[1]["bucket"]) => {
    editTask(id, { bucket });
  };

  const addToBucket = (bucket: "now" | "later" | "someday", title: string) => {
    addTask({
      title,
      date: today,
      tag: "personal",
      priority: bucket === "now" ? "high" : "medium",
      bucket,
    });
  };

  const createProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    addProject({ name: projectName.trim(), color: projectColor, status: "active" });
    setProjectName("");
    setShowProjectForm(false);
  };

  return (
    <div className="dashboard-page">
      <DailyBriefingCard
        tasks={tasks}
        projects={projects}
        onOpenChat={() => navigate("planner")}
      />

      <AgentMemoryPanel entries={agentMemory.entries.slice(0, 5)} />

      <div className="dashboard-chat-cta" onClick={() => navigate("planner")} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && navigate("planner")}>
        <span className="dashboard-chat-icon">💬</span>
        <div>
          <strong>Talk to your agent</strong>
          <p>Give updates anytime — your agent remembers, plans, and acts across your apps.</p>
        </div>
        <span className="dashboard-chat-arrow">→</span>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <BucketSection
            bucket="now"
            tasks={mustDo}
            projectNames={projectNames}
            onToggle={toggleDone}
            onMove={moveBucket}
            onDelete={removeTask}
            onAdd={(title) => addToBucket("now", title)}
          />

          <BucketSection
            bucket="scheduled"
            tasks={scheduledToday}
            projectNames={projectNames}
            onToggle={toggleDone}
            onMove={moveBucket}
            onDelete={removeTask}
          />

          <BucketSection
            bucket="later"
            tasks={later}
            projectNames={projectNames}
            onToggle={toggleDone}
            onMove={moveBucket}
            onDelete={removeTask}
            onAdd={(title) => addToBucket("later", title)}
            showDate
            collapsed={later.length > 5}
          />

          <BucketSection
            bucket="someday"
            tasks={someday}
            projectNames={projectNames}
            onToggle={toggleDone}
            onMove={moveBucket}
            onDelete={removeTask}
            onAdd={(title) => addToBucket("someday", title)}
            collapsed
          />
        </div>

        <aside className="dashboard-sidebar">
          <div className="dashboard-section-header">
            <h3>Projects</h3>
            <button type="button" className="btn btn-sm" onClick={() => setShowProjectForm(!showProjectForm)}>
              + New
            </button>
          </div>

          {showProjectForm && (
            <form className="project-form" onSubmit={createProject}>
              <input
                className="input"
                placeholder="Project name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                autoFocus
              />
              <div className="color-picker">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch ${projectColor === c ? "selected" : ""}`}
                    style={{ background: c }}
                    onClick={() => setProjectColor(c)}
                  />
                ))}
              </div>
              <button type="submit" className="btn btn-primary btn-sm">Create</button>
            </form>
          )}

          {activeProjects.length === 0 ? (
            <p className="bucket-empty">No projects yet. Create one to group related tasks.</p>
          ) : (
            <div className="project-grid">
              {activeProjects.map((p) => (
                <ProjectCard key={p.id} project={p} tasks={tasks} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
