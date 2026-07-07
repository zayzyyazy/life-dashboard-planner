#!/bin/bash
# Install LaunchAgent: auto git sync Brain-Vault every 3 minutes (Mac ↔ cloud).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SYNC_SCRIPT="$PROJECT_DIR/scripts/sync-brain-vault.sh"
PLIST="$HOME/Library/LaunchAgents/com.brainvault.sync.plist"
UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"
INTERVAL="${BRAIN_VAULT_SYNC_INTERVAL:-180}"

chmod +x "$SYNC_SCRIPT"

# Load VAULT_PATH from .env if present
ENV_FILE="$PROJECT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a
  source <(grep -E '^VAULT_PATH=' "$ENV_FILE" | sed 's/^/export /')
  set +a
fi
VAULT="${VAULT_PATH:-$HOME/Documents/Brain-Vault}"

mkdir -p "$HOME/Library/Logs"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.brainvault.sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SYNC_SCRIPT</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>VAULT_PATH</key>
    <string>$VAULT</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartInterval</key>
  <integer>$INTERVAL</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/brain-vault-sync.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/brain-vault-sync.log</string>
</dict>
</plist>
EOF

launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/com.brainvault.sync" 2>/dev/null || true
launchctl kickstart -k "$DOMAIN/com.brainvault.sync" 2>/dev/null || true

echo "✓ Brain-Vault auto-sync installed"
echo "  Vault:    $VAULT"
echo "  Interval: every ${INTERVAL}s (~$((INTERVAL / 60)) min)"
echo "  Log:      $HOME/Library/Logs/brain-vault-sync.log"
echo ""
echo "Test now:  npm run sync:vault"
echo "Uninstall: launchctl bootout $DOMAIN $PLIST"
