#!/bin/bash
# Move project off Desktop (macOS blocks LaunchAgents from Desktop) and reinstall daemon.
set -e

CURRENT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$HOME/life-dashboard-planner}"
UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"
PLIST="$HOME/Library/LaunchAgents/com.lifeplanner.agent.plist"

case "$CURRENT" in
  "$HOME/Desktop/"*|"*/Desktop/"*) ;;
  *)
    echo "Project is not on Desktop ($CURRENT)."
    echo "If daemon still fails, run: npm run install:daemon"
    exit 0
    ;;
esac

if [ "$CURRENT" = "$TARGET" ]; then
  echo "Already at $TARGET"
  exit 0
fi

if [ -e "$TARGET" ]; then
  echo "❌ Target already exists: $TARGET"
  echo "   Pick another path: bash scripts/migrate-off-desktop.sh ~/Developer/life-dashboard-planner"
  exit 1
fi

echo "=== Move off Desktop (required for 24/7 daemon) ==="
echo "From: $CURRENT"
echo "To:   $TARGET"
echo ""

# Stop daemon if loaded
launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true

echo "Moving project…"
mv "$CURRENT" "$TARGET"

cd "$TARGET"

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --use-on-cd)"
  fnm use 22 2>/dev/null || true
fi

echo "Reinstalling daemon from new location…"
npm run install:daemon

echo ""
echo "✓ Done. New project path:"
echo "  cd $TARGET"
echo ""
echo "Update your habit — always cd to the new path, not Desktop."
