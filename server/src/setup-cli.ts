import { runSetup } from "./setup.js";

runSetup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
