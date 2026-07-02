import { getDb } from "./db/index.js";
import { seedProfileIfEmpty } from "./services/profile.js";

getDb();
seedProfileIfEmpty().then((seeded) => {
  console.log(seeded ? "✓ Profile seeded" : "Profile already exists — skipped");
  process.exit(0);
});
