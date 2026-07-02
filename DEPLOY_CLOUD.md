# Run without your Mac on (cloud deploy)

Your Mac can be off. The agent runs on an **always-on server** in the cloud (~$5/month).

## What works in the cloud

| Feature | Cloud |
|---------|-------|
| Telegram (text + voice) | ✅ |
| GitHub repo watching | ✅ |
| Daily briefs (email + Telegram) | ✅ |
| Reminders (email + Telegram) | ✅ |
| Project memory / chat | ✅ |
| Dashboard (browser) | ✅ public URL |
| **Local Mac folder watching** | ❌ paths don't exist on server |

---

## Before you deploy — stop the Mac copy

Only **one** process can use your Telegram bot token.

On your Mac:

```bash
launchctl unload ~/Library/LaunchAgents/com.lifeplanner.agent.plist 2>/dev/null
# Stop any npm run dev terminal (Ctrl+C)
```

---

## Option A: Railway (easiest, ~$5/mo)

1. Push this repo to GitHub (branch `cursor/life-planner-agent-ab65`)
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select your repo
4. **Variables** — add everything from your `.env`:
   - `OPENAI_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_ALLOWED_USER_IDS`
   - `GITHUB_TOKEN`
   - `EMAIL_FROM`, `EMAIL_TO`, `SMTP_PASS` (or Resend)
   - `TZ=America/New_York` (or your timezone)
   - `DATA_DIR=/app/data`
5. **Volumes** → Add volume → mount at `/app/data` (keeps SQLite + memory)
6. Deploy — Railway builds the Dockerfile automatically
7. **Settings → Networking → Generate domain** — open `https://your-app.up.railway.app`

Test:

```bash
curl https://your-app.up.railway.app/health
```

Telegram works immediately — no Mac needed.

---

## Option B: Fly.io (~$5/mo)

Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/), then:

```bash
cd ~/Desktop/life-dashboard-planner
git pull origin cursor/life-planner-agent-ab65

fly launch --no-deploy
fly volumes create life_planner_data --size 1 --region iad

# Set secrets from your .env (one per line: KEY=value)
fly secrets set OPENAI_API_KEY=sk-... TELEGRAM_BOT_TOKEN=... TELEGRAM_ALLOWED_USER_IDS=... GITHUB_TOKEN=ghp_...

fly deploy
```

Open: `fly open` or `https://life-planner-agent.fly.dev`

---

## Option C: Any VPS ($4–6/mo)

Hetzner, DigitalOcean, etc.:

```bash
# On the server
git clone https://github.com/zayzyyazy/life-dashboard-planner.git
cd life-dashboard-planner
git checkout cursor/life-planner-agent-ab65

cp .env.example .env
nano .env   # paste your keys

docker compose up -d
```

Uses `docker-compose.yml` in this repo.

---

## After deploy — verify

1. `curl https://YOUR-URL/health` → `{"status":"ok"}`
2. Telegram → `/start` → bot replies
3. `curl https://YOUR-URL/github/status` → repos listed
4. Say: `Remind me in 5 minutes to test cloud reminders`

---

## Mac vs cloud — how to use both

| Use Mac for | Use cloud for |
|-------------|---------------|
| Editing code | 24/7 Telegram |
| Local folder watching | GitHub watching |
| Dev testing (`npm run dev`) | Briefs + reminders while laptop closed |

**Rule:** Run the agent in **one place only** (cloud OR Mac), not both — especially for Telegram.

---

## Updating the cloud agent

**Railway:** push to GitHub → auto-redeploys

**Fly:**

```bash
git pull
fly deploy
```

**Docker VPS:**

```bash
git pull && docker compose up -d --build
```
