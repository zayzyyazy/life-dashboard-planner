#!/usr/bin/env node
/**
 * Test Telegram bot token and config. Run: npm run test:telegram
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");

function loadEnv() {
  if (!fs.existsSync(envPath)) {
    console.error("❌ No .env file. Run: cp .env.example .env");
    process.exit(1);
  }
  const vars = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    vars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

const env = loadEnv();
const token = env.TELEGRAM_BOT_TOKEN;
const allowed = env.TELEGRAM_ALLOWED_USER_IDS;

console.log("Telegram diagnostic\n");

if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN missing in .env");
  process.exit(1);
}

console.log("1. Testing bot token with Telegram API...");
const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
const me = await meRes.json();
if (!me.ok) {
  console.error("❌ Invalid token:", me.description);
  process.exit(1);
}
console.log(`✓ Bot: @${me.result.username} (${me.result.first_name})`);

console.log("\n2. Checking allowed user IDs...");
if (!allowed) {
  console.error("❌ TELEGRAM_ALLOWED_USER_IDS missing in .env");
  console.log("   Get your ID from @userinfobot on Telegram");
  process.exit(1);
}
console.log(`✓ Allowed IDs: ${allowed}`);

console.log("\n3. Checking if agent server is running...");
try {
  const health = await fetch("http://127.0.0.1:3847/health", { signal: AbortSignal.timeout(3000) });
  const data = await health.json();
  if (data.status === "ok") {
    console.log("✓ Server running on port 3847");
    const tg = await fetch("http://127.0.0.1:3847/telegram/status");
    const status = await tg.json();
    console.log(`   Telegram enabled: ${status.enabled}`);
    console.log(`   Token configured: ${status.token_configured}`);
    console.log(`   Allowed users: ${status.allowed_users_configured}`);
    if (!status.enabled) {
      console.warn("\n⚠ Server running but Telegram bot not active — restart: bash scripts/restart-mac.sh");
    }
  }
} catch {
  console.error("❌ Server NOT running on port 3847");
  console.log("\n   Fix: bash scripts/restart-mac.sh");
  console.log("   Telegram only works while the server is running.");
  process.exit(1);
}

console.log("\n4. Sending test message to your Telegram...");
const userId = allowed.split(",")[0].trim();
const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: userId,
    text: "✅ Life Planner Agent test — if you see this, your token and user ID are correct. Now send /start to chat with the agent (server must be running).",
  }),
});
const send = await sendRes.json();
if (!send.ok) {
  console.error("❌ Could not send message:", send.description);
  if (send.description?.includes("chat not found")) {
    console.log("   Open your bot in Telegram and tap Start first, then run this again.");
  }
  process.exit(1);
}
console.log("✓ Test message sent — check Telegram on your phone");

console.log("\n✅ Telegram config looks good.");
console.log("   Make sure bash scripts/restart-mac.sh is running, then send /start to your bot.");
