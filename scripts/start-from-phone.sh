#!/bin/bash
# Run on your Mac from phone SSH (Termius, etc.)
set -e
cd "$(dirname "$0")/.."
echo "Installing dependencies..."
npm run install:all
echo "Checking .env..."
npm run check-env
echo "Starting Life Planner Agent (server + Telegram)..."
npm run dev
