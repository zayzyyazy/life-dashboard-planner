#!/bin/bash
# Install macOS LaunchAgent for 24/7 Life Planner Agent
set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.lifeplanner.agent.plist"
DAEMON_SCRIPT="$PROJECT_DIR/scripts/start-daemon.sh"
NODE_PATH="$(which node)"
NPM_PATH="$(which npm)"

echo "Building dashboard…"
cd "$PROJECT_DIR"
npm run build:dashboard

chmod +x "$DAEMON_SCRIPT"

# LaunchAgents get a minimal PATH — use full paths
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
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH</key>
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

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo ""
echo "✓ Life Planner Agent installed for 24/7"
echo "  Dashboard + API: http://localhost:3847"
echo "  Logs:  tail -f /tmp/life-planner-agent.log"
echo "  Errors: tail -f /tmp/life-planner-agent.err"
echo ""
echo "Stop:  launchctl unload $PLIST"
echo "Start: launchctl load $PLIST"
