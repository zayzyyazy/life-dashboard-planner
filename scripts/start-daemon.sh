#!/bin/bash
# Production daemon — server only (for 24/7 LaunchAgent)
# Uses NODE_BIN / TSX_BIN from plist when set at install time.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

log() { echo "[daemon $(date '+%H:%M:%S')] $*"; }

resolve_node() {
  if [ -n "${NODE_BIN:-}" ] && [ -x "$NODE_BIN" ]; then
    echo "$NODE_BIN"
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  # fnm without fnm CLI on PATH (LaunchAgent)
  local fnm_root="${FNM_DIR:-$HOME/.local/share/fnm}"
  if [ -x "$fnm_root/aliases/default/bin/node" ]; then
    echo "$fnm_root/aliases/default/bin/node"
    return 0
  fi
  return 1
}

NODE="$(resolve_node)" || {
  log "ERROR: node not found. Re-run: npm run install:daemon"
  exit 127
}

export PATH="$(dirname "$NODE"):$PATH"

NODE_MAJOR=$("$NODE" -v | cut -d. -f1 | tr -d v)
if [ "$NODE_MAJOR" -gt 22 ]; then
  log "ERROR: Node $("$NODE" -v) — need v22.x. Run: fnm use 22"
  exit 1
fi

TSX="${TSX_BIN:-$PROJECT_DIR/server/node_modules/.bin/tsx}"
if [ ! -f "$TSX" ]; then
  log "Installing server dependencies…"
  "$NODE" scripts/ensure-deps.mjs
fi
if [ ! -f "$TSX" ]; then
  log "ERROR: tsx not found at $TSX — run: npm run install:all"
  exit 1
fi

if [ ! -d dist ]; then
  log "Building dashboard (first run)…"
  npm run build:dashboard
fi

if [ ! -f "$PROJECT_DIR/.env" ]; then
  log "WARNING: .env not found at $PROJECT_DIR/.env"
fi

log "Starting server with Node $("$NODE" -v)"
log "Project: $PROJECT_DIR"
exec "$NODE" "$TSX" "$PROJECT_DIR/server/src/index.ts"
