# Mac setup — exact commands

Run these on your MacBook in **Terminal**, in order.

## First time only

```bash
cd ~/Desktop/life-dashboard-planner
```

If the folder doesn't exist yet:

```bash
cd ~/Desktop
git clone https://github.com/zayzyyazy/life-dashboard-planner.git
cd life-dashboard-planner
git checkout cursor/life-planner-agent-ab65
```

Create and edit your secrets file:

```bash
cp .env.example .env
nano .env
```

**Required in `.env`:**
- `OPENAI_API_KEY` — from https://platform.openai.com/api-keys
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `TELEGRAM_ALLOWED_USER_IDS` — your numeric ID from @userinfobot
- `GITHUB_TOKEN` — from GitHub → Settings → Developer settings → Tokens (scope: `repo` or `public_repo`)
- `EMAIL_FROM`, `EMAIL_TO`, `SMTP_PASS` — for daily briefs + reminder emails (Gmail app password)

Save in nano: **Ctrl+O**, Enter, **Ctrl+X**

## Install + configure everything (one command)

```bash
npm run setup
```

This will:
- Install all dependencies (root + server)
- Verify your `.env`
- Enable **daily briefs** (7am email + Telegram)
- Enable **reminder notifications** (email + Telegram when due)
- **Sync your GitHub repos** and start watching them for commits/PRs

## Run the agent

**Development** (dashboard + server, good for testing):

```bash
npm run dev
```

- Dashboard: http://localhost:5173
- API: http://localhost:3847
- Telegram bot: active while this runs

**Production** (always-on, single port):

```bash
npm run start
```

Dashboard + API: http://localhost:3847

---

## What runs automatically while the agent is on

| Feature | Schedule |
|---------|----------|
| GitHub repo checks | Every 30 min |
| Daily brief | 7:00 AM (your `TZ`) → email + Telegram |
| Reminders | Every 5 min when due → email + Telegram |
| Folder watcher | Live + every 15 min |

---

## Test everything works

**New Terminal tab** (keep `npm run dev` running):

```bash
curl http://localhost:3847/health
curl http://localhost:3847/github/status
```

**Telegram:** send `/start` then:

```
Remind me in 2 minutes to test reminders
```

**Dashboard:** http://localhost:5173 → Watchers tab → see your GitHub repos listed

---

## Run 24/7 on your Mac

> **Want it running with your Mac off?** See **[DEPLOY_CLOUD.md](./DEPLOY_CLOUD.md)** — deploy to Railway or Fly (~$5/mo).

The agent needs a process running continuously for Telegram, GitHub checks, briefs, and reminders.

**Important:** If your Mac sleeps, the agent pauses until wake. For true 24/7, either:
- Keep the Mac plugged in and disable sleep: **System Settings → Lock Screen → Turn display off / Prevent automatic sleeping when display is off** (on power adapter), or
- Run on a always-on machine (old Mac mini, VPS, etc.)

### One-time 24/7 install

```bash
cd ~/Desktop/life-dashboard-planner
git pull origin cursor/life-planner-agent-ab65
npm run setup
npm run install:daemon
```

This installs a **LaunchAgent** that:
- Starts automatically when you log in
- Restarts if it crashes (`KeepAlive`)
- Runs Telegram, GitHub watcher, briefs, reminders in the background
- Serves dashboard at **http://localhost:3847**

### Manage the daemon

```bash
# Check it's running
curl http://localhost:3847/health

# View logs
tail -f /tmp/life-planner-agent.log

# Stop 24/7
launchctl unload ~/Library/LaunchAgents/com.lifeplanner.agent.plist

# Start again
launchctl load ~/Library/LaunchAgents/com.lifeplanner.agent.plist
```

### After code updates

```bash
cd ~/Desktop/life-dashboard-planner
git pull origin cursor/life-planner-agent-ab65
npm run install:all
npm run build
launchctl unload ~/Library/LaunchAgents/com.lifeplanner.agent.plist
npm run install:daemon
```

---

## Optional: manual always-on (no LaunchAgent)

```bash
npm run start
```

Keep Terminal open, or use `tmux` / `screen`. LaunchAgent is better for daily use.

---

## Optional: auto-start on Mac login (legacy)

```bash
cd ~/Desktop/life-dashboard-planner
npm run build
./scripts/install-launchagent.sh
```

To stop auto-start:

```bash
launchctl unload ~/Library/LaunchAgents/com.lifeplanner.agent.plist
```

---

## Every time after pulling updates

```bash
cd ~/Desktop/life-dashboard-planner
git pull origin cursor/life-planner-agent-ab65
npm run install:all
npm run setup
npm run dev
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `exit code 127` | `npm run install:all` |
| Chat says no OpenAI key | `nano .env` → add `OPENAI_API_KEY` → restart |
| No GitHub repos | Add `GITHUB_TOKEN` → `npm run setup` |
| Telegram silent | `npm run dev` must be running; check token + user ID |
| Brief not arriving | Say in chat: "Send me a daily brief every morning" OR `npm run setup` |
