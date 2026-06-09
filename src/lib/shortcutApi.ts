import { invoke } from "@tauri-apps/api/core";

export type ShortcutServerConfig = {
  enabled: boolean;
  port: number;
  token: string;
};

export const shortcutApi = {
  configure: (config: ShortcutServerConfig) =>
    invoke<void>("configure_shortcut_server", { config }),

  getLocalIp: () => invoke<string>("get_local_ip"),

  testCapture: (text: string) =>
    invoke<{ ok: boolean; message: string }>("test_shortcut_capture", { text }),
};

export function buildCaptureUrl(port: number, token: string, host = "127.0.0.1"): string {
  return `http://${host}:${port}/capture?token=${encodeURIComponent(token)}`;
}

export function shortcutInstructions(port: number, token: string, host: string): string {
  const url = buildCaptureUrl(port, token, host);
  return [
    "iPhone Shortcut Setup:",
    "",
    "1. Open Shortcuts → New Shortcut",
    "2. Add 'Ask for Input' (text) — e.g. 'What do you need to plan?'",
    "3. Add 'Get Contents of URL'",
    `   URL: ${url}`,
    "   Method: POST",
    "   Headers: Content-Type = application/json",
    `   Request Body: {"text":"[Ask for Input]"}`,
    "4. Optional: Add 'Show Notification' with response",
    "",
    "While Life Dashboard is open on your Mac, voice or text captures",
    "go through the planner LLM and save as tasks automatically.",
    "",
    `Token: ${token}`,
  ].join("\n");
}
