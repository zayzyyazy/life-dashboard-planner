#!/bin/bash
cd "$(dirname "$0")"
echo "Building standalone Life Dashboard Planner.app (first run may take a minute)..."
npm run app:build
if [ $? -eq 0 ]; then
  echo "Opening standalone app from release/ folder..."
  npm run app:open
  echo "Tip: drag release/Life Dashboard Planner.app to your Dock for quick access."
else
  echo "Build failed. See errors above."
  read -p "Press Enter to close..."
fi
