#!/usr/bin/env node
/**
 * Run from project root: npm run check-env
 * Diagnoses .env file location and whether keys are loaded.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function parseEnvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const vars = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    vars[key] = value;
  }
  return vars;
}

const candidates = [
  path.join(projectRoot, ".env"),
  path.join(process.cwd(), ".env"),
  path.join(projectRoot, "server", ".env"),
];

console.log("Life Planner Agent — .env check\n");
console.log("Project root:", projectRoot);
console.log("Current dir: ", process.cwd());
console.log("");

let found = null;
for (const candidate of candidates) {
  const exists = fs.existsSync(candidate);
  console.log(`${exists ? "✓" : "✗"} ${candidate}`);
  if (exists && !found) found = candidate;
}

console.log("");
if (!found) {
  console.log("❌ No .env file found.");
  console.log("\nFix:");
  console.log(`  cp ${path.join(projectRoot, ".env.example")} ${path.join(projectRoot, ".env")}`);
  console.log("  nano .env   # add OPENAI_API_KEY=sk-...");
  process.exit(1);
}

const vars = parseEnvFile(found);
console.log(`Using: ${found}\n`);

const checks = [
  ["OPENAI_API_KEY", vars.OPENAI_API_KEY],
  ["TELEGRAM_BOT_TOKEN", vars.TELEGRAM_BOT_TOKEN],
  ["TELEGRAM_ALLOWED_USER_IDS", vars.TELEGRAM_ALLOWED_USER_IDS],
  ["GITHUB_TOKEN", vars.GITHUB_TOKEN],
  ["EMAIL_TO", vars.EMAIL_TO],
];

let ok = true;
let warnings = 0;
for (const [name, value] of checks) {
  const set = Boolean(value?.trim() && !value.includes("your-") && !value.includes("ghp_your"));
  const preview = set ? `${String(value).slice(0, 8)}…` : "NOT SET";
  const required = name === "OPENAI_API_KEY";
  if (required && !set) ok = false;
  if (!required && !set) warnings++;
  console.log(`${set ? "✓" : required ? "❌" : "⚠"} ${name}: ${preview}`);
}

console.log("");
if (!ok) {
  console.log("❌ OPENAI_API_KEY is required.");
  console.log(`  nano ${found}`);
  process.exit(1);
}

if (warnings > 0) {
  console.log("⚠ Some optional keys missing — GitHub sync, email briefs, or Telegram may not work.");
  console.log("  Edit .env then run: npm run setup");
}

console.log("✓ Ready. Run: npm run setup   then   npm run dev");
