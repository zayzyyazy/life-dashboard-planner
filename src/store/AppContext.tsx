import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { createPlannerProvider } from "../lib/plannerProvider";
import {
  generateToken,
  loadCourses,
  loadPlannerState,
  loadSettings,
  loadTasks,
  loadTemplates,
  loadWeekTemplates,
  loadViewWeekStart,
  loadHiddenBuiltinBoxes,
  saveViewWeekStart,
  saveHiddenBuiltinBoxes,
  syncCoursesFromVault,
  savePlannerState,
  saveSettings,
  saveTasks,
  saveTemplates,
  saveWeekTemplates,
} from "../lib/storage";
import { readCourseDashboardCourses } from "../lib/tauriApi";
import {
  applyWeekTemplate,
  copyPreviousWeekTasks,
  createTaskFromTemplate,
  currentWeekToSlots,
} from "../lib/templates";
import { createTask, createTaskId, nowIso, updateTask } from "../lib/taskUtils";
import type { ChatMessage, PlannerState } from "../types/planner";
import type { AppSettings } from "../types/settings";
import type { ActivityTemplate, CourseDashboardCourse, SavedWeekTemplate } from "../types/template";
import type { BoxKind } from "../types/box";
import type { SuggestedTask, Task, TaskDraft } from "../types/task";
import { shortcutApi } from "../lib/shortcutApi";
import { hasScheduleDetails } from "../lib/captureParser";
import { addDays, normalizeTaskDate, startOfWeek, toDateString } from "../lib/dateUtils";
import { parseCaptureText } from "../lib/captureParser";
import { enrichSuggestionsWithTimes } from "../lib/scheduleUtils";

type Page = "today" | "week" | "month" | "all" | "planner" | "review" | "settings";

function isVaguePlanningIntent(text: string, context: Record<string, string>): boolean {
  if (context.awaiting) return false;
  if (hasScheduleDetails(text)) return false;
  const t = text.toLowerCase().trim();
  const short = t.split(/\s+/).length <= 6;
  if (short && /plan\s+(my\s+)?(today|day)/.test(t)) return true;
  if (short && /plan\s+(my\s+)?tomorrow/.test(t)) return true;
  if (short && /plan\s+(my\s+)?(week|this\s+week)/.test(t)) return true;
  return false;
}

function planTargetFromText(text: string): string {
  const t = text.toLowerCase();
  if (/tomorrow/.test(t)) return "tomorrow";
  if (/week/.test(t)) return "week";
  return "today";
}

type State = {
  tasks: Task[];
  planner: PlannerState;
  settings: AppSettings;
  templates: ActivityTemplate[];
  courses: CourseDashboardCourse[];
  weekTemplates: SavedWeekTemplate[];
  viewWeekStart: string;
  sessionBoxes: ActivityTemplate[];
  hiddenBuiltinBoxes: BoxKind[];
  page: Page;
  shortcutStatus: string;
  isMiniMode: boolean;
  lastAutoSavedAt: number;
  lastAutoSavedCount: number;
};

