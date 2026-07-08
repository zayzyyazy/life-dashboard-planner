const API_BASE = import.meta.env.VITE_API_URL ?? "";
const REQUEST_TIMEOUT_MS = 45_000;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...options?.headers },
      ...options,
      signal: controller.signal,
    });
    let data: { error?: string };
    try {
      data = await res.json();
    } catch {
      throw new Error(
        res.ok
          ? "Invalid response from server"
          : `Server error ${res.status}. Is the backend running on port 3847?`
      );
    }
    if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
    return data as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out. Check the server terminal for errors.");
    }
    if (err instanceof TypeError) {
      throw new Error(
        "Cannot reach the server. Run npm run dev and check for [server] errors in Terminal."
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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

export interface TelegramStatus {
  enabled: boolean;
  token_configured: boolean;
  allowed_users_configured: boolean;
  voice_enabled: boolean;
  text_enabled: boolean;
  commands_enabled: boolean;
  last_message_at: string | null;
}

export interface UserProfile {
  name: string | null;
  summary: string | null;
  personal_work_context: string | null;
  university_context: string | null;
  personal_life_context: string | null;
  preferences: string | null;
}

export interface KnowledgeEntry {
  id: number;
  domain: string;
  title: string;
  content: string;
  source: string;
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
  getGitHubStatus: () =>
    request<{ watched_count: number; token_configured: boolean }>("/github/status"),
  syncGitHubRepos: () =>
    request<{ added: string[]; total: number }>("/watch/github/sync", { method: "POST" }),
  getTelegramStatus: () => request<TelegramStatus>("/telegram/status"),

  getProfile: () =>
    request<{ profile: UserProfile; knowledge: KnowledgeEntry[] }>("/profile"),
  updateProfile: (profile: UserProfile) =>
    request<{ profile: UserProfile }>("/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    }),
  addKnowledge: (note: { domain: string; title: string; content: string }) =>
    request<KnowledgeEntry>("/knowledge", { method: "POST", body: JSON.stringify(note) }),
  deleteKnowledge: (id: number) =>
    request<{ deleted: boolean }>(`/knowledge/${id}`, { method: "DELETE" }),
};
