export type ShortcutSettings = {
  enabled: boolean;
  port: number;
  token: string;
  autoSave: boolean;
};

export type PlannerSettings = {
  autoSave: boolean;
};

export type AppSettings = {
  shortcut: ShortcutSettings;
  planner: PlannerSettings;
  llmProvider: "mock" | "openai" | "ollama";
  openaiApiKey: string;
  openaiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: {
    enabled: true,
    port: 7823,
    token: "",
    autoSave: true,
  },
  planner: {
    autoSave: false,
  },
  llmProvider: "mock",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "llama3.2",
};
