# Life Planner Agent

A self-hosted personal AI assistant for project planning, memory, reminders, and daily briefs.

Built as a **Node/TypeScript agent backend** with SQLite memory and a local web dashboard. Designed to run always-on on your Mac and integrate with [OpenClaw](https://docs.openclaw.ai/) later as a channel/skill.

## Why not embed OpenClaw?

[OpenClaw](https://github.com/openclaw/openclaw) is a full multi-channel gateway daemon (Telegram, Slack, WebChat, etc.). It's excellent for messaging surfaces, but it's a separate runtime — not a library you embed in an app.

This project is the **project brain + memory + watchers + brief engine**. You can:

- Run it standalone via the local dashboard
- Chat from your phone via **Telegram** (first-class channel)
- Later connect OpenClaw to this HTTP API as a skill/webhook (optional)

## Features

- **Chat interface** — local dashboard + Telegram (text and voice notes)
- **SQLite memory** — projects, updates, tasks, reminders, watched repos/folders, daily briefs
- **Project brain** — auto-attach info to Marie, MCP Server, QA Call Analysis, etc.
- **GitHub watcher** — track commits, issues, PRs; save summaries as project updates
- **Folder watcher** — detect local file changes (ignores node_modules, .git, dist, etc.)
- **Daily brief** — generated each morning from updates, tasks, reminders, watchers
- **Email** — SMTP (Gmail) or Resend
- **Telegram** — text, voice transcription, commands; same brain as `POST /chat`
- **Security** — no shell access by default; API keys in `.env`; Telegram user ID allowlist

## Requirements

- macOS (or Linux)
- Node.js 22+ (24 recommended)
- OpenAI API key
- Email: Gmail App Password (SMTP) or Resend API key
- Telegram bot token (for phone chat)

## Quick Start (Mac)

```bash
# 1. Clone and install
cd life-planner-agent   # or this repo root
npm run install:all

# 2. Configure environment
cp .env.example .env
# Edit .env — add OPENAI_API_KEY, EMAIL_FROM, EMAIL_TO, SMTP_PASS (or Resend)
# For Telegram: TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_IDS

# 3. Run (server + dashboard)
npm run dev
```

Open **http://localhost:5173** for the dashboard.  
API runs at **http://localhost:3847**.

### Troubleshooting

**`npm run dev:server exited with code 127`** — server dependencies not installed. Fix:

```bash
npm run install:all
npm run dev
```

**Chat says `OPENAI_API_KEY is not set`** — run `npm run check-env` and add your key to `.env`.

**Server won't start after install** — make sure Node.js 22+ is installed (`node -v`).

### Production / always-on

```bash
npm run build
npm start
```

Dashboard is served from the same port (3847) after build.

## Telegram Setup

Telegram messages go through the **same pipeline as `POST /chat`** — same classifier, memory, project brain, reminders, and brief system. No separate Telegram-only flow.

### Step-by-step

1. Open **Telegram** on your phone or desktop
2. Search for **@BotFather**
3. Send `/newbot`
4. Choose a **bot name** (display name, e.g. `My Life Planner`)
5. Choose a **bot username** ending in `bot` (e.g. `my_life_planner_bot`)
6. Copy the **bot token** BotFather gives you
7. Add to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
   ```
8. Get your **Telegram user ID**:
   - Message **@userinfobot** on Telegram and copy your numeric ID, or
   - Start the app without `TELEGRAM_ALLOWED_USER_IDS` set — the bot logs your user ID on first message and tells you what to add
9. Add to `.env`:
   ```
   TELEGRAM_ALLOWED_USER_IDS=123456789
   ```
   (Comma-separate multiple IDs if needed.)
10. Restart the server: `npm run dev`
11. Open Telegram, find your bot, send `/start`
12. Confirm the bot replies

### Telegram quick setup

1. Create bot with @BotFather
2. Copy token into `.env`
3. Get my Telegram user ID
4. Add it to `TELEGRAM_ALLOWED_USER_IDS`
5. Run:
   ```bash
   npm run dev
   ```
6. Open Telegram and send:
   ```
   /start
   ```
7. Test text:
   ```
   Add this to Life Planner Agent: Telegram integration is working.
   ```
8. Test voice note:
   Send a short voice note saying a reminder.
9. Check dashboard:
   http://localhost:5173

### Telegram commands

| Command | Description |
|---------|-------------|
| `/start` | Introduction |
| `/brief` | Today's daily brief |
| `/projects` | List saved projects |
| `/tasks` | Open tasks |
| `/reminders` | Upcoming reminders |
| `/watchrepo <url>` | Add GitHub repo watcher |
| `/help` | Example messages |

### Voice notes

Voice notes are downloaded from Telegram, transcribed with OpenAI (`OPENAI_TRANSCRIPTION_MODEL`, default `whisper-1`), then passed into the same chat pipeline. The bot replies:

> I heard: [short transcript]. Saved as reminder.

If transcription fails:

> I received the voice note but couldn't transcribe it. Please resend as text.

### Authorization

Only user IDs in `TELEGRAM_ALLOWED_USER_IDS` can use the bot. Everyone else gets **"Not authorized."** and the message is **not** sent to the LLM. Blocked chat IDs are logged to the server console.

### Telegram environment variables

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=
TELEGRAM_ENABLE_VOICE=true
TELEGRAM_ENABLE_TEXT=true
TELEGRAM_ENABLE_COMMANDS=true
OPENAI_TRANSCRIPTION_MODEL=whisper-1
```

Check status: `GET /telegram/status` or the **Watchers** tab in the dashboard.

### One chat, one brain

**Telegram:** You have one continuous chat thread with your bot — every text message and voice note appears in that same Telegram conversation, in order.

**Shared memory:** Telegram, the local dashboard, and `POST /chat` all use the same SQLite database. When you add a task on Telegram, it shows up in the dashboard. When you save something in chat, the agent knows it on Telegram too.

**What the agent remembers:** Your profile ("About you"), knowledge notes, projects, tasks, reminders, and project updates persist across all channels. Every message is logged in `agent_messages`.

**Idle check-in:** When the Mac agent is running and you haven't sent an update in ~2 hours, you'll get a Telegram message: *"Been a while — want to update me…?"* Configure with `IDLE_NUDGE_HOURS` in `.env`.

**Load your personal context:**

```bash
npm run seed:profile -- --force   # overwrite profile from seed file
```

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
| GET | `/telegram/status` | Telegram bot status (no token exposed) |
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

OpenClaw is optional. **Telegram is built in** — you don't need OpenClaw for phone chat.

If you later install OpenClaw (`npm install -g openclaw && openclaw onboard`):

1. Point a webhook or custom skill at `http://localhost:3847/chat`
2. Use OpenClaw for additional channels (WhatsApp, Slack, etc.)
3. Keep `ALLOW_SHELL=false` in this service; let OpenClaw handle channel permissions

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────────┐
│  Web Dashboard  │────▶│  Express API (port 3847)         │
│  (Vite/React)   │     │  ├─ Chat + classifier (OpenAI)   │
└─────────────────┘     │  ├─ SQLite memory                │
                        │  ├─ GitHub / folder watchers     │
┌─────────────────┐     │  ├─ Daily brief generator        │
│  Telegram Bot   │────▶│  └─ Email (SMTP / Resend)        │
│  (phone)        │     └──────────────────────────────────┘
└─────────────────┘                    │
                                       ▼
                              data/life-planner.db
```

## Models

| Use case | Default model | Env var |
|----------|---------------|---------|
| Classification, summaries | `gpt-4o-mini` | `OPENAI_DEFAULT_MODEL` |
| Daily brief, deep planning | `gpt-4o` | `OPENAI_PLANNING_MODEL` |
| Voice transcription | `whisper-1` | `OPENAI_TRANSCRIPTION_MODEL` |

## Security

- API keys live in `.env` (never committed)
- No shell/exec by default (`ALLOW_SHELL=false`)
- Agent asks before destructive actions (by system prompt)
- Local-first: SQLite database in `./data/`

## Project Structure

```
server/
  src/
    services/       chat, memory, openai (shared brain)
    telegram/       bot, handlers, voice
    routes/         HTTP endpoints
src/                React dashboard
data/               SQLite DB (gitignored)
.env.example
```

## Author

**zayzyyazy** — https://github.com/zayzyyazy
