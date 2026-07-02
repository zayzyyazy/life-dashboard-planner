import type { AgentTurn } from "../../types/agent";
import type { AppSettings } from "../../types/settings";
import type { AgentToolkit } from "./tools";
import { agentSystemPrompt } from "./prompt";
import { runToolCalls, summarizeTasksForAgent, TOOL_DEFINITIONS } from "./tools";
import { mockAgentTurn } from "./mockAgent";
import { openaiAgentTurn } from "./openaiAgent";

export async function runAgentTurn(
  userMessage: string,
  toolkit: AgentToolkit,
  settings: AppSettings,
  chatHistory: { role: "user" | "assistant"; content: string }[]
): Promise<AgentTurn> {
  const integrations = await toolkit.getIntegrations();
  const integrationSummary = integrations
    .map((i) => `- ${i.name} (${i.status}): ${i.capabilities.join(", ")}`)
    .join("\n");

  const system = agentSystemPrompt(integrationSummary || "None connected yet");
  const context = summarizeTasksForAgent(toolkit.getTasks());
  const recentMemory = toolkit
    .getMemory()
    .entries.slice(0, 8)
    .map((e) => e.content)
    .join("\n");

  const enrichedMessage = [
    `Current state: ${context}`,
    recentMemory ? `Recent memory:\n${recentMemory}` : "",
    `User: ${userMessage}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let turn: AgentTurn;
  if (settings.llmProvider === "openai" && settings.openaiApiKey) {
    turn = await openaiAgentTurn(system, enrichedMessage, chatHistory, settings);
  } else {
    turn = await mockAgentTurn(userMessage, toolkit);
  }

  if (turn.toolCalls.length > 0) {
    const { calls, memoriesRecorded, tasksChanged } = await runToolCalls(turn.toolCalls, toolkit);
    turn = {
      ...turn,
      toolCalls: calls,
      memoriesRecorded: turn.memoriesRecorded + memoriesRecorded,
      tasksChanged: turn.tasksChanged + tasksChanged,
    };
  }

  return turn;
}

export { TOOL_DEFINITIONS };
