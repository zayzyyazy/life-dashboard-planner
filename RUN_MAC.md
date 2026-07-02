# Run on Mac — copy/paste this entire block into Terminal

```bash
cd ~/Desktop/life-dashboard-planner
git pull origin cursor/life-planner-agent-ab65
bash scripts/restart-mac.sh
```

That's it. Leave Terminal open.

---

## When it's working you'll see:

```
[server] Life Planner Agent running at http://127.0.0.1:3847
[dashboard] Local: http://localhost:5173/
```

Open **http://localhost:5173** and chat.

---

## Test (new Terminal tab):

```bash
curl http://127.0.0.1:3847/health
```

Must return: `{"status":"ok"...}`

---

## First time only — if `.env` missing:

```bash
cp .env.example .env
nano .env
```

Add your keys, then run `bash scripts/restart-mac.sh` again.

---

## fnm not set up yet?

```bash
echo 'eval "$(fnm env --use-on-cd)"' >> ~/.zshrc
source ~/.zshrc
fnm install 22
fnm use 22
```

Then run restart script again.

---

## Load personal context (after pull):

```bash
npm run seed:profile -- --force
```

---

## Run in background when Mac is on (24/7 while laptop awake):

```bash
npm run install:daemon
```

Starts on login, restarts if it crashes. Logs: `~/Library/Logs/life-planner-agent.log`

To stop: `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.lifeplanner.agent.plist`

**Important:** Don't run `npm run dev` and the daemon at the same time — Telegram only allows one bot connection.
