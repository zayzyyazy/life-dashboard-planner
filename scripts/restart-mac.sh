#!/bin/bash
# One-command fix + start for Mac. Run from project root:
#   bash scripts/restart-mac.sh
set -e

cd "$(dirname "$0")/.."
echo "=== Life Planner Agent — restart ==="

# Node 22 via fnm
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --use-on-cd)"
  fnm use 22 2>/dev/null || fnm install 22 && fnm use 22
fi

NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d v)
if [ "$NODE_MAJOR" -gt 22 ]; then
  echo "❌ Node $(node -v) — need v22. Run: fnm install 22 && fnm use 22"
  exit 1
fi
echo "✓ Node $(node -v)"

# Kill stuck processes on our ports
echo "Killing old processes on 3847 and 5173..."
lsof -ti :3847 | xargs kill -9 2>/dev/null || true
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
sleep 1

# Install if needed
if [ ! -f server/node_modules/.bin/tsx ]; then
  echo "Installing dependencies..."
  npm run install:all
fi

# Pull latest
git pull origin cursor/life-planner-agent-ab65 2>/dev/null || true

echo ""
echo "Starting server + dashboard..."
echo "  Dashboard: http://localhost:5173"
echo "  API:       http://localhost:3847/health"
echo ""
echo "Press Ctrl+C to stop."
echo ""

npm run dev
