#!/bin/bash
# Install macOS LaunchAgent for 24/7 Life Planner Agent
set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.lifeplanner.agent.plist"
DAEMON_SCRIPT="$PROJECT_DIR/scripts/start-daemon.sh"
UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"

# fnm path for LaunchAgent environment
FNM_PATH=""
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --use-on-cd)"
  fnm use 22 2>/dev/null || true
  FNM_PATH="$(dirname "$(command -v node)")"
fi

echo "Building dashboard…"
cd "$PROJECT_DIR"
npm run build:dashboard

chmod +x "$DAEMON_SCRIPT"

# Stop dev server if running — only one process can poll Telegram
if lsof -ti :3847 >/dev/null 2>&1; then
  echo "Stopping process on port 3847 (dev server must not run alongside daemon)…"
  lsof -ti :3847 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

EXTRA_PATH="${FNM_PATH:+$FNM_PATH:}/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"

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
  </dict>
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
EOF

# Modern macOS: bootstrap/bootout (load/unload often fails with I/O error)
launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
sleep 0.5

if launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null; then
  LOAD_OK=1
elif launchctl load "$PLIST" 2>/dev/null; then
  LOAD_OK=1
else
  LOAD_OK=0
  echo ""
  echo "❌ LaunchAgent failed to start. Try manually:"
  echo "   launchctl bootstrap $DOMAIN $PLIST"
  echo "   tail -f /tmp/life-planner-agent.err"
  exit 1
fi

sleep 2
if curl -sf "http://127.0.0.1:3847/health" >/dev/null 2>&1; then
  HEALTH_OK=1
else
  HEALTH_OK=0
fi

echo ""
if [ "$HEALTH_OK" = 1 ]; then
  echo "✓ Life Planner Agent installed and running (24/7)"
else
  echo "⚠ LaunchAgent loaded but health check failed — check logs:"
fi
echo "  Dashboard + API: http://localhost:3847"
echo "  Logs:  tail -f /tmp/life-planner-agent.log"
echo "  Errors: tail -f /tmp/life-planner-agent.err"
echo ""
echo "Stop:  launchctl bootout $DOMAIN $PLIST"
echo "Start: launchctl bootstrap $DOMAIN $PLIST"
