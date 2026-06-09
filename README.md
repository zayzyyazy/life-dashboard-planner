# Life Dashboard AI Planner

Local-first AI-assisted life planning desktop app (Tauri v2 + React + TypeScript).

## Run

```bash
cd life-dashboard-planner
npm install
npm run tauri:dev
```

## iPhone Shortcut

1. Open **Settings** in the app
2. Enable shortcut server and copy the Wi‑Fi capture URL
3. Create an iPhone Shortcut:
   - Ask for Input (text)
   - Get Contents of URL — POST to capture URL with JSON body `{"text":"..."}`
4. Captures run through the planner LLM and save as tasks

## Architecture

- `src/lib/plannerProvider.ts` — abstraction (mock now, OpenAI later)
- `src/lib/mockPlannerAssistant.ts` — rule-based planning logic
- `src/lib/storage.ts` — localStorage persistence
- `src-tauri/src/shortcut_server.rs` — HTTP ingress for iPhone Shortcuts

## Author

**zayzyyazy** — https://github.com/zayzyyazy
