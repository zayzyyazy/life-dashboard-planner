#!/bin/bash
# Install macOS LaunchAgent for 24/7 Life Planner Agent
set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.lifeplanner.agent.plist"
DAEMON_SCRIPT="$PROJECT_DIR/scripts/start-daemon.sh"
UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"
ENV_FILE="$PROJECT_DIR/.env"

# Node 22 via fnm (install-time only — paths baked into plist)
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --use-on-cd)"
  fnm use 22 2>/dev/null || true
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "❌ node not found. Install Node 22: fnm install 22 && fnm use 22"
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d v)
if [ "$NODE_MAJOR" -gt 22 ]; then
  echo "❌ Node $(node -v) — need v22.x for better-sqlite3"
  exit 1
fi

TSX_BIN="$PROJECT_DIR/server/node_modules/.bin/tsx"
if [ ! -f "$TSX_BIN" ]; then
  echo "Installing server dependencies…"
  npm run install:all
fi
if [ ! -f "$TSX_BIN" ]; then
  echo "❌ tsx not found. Run: npm run install:all"
  exit 1
fi

# macOS blocks LaunchAgents from Desktop — fail fast with fix
case "$PROJECT_DIR" in
  "$HOME/Desktop/"*|"*/Desktop/"*)
    echo ""
    echo "❌ Cannot install 24/7 daemon while project is on Desktop."
    echo "   macOS blocks background apps from reading Desktop (Operation not permitted)."
    echo ""
    echo "Fix — one command:"
    echo "  bash scripts/migrate-off-desktop.sh"
    echo ""
    echo "Or manually:"
    echo "  launchctl bootout $DOMAIN $PLIST 2>/dev/null || true"
    echo "  mv \"$PROJECT_DIR\" \"$HOME/life-dashboard-planner\""
    echo "  cd \"$HOME/life-dashboard-planner\" && npm run install:daemon"
    echo ""
    exit 1
    ;;
esac

echo "Building dashboard…"
cd "$PROJECT_DIR"
npm run build:dashboard

chmod +x "$DAEMON_SCRIPT"

# Stop dev server — only one Telegram poller allowed
if lsof -ti :3847 >/dev/null 2>&1; then
  echo "Stopping process on port 3847…"
  lsof -ti :3847 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

NODE_DIR="$(dirname "$NODE_BIN")"
FNM_DIR="${FNM_DIR:-$HOME/.local/share/fnm}"
EXTRA_PATH="$NODE_DIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.lifeplanner.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DAEMON_SCRIPT</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$EXTRA_PATH</string>
    <key>HOME</key>
    <string>$HOME</string>
    <key>NODE_BIN</key>
    <string>$NODE_BIN</string>
    <key>TSX_BIN</key>
    <string>$TSX_BIN</string>
    <key>FNM_DIR</key>
    <string>$FNM_DIR</string>
    <key>LIFE_PLANNER_ENV_FILE</key>
    <string>$ENV_FILE</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>/tmp/life-planner-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/life-planner-agent.err</string>
</dict>
</plist>
EOF

launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
sleep 0.5

if ! launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null; then
  if ! launchctl load "$PLIST" 2>/dev/null; then
    echo ""
    echo "❌ LaunchAgent failed to start. Try:"
    echo "   launchctl bootstrap $DOMAIN $PLIST"
    exit 1
  fi
fi

# Wait up to 15s for health
HEALTH_OK=0
for i in $(seq 1 15); do
  if curl -sf "http://127.0.0.1:3847/health" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done

echo ""
if [ "$HEALTH_OK" = 1 ]; then
  echo "✓ Life Planner Agent installed and running (24/7)"
else
  echo "⚠ LaunchAgent loaded but health check failed."
  echo ""
  echo "Last log lines:"
  tail -15 /tmp/life-planner-agent.log 2>/dev/null || echo "  (no stdout log)"
  echo ""
  echo "Last errors:"
  tail -15 /tmp/life-planner-agent.err 2>/dev/null || echo "  (no stderr log)"
  echo ""
  echo "Try manual start to see the error:"
  echo "  bash $DAEMON_SCRIPT"
fi
echo ""
echo "  Dashboard + API: http://localhost:3847"
echo "  Logs:  tail -f /tmp/life-planner-agent.log"
echo "  Errors: tail -f /tmp/life-planner-agent.err"
echo ""
echo "Stop:  launchctl bootout $DOMAIN $PLIST"
echo "Start: launchctl bootstrap $DOMAIN $PLIST"

if [ "$HEALTH_OK" != 1 ]; then
  exit 1
fi
