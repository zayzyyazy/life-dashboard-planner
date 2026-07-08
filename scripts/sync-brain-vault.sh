#!/bin/bash
# Mac ↔ GitHub ↔ Railway vault sync. Safe to run on a timer (LaunchAgent).
set -euo pipefail

VAULT="${VAULT_PATH:-$HOME/Documents/Brain-Vault}"
LOG="${BRAIN_VAULT_SYNC_LOG:-$HOME/Library/Logs/brain-vault-sync.log}"
INTERVAL_TAG="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

log() {
  echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"
}

if [ ! -d "$VAULT/.git" ]; then
  log "skip — no git repo at $VAULT (run: bash scripts/init-brain-vault-git.sh REMOTE_URL)"
  exit 0
fi

cd "$VAULT"

if ! git remote get-url origin >/dev/null 2>&1; then
  log "skip — no origin remote"
  exit 0
fi

BRANCH="$(git branch --show-current 2>/dev/null || echo main)"
if [ -z "$BRANCH" ]; then
  BRANCH=main
fi

# Commit local Obsidian edits (workspace files are gitignored)
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  git add -A
  if git diff --cached --quiet; then
    :
  else
    git commit -m "mac: vault edits @ $INTERVAL_TAG" || log "commit skipped (nothing to commit)"
  fi
fi

PULL_OK=0
if git pull --rebase origin "$BRANCH" >>"$LOG" 2>&1; then
  PULL_OK=1
elif git pull --rebase origin main >>"$LOG" 2>&1; then
  BRANCH=main
  PULL_OK=1
elif git pull --rebase origin master >>"$LOG" 2>&1; then
  BRANCH=master
  PULL_OK=1
fi

if [ "$PULL_OK" -eq 0 ]; then
  log "pull failed — check $LOG (merge conflict? fix in Obsidian then retry)"
  exit 1
fi

AHEAD="$(git rev-list --count "@{u}..HEAD" 2>/dev/null || echo 0)"
if [ "${AHEAD:-0}" -gt 0 ]; then
  if git push origin "HEAD:$BRANCH" >>"$LOG" 2>&1; then
    log "synced — pulled + pushed ($BRANCH)"
  else
    log "pull ok, push failed — auth? For private repo use SSH or: git remote set-url origin https://TOKEN@github.com/you/brain-vault.git"
    exit 1
  fi
else
  log "synced — pulled latest ($BRANCH)"
fi
