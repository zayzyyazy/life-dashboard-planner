#!/bin/sh
set -e
cd /app
mkdir -p "${DATA_DIR:-/app/data}"
mkdir -p "${BRAIN_DATA_DIR:-/app/data/brain}"
mkdir -p "${VAULT_PATH:-/app/data/Brain-Vault}"

if [ ! -f "${DATA_DIR:-/app/data}/.initialized" ]; then
  echo "[entrypoint] First run — syncing GitHub repos and enabling briefs/reminders…"
  npm run setup --prefix server || true
  touch "${DATA_DIR:-/app/data}/.initialized"
fi

VAULT="${VAULT_PATH:-/app/data/Brain-Vault}"

# First boot with git sync: clone the existing vault from the remote
if [ "${VAULT_GIT_SYNC:-false}" = "true" ] && [ -n "${VAULT_GIT_REMOTE:-}" ] && [ ! -d "$VAULT/.git" ]; then
  if [ ! -f "$VAULT/BRAIN.md" ]; then
    echo "[entrypoint] Cloning Brain-Vault from remote…"
    rm -rf "$VAULT" && git clone "$VAULT_GIT_REMOTE" "$VAULT" || mkdir -p "$VAULT"
  fi
  if [ ! -d "$VAULT/.git" ]; then
    echo "[entrypoint] Clone failed or vault pre-existing — initializing git repo…"
    git -C "$VAULT" init -b main
  fi
fi

# Bootstrap Obsidian vault if still empty (no git sync, or clone failed)
if [ ! -f "$VAULT/BRAIN.md" ]; then
  echo "[entrypoint] Bootstrapping Brain-Vault…"
  VAULT_PATH="$VAULT" \
  BRAIN_DATA_DIR="${BRAIN_DATA_DIR:-/app/data/brain}" \
  npm run bootstrap-vault --prefix packages/obisidan-plug || true
fi

# Configure vault git for auto-commit/push
if [ "${VAULT_GIT_SYNC:-false}" = "true" ] && [ -n "${VAULT_GIT_REMOTE:-}" ] && [ -d "$VAULT/.git" ]; then
  # Keep remote URL in sync with env (allows rotating the token)
  git -C "$VAULT" remote remove origin 2>/dev/null || true
  git -C "$VAULT" remote add origin "$VAULT_GIT_REMOTE"
  # Git identity so auto-commits work in the container
  git -C "$VAULT" config user.name "Brain Agent"
  git -C "$VAULT" config user.email "brain-agent@localhost"
  # Pull latest from remote on startup (best-effort)
  git -C "$VAULT" pull origin main --rebase 2>/dev/null || \
  git -C "$VAULT" pull origin master --rebase 2>/dev/null || true
fi

echo "[entrypoint] Starting Life Planner Agent on port ${PORT:-3847}…"
exec npm run start --prefix server
