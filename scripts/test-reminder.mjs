#!/usr/bin/env node
/**
 * Send a test reminder in 2 minutes to verify Telegram notifications work.
 * Run: npm run test:reminder
 */
import { execSync } from "node:child_process";

execSync("npm run test:reminder --prefix server", { stdio: "inherit" });
