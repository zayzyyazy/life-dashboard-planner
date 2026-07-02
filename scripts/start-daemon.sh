#!/bin/bash
# Production daemon — server only, no rebuild (for 24/7 LaunchAgent)
set -e
cd "$(dirname "$0")/.."
node scripts/ensure-deps.mjs
if [ ! -d dist ]; then
  echo "[daemon] Building dashboard (first run)…"
  npm run build:dashboard
fi
cd server && exec npx tsx src/index.ts
