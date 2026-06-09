#!/usr/bin/env bash
# Deploy Life Dashboard Planner to Desktop — always builds fresh, verifies bundle matches dist
set -euo pipefail

SRC="/Users/zay/Desktop/LLM projects/AI_Call_QA_Cockpit/life-dashboard-planner"
DEST="$HOME/Desktop/Life Dashboard Planner"
DESKTOP_APP="$HOME/Desktop/Life Dashboard Planner.app"

echo "==> Building fresh release bundle..."
cd "$SRC"
export CARGO_TARGET_DIR="$SRC/src-tauri/target"
npm run tauri:build

echo "==> Locating newest .app bundle..."
APP_SRC=$(find "$SRC/src-tauri" -name "Life Dashboard Planner.app" -path "*/release/bundle/macos/*" 2>/dev/null \
  | while IFS= read -r p; do
      printf '%s\t%s\n' "$(stat -f %m "$p" 2>/dev/null || echo 0)" "$p"
    done \
  | sort -t $'\t' -k1 -rn \
  | head -1 \
  | cut -f2-)

if [[ -z "${APP_SRC:-}" || ! -d "$APP_SRC" ]]; then
  echo "ERROR: No .app bundle found after build. Check tauri build output."
  exit 1
fi

echo "    Bundle: $APP_SRC"

DIST_JS=$(ls -t "$SRC/dist/assets/"index-*.js 2>/dev/null | head -1)
if [[ -z "${DIST_JS:-}" ]]; then
  echo "ERROR: No dist JS found."
  exit 1
fi
DIST_BUNDLE=$(basename "$DIST_JS")
EMBEDDED=$(grep -ao "index-[A-Za-z0-9_-]*\.js" "$APP_SRC/Contents/MacOS/life-dashboard-planner" 2>/dev/null | sort -u | head -1)

echo "==> Verifying embedded frontend..."
echo "    dist:     $DIST_BUNDLE"
echo "    embedded: ${EMBEDDED:-MISSING}"

if [[ "${EMBEDDED:-}" != "$DIST_BUNDLE" ]]; then
  echo "ERROR: Stale bundle — embedded JS does not match latest dist build."
  echo "       Re-run from project folder: npm run tauri:build"
  exit 1
fi

if ! grep -q "Day assistant" "$DIST_JS" 2>/dev/null; then
  echo "WARNING: Latest dist JS may be missing expected features."
fi

echo "==> Syncing project to Desktop folder..."
mkdir -p "$DEST"
rsync -a --delete \
  --exclude 'src-tauri/target' \
  --exclude 'node_modules/.cache' \
  --exclude '.git' \
  "$SRC/" "$DEST/"

echo "==> Installing npm deps (if needed)..."
cd "$DEST"
[[ -d node_modules ]] || npm install --silent

echo "==> Copying verified .app to Desktop..."
rm -rf "$DESKTOP_APP"
cp -R "$APP_SRC" "$DESKTOP_APP"

cat > "$HOME/Desktop/Launch Life Dashboard Planner.command" << 'LAUNCH'
#!/bin/bash
cd "$HOME/Desktop/Life Dashboard Planner"
chmod +x scripts/deploy-to-desktop.sh 2>/dev/null || true
npm run tauri:dev
LAUNCH
chmod +x "$HOME/Desktop/Launch Life Dashboard Planner.command"

echo "==> Done."
echo "    Folder: $DEST"
echo "    App:    $DESKTOP_APP"
echo "    Build:  $DIST_BUNDLE"
echo "    Launch: $HOME/Desktop/Launch Life Dashboard Planner.command"
echo ""
echo "    Open: Life Dashboard Planner.app (no number) on Desktop"
echo "    Check Settings footer for build stamp to confirm."
