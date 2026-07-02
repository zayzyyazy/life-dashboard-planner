# Life Planner Agent

A self-hosted personal AI assistant for project planning, memory, reminders, and daily briefs.

Built as a **Node/TypeScript agent backend** with SQLite memory and a local web dashboard. Designed to run always-on on your Mac and integrate with [OpenClaw](https://docs.openclaw.ai/) later as a channel/skill.

## Why not embed OpenClaw?

[OpenClaw](https://github.com/openclaw/openclaw) is a full multi-channel gateway daemon (Telegram, Slack, WebChat, etc.). It's excellent for messaging surfaces, but it's a separate runtime — not a library you embed in an app.

This project is the **project brain + memory + watchers + brief engine**. You can:

- Run it standalone via the local dashboard (MVP)
- Later connect OpenClaw to this HTTP API as a skill/webhook
- Optionally add Telegram via OpenClaw without rewriting core logic

## Features

- **Chat interface** — classify and store project updates, tasks, reminders, decisions
- **SQLite memory** — projects, updates, tasks, reminders, watched repos/folders, daily briefs
- **Project brain** — auto-attach info to Marie, MCP Server, QA Call Analysis, etc.
- **GitHub watcher** — track commits, issues, PRs; save summaries as project updates
- **Folder watcher** — detect local file changes (ignores node_modules, .git, dist, etc.)
- **Daily brief** — generated each morning from updates, tasks, reminders, watchers
- **Email** — SMTP (Gmail) or Resend
- **Security** — no shell access by default; API keys in `.env`

## Requirements

- macOS (or Linux)
- Node.js 22+ (24 recommended)
- OpenAI API key
- Email: Gmail App Password (SMTP) or Resend API key

## Quick Start (Mac)

```bash
# 1. Clone and install
cd life-planner-agent   # or this repo root
npm run install:all

# 2. Configure environment
cp .env.example .env
# Edit .env — add OPENAI_API_KEY, EMAIL_FROM, EMAIL_TO, SMTP_PASS (or Resend)

# 3. Run (server + dashboard)
npm run dev
```

Open **http://localhost:5173** for the dashboard.  
API runs at **http://localhost:3847**.

### Production / always-on

```bash
npm run build
npm start
```

Dashboard is served from the same port (3847) after build.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat` | Chat with agent `{ "message": "..." }` |
| POST | `/capture` | Quick capture `{ "text": "..." }` |
| GET | `/projects` | List projects |
| GET | `/projects/:id` | Project detail + updates/tasks |
| GET | `/tasks` | Open/blocked tasks |
| GET | `/reminders` | Reminders |
| POST | `/watch/github` | `{ "url": "https://github.com/owner/repo" }` |
| POST | `/watch/folder` | `{ "path": "/Users/you/project" }` |
| GET | `/brief/today` | Generate/get today's brief |
| POST | `/brief/send-daily` | Email today's brief |
| POST | `/email/send-test` | Send test email |
| GET | `/health` | Health check |

## Example Chat Commands

```
Add this to the Marie project: call with investor moved to Thursday
Remind me tomorrow to ask Marc about the MCP server
What changed in my projects today?
Watch this GitHub repo: https://github.com/openclaw/openclaw
Send me a daily brief every morning
Add task for next week: review QA call analysis mockups
This is blocked until Marc replies about the API keys
```

## Email Setup

### Gmail (SMTP)

1. Enable 2FA on your Google account
2. Create an [App Password](https://myaccount.google.com/apppasswords)
3. In `.env`:

```
EMAIL_PROVIDER=smtp
EMAIL_FROM=you@gmail.com
EMAIL_TO=you@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
```

### Resend

```
EMAIL_PROVIDER=resend
EMAIL_FROM=onboarding@resend.dev
EMAIL_TO=you@example.com
RESEND_API_KEY=re_xxx
```

Test: click **Test Email** in the dashboard or:

```bash
curl -X POST http://localhost:3847/email/send-test
```

## GitHub Watcher

Optional `GITHUB_TOKEN` increases API rate limits.

```bash
curl -X POST http://localhost:3847/watch/github \
  -H "Content-Type: application/json" \
  -d '{"url":"https://github.com/owner/repo"}'
```

## Folder Watcher

```bash
curl -X POST http://localhost:3847/watch/folder \
  -H "Content-Type: application/json" \
  -d '{"path":"/Users/you/projects/my-app"}'
```

Watched folders use `chokidar` for live changes plus periodic scans.

## Daily Brief

- Cron schedule: `DAILY_BRIEF_CRON` (default `0 7 * * *` = 7 AM)
- Enable via chat: "Send me a daily brief every morning"
- Manual send: **Email Brief** button or `POST /brief/send-daily`

## Auto-start on Mac Login

Create `~/Library/LaunchAgents/com.lifeplanner.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.lifeplanner.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npm</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/life-planner-agent</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/life-planner-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/life-planner-agent.err</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.lifeplanner.agent.plist
```

Adjust `npm` path with `which npm`.

## OpenClaw Integration (Later)

Once OpenClaw is installed (`npm install -g openclaw && openclaw onboard`):

1. Point a webhook or custom skill at `http://localhost:3847/chat`
2. Use OpenClaw for Telegram/WhatsApp; this app remains the memory/brain
3. Keep `ALLOW_SHELL=false` in this service; let OpenClaw handle channel permissions

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────────┐
│  Web Dashboard  │────▶│  Express API (port 3847)         │
│  (Vite/React)   │     │  ├─ Chat + classifier (OpenAI)   │
└─────────────────┘     │  ├─ SQLite memory                │
                        │  ├─ GitHub / folder watchers     │
┌─────────────────┐     │  ├─ Daily brief generator        │
│  OpenClaw       │────▶│  └─ Email (SMTP / Resend)        │
│  (optional)     │     └──────────────────────────────────┘
└─────────────────┘                    │
                                       ▼
                              data/life-planner.db
```

## Models

| Use case | Default model | Env var |
|----------|---------------|---------|
| Classification, summaries | `gpt-4o-mini` | `OPENAI_DEFAULT_MODEL` |
| Daily brief, deep planning | `gpt-4o` | `OPENAI_PLANNING_MODEL` |

## Security

- API keys live in `.env` (never committed)
- No shell/exec by default (`ALLOW_SHELL=false`)
- Agent asks before destructive actions (by system prompt)
- Local-first: SQLite database in `./data/`

## Project Structure

```
server/           Agent backend (Express, SQLite, OpenAI)
src/              React dashboard
data/             SQLite DB (gitignored)
.env.example      Environment template
```

## Author

**zayzyyazy** — https://github.com/zayzyyazy
