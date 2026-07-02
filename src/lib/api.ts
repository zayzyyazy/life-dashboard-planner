const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data as T;
}

export interface ChatResult {
  reply: string;
  classification: { classification: string; project_name: string | null };
  actions: string[];
}

export interface Project {
  id: number;
  name: string;
  description: string;
  status: string;
  open_tasks: number;
  update_count: number;
  updated_at: string;
}

export interface Task {
  id: number;
  title: string;
  status: string;
  due_date: string | null;
  blocked_reason: string | null;
  project_name: string | null;
}

export interface Reminder {
  id: number;
  message: string;
  due_at: string;
  status: string;
  project_name: string | null;
}

export interface Update {
  id: number;
  title: string;
  content: string;
  source: string;
  project_name: string;
  created_at: string;
}

export interface AgentMessage {
  id: number;
  role: string;
  content: string;
  created_at: string;
}

export const api = {
  chat: (message: string) =>
    request<ChatResult>("/chat", { method: "POST", body: JSON.stringify({ message }) }),

  getProjects: () => request<Project[]>("/projects"),
  getProject: (id: number) => request<unknown>(`/projects/${id}`),
  getTasks: () => request<Task[]>("/tasks"),
  getReminders: () => request<Reminder[]>("/reminders"),
  getUpdates: () => request<Update[]>("/updates"),
  getMessages: () => request<AgentMessage[]>("/messages"),

  getBrief: () => request<{ date: string; content: string }>("/brief/today"),
  sendBrief: () => request<{ sent: boolean }>("/brief/send-daily", { method: "POST" }),
  sendTestEmail: () => request<{ sent: boolean }>("/email/send-test", { method: "POST" }),

  watchRepo: (url: string, project_id?: number) =>
    request<unknown>("/watch/github", {
      method: "POST",
      body: JSON.stringify({ url, project_id }),
    }),

  watchFolder: (path: string, project_id?: number) =>
    request<unknown>("/watch/folder", {
      method: "POST",
      body: JSON.stringify({ path, project_id }),
    }),

  getWatchedRepos: () => request<unknown[]>("/watch/github"),
  getWatchedFolders: () => request<unknown[]>("/watch/folder"),
};
