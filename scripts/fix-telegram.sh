#!/bin/bash
# Fix dead Telegram — kill stuck process, restart daemon, verify bot.
set -e
cd "$(dirname "$0")/.."

echo "=== Fix Telegram ==="

# fnm
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --use-on-cd)"
  fnm use 22 2>/dev/null || true
fi

UID_NUM="$(id -u)"
PLIST="$HOME/Library/LaunchAgents/com.lifeplanner.agent.plist"
DOMAIN="gui/$UID_NUM"

echo "1. Stopping anything on port 3847..."
lsof -ti :3847 | xargs kill -9 2>/dev/null || true
sleep 1

echo "2. Restarting daemon..."
if [ -f "$PLIST" ]; then
  launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
  sleep 1
  launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null || launchctl load "$PLIST" 2>/dev/null || true
else
  echo "   No LaunchAgent — run: npm run install:daemon"
  exit 1
fi

echo "3. Waiting for server..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf http://127.0.0.1:3847/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo ""
echo "=== Health ==="
curl -s http://127.0.0.1:3847/health 2>/dev/null | python3 -m json.tool 2>/dev/null || curl -s http://127.0.0.1:3847/health || echo "FAILED — server not up"

echo ""
echo "=== Telegram status ==="
curl -s http://127.0.0.1:3847/telegram/status 2>/dev/null | python3 -m json.tool 2>/dev/null || curl -s http://127.0.0.1:3847/telegram/status || echo "FAILED"

echo ""
echo "=== Last log lines ==="
tail -15 /tmp/life-planner-agent.log 2>/dev/null || echo "(no log)"
echo ""
tail -10 /tmp/life-planner-agent.err 2>/dev/null || echo "(no errors)"

echo ""
if curl -sf http://127.0.0.1:3847/telegram/status 2>/dev/null | grep -q '"enabled":true'; then
  echo "✓ Telegram should be live — send /start to your bot"
else
  echo "⚠ Telegram not enabled. Check:"
  echo "  - TELEGRAM_BOT_TOKEN in .env"
  echo "  - TELEGRAM_ALLOWED_USER_IDS in .env"
  echo "  - Only ONE instance running (no npm run dev at same time)"
  echo "  - tail -f /tmp/life-planner-agent.err"
fi
