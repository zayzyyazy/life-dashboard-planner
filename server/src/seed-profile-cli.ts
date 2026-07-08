import { getDb } from "./db/index.js";
import { seedProfileForce, seedProfileIfEmpty } from "./services/profile.js";

const force = process.argv.includes("--force");

getDb();
const run = force ? seedProfileForce() : seedProfileIfEmpty();

run.then((result) => {
  if (force) {
    console.log("✓ Profile updated from seed (--force)");
  } else {
    console.log(result ? "✓ Profile seeded" : "Profile already exists — use --force to overwrite");
  }
  process.exit(0);
});
