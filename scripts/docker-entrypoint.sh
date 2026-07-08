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

# Git sync FIRST — clone GitHub vault before bootstrap so cloud and Mac share one repo
if [ "${VAULT_GIT_SYNC:-false}" = "true" ] && [ -n "${VAULT_GIT_REMOTE:-}" ]; then
  if [ ! -d "$VAULT/.git" ]; then
    echo "[entrypoint] Cloning Brain-Vault from GitHub…"
    rm -rf "$VAULT"
    if git clone "$VAULT_GIT_REMOTE" "$VAULT"; then
      echo "[entrypoint] Clone OK"
    else
      echo "[entrypoint] Clone failed — will bootstrap empty vault (fix VAULT_GIT_REMOTE token)"
      mkdir -p "$VAULT"
    fi
  fi
fi

# Bootstrap only if clone did not provide a vault
if [ ! -f "$VAULT/BRAIN.md" ]; then
  echo "[entrypoint] Bootstrapping Brain-Vault…"
  VAULT_PATH="$VAULT" \
  BRAIN_DATA_DIR="${BRAIN_DATA_DIR:-/app/data/brain}" \
  npm run bootstrap-vault --prefix packages/obisidan-plug || true
fi

# Configure vault git for auto-commit/push (runtime also repairs via ensureVaultGitRepo)
if [ "${VAULT_GIT_SYNC:-false}" = "true" ] && [ -n "${VAULT_GIT_REMOTE:-}" ]; then
  if [ ! -d "$VAULT/.git" ]; then
    git -C "$VAULT" init -b main 2>/dev/null || git -C "$VAULT" init
    git -C "$VAULT" add -A
    git -C "$VAULT" commit -m "brain: cloud bootstrap @ $(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null || true
  fi
  git -C "$VAULT" remote remove origin 2>/dev/null || true
  git -C "$VAULT" remote add origin "$VAULT_GIT_REMOTE"
  git -C "$VAULT" config user.name "Brain Agent"
  git -C "$VAULT" config user.email "brain-agent@localhost"
  git -C "$VAULT" pull origin main --rebase --autostash 2>/dev/null || \
  git -C "$VAULT" pull origin main --allow-unrelated-histories --no-edit 2>/dev/null || \
  git -C "$VAULT" pull origin master --rebase --autostash 2>/dev/null || true
fi

echo "[entrypoint] Starting Life Planner Agent on port ${PORT:-3847}…"
exec npm run start --prefix server
