import type { AgentToolName, AgentTurn } from "../../types/agent";
import type { AppSettings } from "../../types/settings";
import { TOOL_DEFINITIONS, toolCallId } from "./tools";

type ChatMsg = { role: "user" | "assistant"; content: string };

export async function openaiAgentTurn(
  system: string,
  userMessage: string,
  history: ChatMsg[],
  settings: AppSettings
): Promise<AgentTurn> {
  const messages = [
    { role: "system" as const, content: system },
    ...history.slice(-10).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const tools = TOOL_DEFINITIONS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: settings.openaiModel,
      messages,
      tools,
      tool_choice: "auto",
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  const message = data.choices?.[0]?.message;

  const toolCalls = (message?.tool_calls ?? []).map(
    (tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: toolCallId(),
      name: tc.function.name as AgentToolName,
      arguments: JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>,
    })
  );

  return {
    reply: message?.content?.trim() || (toolCalls.length > 0 ? "On it." : "I'm here — what do you need?"),
    toolCalls,
    memoriesRecorded: 0,
    tasksChanged: 0,
  };
}