type Action =
  | { type: "SET_PAGE"; page: Page }
  | { type: "SET_TASKS"; tasks: Task[] }
  | { type: "ADD_TASK"; draft: TaskDraft }
  | { type: "UPDATE_TASK"; id: string; patch: Partial<Task> }
  | { type: "DELETE_TASK"; id: string }
  | { type: "ADD_TASKS_FROM_SUGGESTIONS"; suggestions: SuggestedTask[] }
  | { type: "SET_PLANNER"; planner: PlannerState }
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "SET_SUGGESTIONS"; suggestions: SuggestedTask[] }
  | { type: "CLEAR_SUGGESTIONS" }
  | { type: "SET_SETTINGS"; settings: AppSettings }
  | { type: "SET_SHORTCUT_STATUS"; status: string }
  | { type: "SET_MINI_MODE"; value: boolean }
  | { type: "UPDATE_PLANNER_CONTEXT"; context: Record<string, string>; followUp?: string }
  | { type: "SET_LAST_AUTO_SAVED"; count: number; at: number }
  | { type: "CLEAR_PLANNER_CHAT" }
  | { type: "SET_TEMPLATES"; templates: ActivityTemplate[] }
  | { type: "SET_COURSES"; courses: CourseDashboardCourse[] }
  | { type: "SET_WEEK_TEMPLATES"; weekTemplates: SavedWeekTemplate[] }
  | { type: "ADD_TASKS"; tasks: Task[] }
  | { type: "SET_VIEW_WEEK"; weekStart: string }
  | { type: "ADD_SESSION_BOX"; template: ActivityTemplate }
  | { type: "REMOVE_SESSION_BOX"; templateId: string }
  | { type: "SET_HIDDEN_BUILTIN_BOXES"; kinds: BoxKind[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_PAGE":
      return { ...state, page: action.page };
    case "SET_TASKS":
      return { ...state, tasks: action.tasks };
    case "ADD_TASK":
      return { ...state, tasks: [...state.tasks, createTask(action.draft)] };
    case "UPDATE_TASK":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? updateTask(t, action.patch) : t
        ),
      };
    case "DELETE_TASK":
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) };
    case "CLEAR_PLANNER_CHAT":
      return {
        ...state,
        planner: { messages: [], pendingSuggestions: [], context: {} },
      };
    case "ADD_TASKS_FROM_SUGGESTIONS": {
      const normalized = enrichSuggestionsWithTimes(
        action.suggestions.map((s) => ({
          ...s,
          date: normalizeTaskDate(s.date),
        }))
      );
      const newTasks = normalized.map((s) =>
        createTask({ ...s, done: false, source: "capture" })
      );
      return {
        ...state,
        tasks: [...state.tasks, ...newTasks],
        planner: { ...state.planner, pendingSuggestions: [] },
      };
    }
    case "ADD_TASKS":
      return { ...state, tasks: [...state.tasks, ...action.tasks] };
    case "SET_TEMPLATES":
      return { ...state, templates: action.templates };
    case "SET_COURSES":
      return { ...state, courses: action.courses };
    case "SET_WEEK_TEMPLATES":
      return { ...state, weekTemplates: action.weekTemplates };
    case "SET_PLANNER":
      return { ...state, planner: action.planner };
    case "ADD_MESSAGE":
      return {
        ...state,
        planner: {
          ...state.planner,
          messages: [...state.planner.messages, action.message],
        },
      };
    case "SET_SUGGESTIONS":
      return {
        ...state,
        planner: { ...state.planner, pendingSuggestions: action.suggestions },
      };
    case "CLEAR_SUGGESTIONS":
      return {
        ...state,
        planner: { ...state.planner, pendingSuggestions: [] },
      };
    case "SET_SETTINGS":
      return { ...state, settings: action.settings };
    case "SET_SHORTCUT_STATUS":
      return { ...state, shortcutStatus: action.status };
    case "SET_MINI_MODE":
      return { ...state, isMiniMode: action.value };
    case "UPDATE_PLANNER_CONTEXT":
      return {
        ...state,
        planner: {
          ...state.planner,
          context: { ...state.planner.context, ...action.context },
          awaitingFollowUp: action.followUp,
        },
      };
    case "SET_LAST_AUTO_SAVED":
      return { ...state, lastAutoSavedCount: action.count, lastAutoSavedAt: action.at };
    case "SET_VIEW_WEEK":
      return { ...state, viewWeekStart: action.weekStart };
    case "ADD_SESSION_BOX":
      return { ...state, sessionBoxes: [...state.sessionBoxes, action.template] };
    case "REMOVE_SESSION_BOX":
      return {
        ...state,
        sessionBoxes: state.sessionBoxes.filter((t) => t.id !== action.templateId),
      };
    case "SET_HIDDEN_BUILTIN_BOXES":
      return { ...state, hiddenBuiltinBoxes: action.kinds };
    default:
      return state;
  }
}

function initState(): State {
  const settings = loadSettings();
  if (!settings.shortcut.token) {
    settings.shortcut.token = generateToken();
    saveSettings(settings);
  }
  return {
    tasks: loadTasks(),
    planner: loadPlannerState(),
    settings,
    templates: loadTemplates(),
    courses: loadCourses(),
    weekTemplates: loadWeekTemplates(),
    viewWeekStart: loadViewWeekStart(),
    sessionBoxes: [],
    hiddenBuiltinBoxes: loadHiddenBuiltinBoxes(),
    page: "week",
    shortcutStatus: "",
    isMiniMode: false,
    lastAutoSavedCount: 0,
    lastAutoSavedAt: 0,
  };
}

