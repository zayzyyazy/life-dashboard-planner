#!/bin/bash
# Production daemon — server only, no rebuild (for 24/7 LaunchAgent)
set -e
cd "$(dirname "$0")/.."

# fnm / nvm — LaunchAgents get a minimal PATH
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --use-on-cd)"
  fnm use 22 2>/dev/null || true
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh"
  nvm use 22 2>/dev/null || true
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[daemon] ERROR: node not found in PATH. Install Node 22 (fnm install 22)." >&2
  exit 127
fi

NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d v)
if [ "$NODE_MAJOR" -gt 22 ]; then
  echo "[daemon] ERROR: Node $(node -v) — need v22.x for better-sqlite3." >&2
  exit 1
fi

node scripts/ensure-deps.mjs
if [ ! -d dist ]; then
  echo "[daemon] Building dashboard (first run)…"
  npm run build:dashboard
fi
cd server && exec npx tsx src/index.ts
