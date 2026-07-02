#!/bin/sh
set -e
cd /app
mkdir -p "${DATA_DIR:-/app/data}"

if [ ! -f "${DATA_DIR:-/app/data}/.initialized" ]; then
  echo "[entrypoint] First run — syncing GitHub repos and enabling briefs/reminders…"
  npm run setup --prefix server || true
  touch "${DATA_DIR:-/app/data}/.initialized"
fi

echo "[entrypoint] Starting Life Planner Agent on port ${PORT:-3847}…"
exec npm run start --prefix server
