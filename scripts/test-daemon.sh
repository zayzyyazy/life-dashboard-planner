#!/bin/bash
# Test daemon startup the same way LaunchAgent runs it (minimal env)
set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.lifeplanner.agent.plist"

if [ ! -f "$PLIST" ]; then
  echo "No LaunchAgent plist yet. Run: npm run install:daemon"
  exit 1
fi

NODE_BIN=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:NODE_BIN" "$PLIST" 2>/dev/null || echo "")
TSX_BIN=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:TSX_BIN" "$PLIST" 2>/dev/null || echo "")
FNM_DIR=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:FNM_DIR" "$PLIST" 2>/dev/null || echo "")
ENV_FILE=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:LIFE_PLANNER_ENV_FILE" "$PLIST" 2>/dev/null || echo "")

echo "=== Daemon test (LaunchAgent-like env) ==="
echo "NODE_BIN: $NODE_BIN"
echo "TSX_BIN:  $TSX_BIN"
echo "ENV:      $ENV_FILE"
echo ""

export NODE_BIN TSX_BIN FNM_DIR LIFE_PLANNER_ENV_FILE="$ENV_FILE"
export PATH="$(dirname "$NODE_BIN"):/usr/bin:/bin"
export HOME="$HOME"

exec bash "$PROJECT_DIR/scripts/start-daemon.sh"
