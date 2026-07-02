#!/bin/bash
# Install LaunchAgent to run Life Planner Agent on Mac login
set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.lifeplanner.agent.plist"
NPM_PATH="$(which npm)"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.lifeplanner.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NPM_PATH</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_DIR</string>
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
echo "Installed LaunchAgent: $PLIST"
echo "Logs: /tmp/life-planner-agent.log"