type AppContextValue = State & {
  navigate: (page: Page) => void;
  addTask: (draft: TaskDraft) => void;
  editTask: (id: string, patch: Partial<Task>) => void;
  removeTask: (id: string) => void;
  toggleDone: (id: string) => void;
  approveSuggestions: () => void;
  rejectSuggestions: () => void;
  sendPlannerMessage: (text: string) => Promise<void>;
  runQuickAction: (intent: string) => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  processShortcutCapture: (text: string) => Promise<void>;
  setMiniMode: (value: boolean) => void;
  clearPlannerChat: () => void;
  provider: ReturnType<typeof createPlannerProvider>;
  addTaskFromBox: (templateId: string, date: string) => void;
  copyLastWeek: () => void;
  saveWeekAs: (name: string) => void;
  applySavedWeek: (templateId: string) => void;
  upsertTemplate: (template: ActivityTemplate) => void;
  removeTemplate: (templateId: string) => void;
  syncCourseBoxes: () => Promise<void>;
  reloadFromStorage: () => void;
  goToPrevWeek: () => void;
  goToNextWeek: () => void;
  goToThisWeek: () => void;
  addSessionBox: (template: ActivityTemplate) => void;
  findTemplate: (templateId: string) => ActivityTemplate | undefined;
  renameTemplate: (templateId: string, label: string) => void;
  renameWeekTemplate: (weekId: string, name: string) => void;
  removeWeekTemplate: (weekId: string) => void;
  hideBuiltinBox: (kind: BoxKind) => void;
  restoreBuiltinBoxes: () => void;
  removeSessionBox: (templateId: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  const provider = useMemo(
    () => createPlannerProvider(state.settings),
    [state.settings]
  );

  const saveTasksTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTasksTimer.current) clearTimeout(saveTasksTimer.current);
    saveTasksTimer.current = setTimeout(() => {
      saveTasks(state.tasks);
      saveTasksTimer.current = null;
    }, 300);
    return () => {
      if (saveTasksTimer.current) clearTimeout(saveTasksTimer.current);
    };
  }, [state.tasks]);

  useEffect(() => {
    savePlannerState(state.planner);
  }, [state.planner]);

  useEffect(() => {
    saveTemplates(state.templates);
  }, [state.templates]);

  useEffect(() => {
    saveWeekTemplates(state.weekTemplates);
  }, [state.weekTemplates]);

  useEffect(() => {
    saveViewWeekStart(state.viewWeekStart);
  }, [state.viewWeekStart]);

  useEffect(() => {
    saveHiddenBuiltinBoxes(state.hiddenBuiltinBoxes);
  }, [state.hiddenBuiltinBoxes]);

  const syncCourseBoxes = useCallback(async () => {
    const vaultCourses = await readCourseDashboardCourses();
    const { templates, courses } = syncCoursesFromVault(vaultCourses);
    dispatch({ type: "SET_TEMPLATES", templates });
    dispatch({ type: "SET_COURSES", courses });
  }, []);

  useEffect(() => {
    syncCourseBoxes();
  }, [syncCourseBoxes]);

  const syncShortcutServer = useCallback(async (settings: AppSettings) => {
    try {
      await shortcutApi.configure({
        enabled: settings.shortcut.enabled,
        port: settings.shortcut.port,
        token: settings.shortcut.token,
      });
      dispatch({
        type: "SET_SHORTCUT_STATUS",
        status: settings.shortcut.enabled
          ? `Listening on port ${settings.shortcut.port}`
          : "Shortcut server disabled",
      });
    } catch {
      dispatch({ type: "SET_SHORTCUT_STATUS", status: "Shortcut server unavailable (browser mode)" });
    }
  }, []);

  useEffect(() => {
    syncShortcutServer(state.settings);
  }, [state.settings.shortcut.enabled, state.settings.shortcut.port, state.settings.shortcut.token, syncShortcutServer]);

  const processShortcutCapture = useCallback(
    async (text: string) => {
      const suggestions = parseCaptureText(text);
      if (state.settings.shortcut.autoSave) {
        dispatch({ type: "ADD_TASKS_FROM_SUGGESTIONS", suggestions });
        dispatch({
          type: "ADD_MESSAGE",
          message: {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `📱 iPhone capture saved ${suggestions.length} task(s): ${suggestions.map((s) => s.title).join(", ")}`,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        dispatch({ type: "SET_SUGGESTIONS", suggestions });
        dispatch({
          type: "SET_SHORTCUT_STATUS",
          status: `Captured ${suggestions.length} item(s) — enable auto-save in Settings to add directly`,
        });
      }
    },
    [state.settings.shortcut.autoSave]
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      listen<{ text: string }>("shortcut-capture", (event) => {
        if (event.payload?.text) {
          processShortcutCapture(event.payload.text);
        }
      })
        .then((fn) => {
          unlisten = fn;
        })
        .catch((err) => {
          console.warn("[Life Dashboard] shortcut listener unavailable:", err);
        });
    } catch (err) {
      console.warn("[Life Dashboard] shortcut listener setup failed:", err);
    }
    return () => unlisten?.();
  }, [processShortcutCapture]);

  const sendPlannerMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: "ADD_MESSAGE", message: userMsg });

      const response = await provider.generateResponse(
        text,
        state.planner.context,
        state.tasks
      );

      let replyText = response.reply;
      const vaguePlan = isVaguePlanningIntent(text, state.planner.context);
      let suggestions = response.suggestions ?? [];

      if (vaguePlan) {
        suggestions = [];
        if (!replyText.includes("?")) {
          replyText =
            "What do you need to do? List your tasks, meetings, and any fixed times (e.g. work 10–18, gym at 17:00).";
        }
      }

      if (response.contextUpdates) {
        dispatch({
          type: "UPDATE_PLANNER_CONTEXT",
          context: response.contextUpdates,
          followUp: response.followUp,
        });
      } else if (vaguePlan) {
        const planTarget = planTargetFromText(text);
        dispatch({
          type: "UPDATE_PLANNER_CONTEXT",
          context: {
            awaiting: "plan-details",
            planTarget,
            ...(planTarget === "week" && /\bnext\s+week\b/i.test(text) ? { nextWeek: "true" } : {}),
          },
          followUp: "plan-details",
        });
      }

      const canAutoSave =
        suggestions.length > 0 && !response.followUp && !vaguePlan;

      if (canAutoSave && state.settings.planner.autoSave) {
        dispatch({ type: "ADD_TASKS_FROM_SUGGESTIONS", suggestions });
        dispatch({ type: "SET_LAST_AUTO_SAVED", count: suggestions.length, at: Date.now() });
        replyText += `\n\nAdded ${suggestions.length} task(s) to your list.`;
      } else if (suggestions.length > 0) {
        dispatch({ type: "SET_SUGGESTIONS", suggestions });
      }

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: replyText,
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: "ADD_MESSAGE", message: assistantMsg });
    },
    [provider, state.planner.context, state.tasks, state.settings.planner.autoSave]
  );

  const value: AppContextValue = {
    ...state,
    provider,
    navigate: (page) => dispatch({ type: "SET_PAGE", page }),
    addTask: (draft) => dispatch({ type: "ADD_TASK", draft }),
    editTask: (id, patch) => dispatch({ type: "UPDATE_TASK", id, patch }),
    removeTask: (id) => dispatch({ type: "DELETE_TASK", id }),
    toggleDone: (id) => {
      const task = state.tasks.find((t) => t.id === id);
      if (task) dispatch({ type: "UPDATE_TASK", id, patch: { done: !task.done } });
    },
    approveSuggestions: () => {
      if (state.planner.pendingSuggestions.length) {
        dispatch({
          type: "ADD_TASKS_FROM_SUGGESTIONS",
          suggestions: state.planner.pendingSuggestions,
        });
      }
    },
    rejectSuggestions: () => dispatch({ type: "CLEAR_SUGGESTIONS" }),
    sendPlannerMessage,
    runQuickAction: async (intent) => sendPlannerMessage(intent),
    updateSettings: async (settings) => {
      saveSettings(settings);
      dispatch({ type: "SET_SETTINGS", settings });
      await syncShortcutServer(settings);
    },
    processShortcutCapture,
    setMiniMode: (value) => dispatch({ type: "SET_MINI_MODE", value }),
    clearPlannerChat: () => dispatch({ type: "CLEAR_PLANNER_CHAT" }),
    addTaskFromBox: (templateId, date) => {
      const template = state.templates.find((t) => t.id === templateId);
      if (!template) return;
      const task = createTaskFromTemplate(template, date, state.tasks);
      dispatch({ type: "ADD_TASKS", tasks: [task] });
    },
    copyLastWeek: () => {
      const cloned = copyPreviousWeekTasks(state.tasks, state.viewWeekStart);
      if (cloned.length) dispatch({ type: "ADD_TASKS", tasks: cloned });
    },
    saveWeekAs: (name) => {
      const slots = currentWeekToSlots(state.tasks, state.viewWeekStart);
      const entry: SavedWeekTemplate = {
        id: createTaskId(),
        name: name.trim() || "Saved week",
        slots,
        createdAt: nowIso(),
      };
      dispatch({
        type: "SET_WEEK_TEMPLATES",
        weekTemplates: [...state.weekTemplates, entry],
      });
    },
    applySavedWeek: (templateId) => {
      const tpl = state.weekTemplates.find((w) => w.id === templateId);
      if (!tpl) return;
      const newTasks = applyWeekTemplate(tpl, state.tasks, state.viewWeekStart);
      dispatch({ type: "ADD_TASKS", tasks: newTasks });
    },
    upsertTemplate: (template) => {
      const next = state.templates.some((t) => t.id === template.id)
        ? state.templates.map((t) => (t.id === template.id ? template : t))
        : [...state.templates, { ...template, isBuiltIn: false }];
      dispatch({ type: "SET_TEMPLATES", templates: next });
    },
    removeTemplate: (templateId) => {
      dispatch({
        type: "SET_TEMPLATES",
        templates: state.templates.filter((t) => t.id !== templateId || t.isBuiltIn),
      });
    },
    syncCourseBoxes,
    reloadFromStorage: () => {
      dispatch({ type: "SET_TASKS", tasks: loadTasks() });
      dispatch({ type: "SET_TEMPLATES", templates: loadTemplates() });
      dispatch({ type: "SET_COURSES", courses: loadCourses() });
      dispatch({ type: "SET_WEEK_TEMPLATES", weekTemplates: loadWeekTemplates() });
      dispatch({ type: "SET_VIEW_WEEK", weekStart: loadViewWeekStart() });
      dispatch({ type: "SET_HIDDEN_BUILTIN_BOXES", kinds: loadHiddenBuiltinBoxes() });
    },
    goToPrevWeek: () => {
      dispatch({ type: "SET_VIEW_WEEK", weekStart: addDays(state.viewWeekStart, -7) });
    },
    goToNextWeek: () => {
      dispatch({ type: "SET_VIEW_WEEK", weekStart: addDays(state.viewWeekStart, 7) });
    },
    goToThisWeek: () => {
      dispatch({ type: "SET_VIEW_WEEK", weekStart: toDateString(startOfWeek()) });
    },
    addSessionBox: (template) => dispatch({ type: "ADD_SESSION_BOX", template }),
    findTemplate: (templateId) => {
      return (
        state.templates.find((t) => t.id === templateId) ??
        state.sessionBoxes.find((t) => t.id === templateId)
      );
    },
    renameTemplate: (templateId, label) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      dispatch({
        type: "SET_TEMPLATES",
        templates: state.templates.map((t) =>
          t.id === templateId && !t.isBuiltIn ? { ...t, label: trimmed } : t
        ),
      });
    },
    renameWeekTemplate: (weekId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      dispatch({
        type: "SET_WEEK_TEMPLATES",
        weekTemplates: state.weekTemplates.map((w) =>
          w.id === weekId ? { ...w, name: trimmed } : w
        ),
      });
    },
    removeWeekTemplate: (weekId) => {
      dispatch({
        type: "SET_WEEK_TEMPLATES",
        weekTemplates: state.weekTemplates.filter((w) => w.id !== weekId),
      });
    },
    hideBuiltinBox: (kind) => {
      if (state.hiddenBuiltinBoxes.includes(kind)) return;
      dispatch({
        type: "SET_HIDDEN_BUILTIN_BOXES",
        kinds: [...state.hiddenBuiltinBoxes, kind],
      });
    },
    restoreBuiltinBoxes: () => {
      dispatch({ type: "SET_HIDDEN_BUILTIN_BOXES", kinds: [] });
    },
    removeSessionBox: (templateId) => {
      dispatch({ type: "REMOVE_SESSION_BOX", templateId });
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export type { Page };
