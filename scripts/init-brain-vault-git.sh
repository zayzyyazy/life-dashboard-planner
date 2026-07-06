#!/bin/bash
# One-time: init Brain-Vault as a private git repo for Mac ↔ cloud sync
set -e

VAULT="${VAULT_PATH:-$HOME/Documents/Brain-Vault}"
REMOTE="${1:-}"

if [ ! -d "$VAULT" ]; then
  echo "Vault not found at $VAULT — run bootstrap-vault first"
  exit 1
fi

cd "$VAULT"

if [ ! -d .git ]; then
  git init
  git branch -M main
  cat > .gitignore <<'EOF'
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.trash/
.DS_Store
EOF
  git add -A
  git commit -m "Initial Brain-Vault"
  echo "Git repo initialized at $VAULT"
else
  echo "Git repo already exists at $VAULT"
fi

if [ -n "$REMOTE" ]; then
  git remote remove origin 2>/dev/null || true
  git remote add origin "$REMOTE"
  echo "Remote set to $REMOTE"
  echo ""
  echo "Push vault:"
  echo "  cd $VAULT && git push -u origin main"
  echo ""
  echo "On Mac Obsidian — pull to sync:"
  echo "  cd $VAULT && git pull"
  echo ""
  echo "Railway env vars:"
  echo "  VAULT_GIT_SYNC=true"
  echo "  VAULT_GIT_REMOTE=$REMOTE"
fi
