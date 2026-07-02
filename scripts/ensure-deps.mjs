#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const serverDir = path.join(projectRoot, "server");
const tsxBin = path.join(serverDir, "node_modules", ".bin", "tsx");

if (!fs.existsSync(tsxBin)) {
  console.log("[setup] Server dependencies missing — installing...");
  execSync("npm install", { cwd: serverDir, stdio: "inherit" });
  if (!fs.existsSync(tsxBin)) {
    console.error("[setup] Install failed. Run manually: npm run install:all");
    process.exit(1);
  }
  console.log("[setup] Server dependencies installed.");
}
