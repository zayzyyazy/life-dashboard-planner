import type { SuggestedTask } from "./task";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
};

export type PlannerState = {
  messages: ChatMessage[];
  pendingSuggestions: SuggestedTask[];
  awaitingFollowUp?: string;
  context: Record<string, string>;
};

export type PlannerResponse = {
  reply: string;
  followUp?: string;
  suggestions: SuggestedTask[];
  contextUpdates?: Record<string, string>;
};

export type WeekReview = {
  insights: string[];
  categoryScores: Record<string, number>;
  completedThisWeek: number;
  completionPercent: number;
  mostActiveCategory: string;
  leastActiveCategory: string;
  upcomingDeadlines: { title: string; date: string }[];
  overdueCount: number;
};
