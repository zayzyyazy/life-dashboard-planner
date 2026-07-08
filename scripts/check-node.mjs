#!/usr/bin/env node
/**
 * better-sqlite3 needs Node 22 LTS — Node 26+ often fails to compile on Mac.
 */
const major = Number(process.version.slice(1).split(".")[0]);

if (major > 22) {
  console.error(`
❌ Node ${process.version} is not supported yet.

This project uses better-sqlite3 (native SQLite). Node 26+ often fails to build on Mac.

Fix — install Node 22 LTS, then reinstall:

  # Option A: fnm (recommended)
  brew install fnm
  fnm install 22
  fnm use 22

  # Option B: nvm
  nvm install 22
  nvm use 22

  # Then clean install
  cd ~/Desktop/life-dashboard-planner
  rm -rf node_modules server/node_modules
  npm run install:all

Check: node -v   → should show v22.x.x
`);
  process.exit(1);
}

if (major < 22) {
  console.warn(`⚠ Node ${process.version} — recommend Node 22+`);
}
