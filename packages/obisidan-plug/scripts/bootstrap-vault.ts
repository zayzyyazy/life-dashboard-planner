import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateRoot = path.join(__dirname, "..", "vault-template");

const AREAS = ["Uni", "Job", "Personal", "Research", "Building", "Learning"];

const vaultPath =
  process.env.VAULT_PATH ?? path.join(process.env.HOME ?? "", "Documents", "Brain-Vault");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyTemplate(src: string, dest: string) {
  const stat = await fs.stat(src).catch(() => null);
  if (!stat) return;
  if (stat.isDirectory()) {
    await ensureDir(dest);
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      await copyTemplate(path.join(src, entry.name), path.join(dest, entry.name));
    }
  } else {
    const exists = await fs.stat(dest).catch(() => null);
    if (!exists) {
      await fs.copyFile(src, dest);
    }
  }
}

async function writeObsidianConfig() {
  const obsidianDir = path.join(vaultPath, ".obsidian");
  await ensureDir(obsidianDir);

  const dailyNotes = {
    folder: "01-Daily",
    template: "Templates/daily",
    format: "YYYY-MM-DD",
  };

  const dailyPath = path.join(obsidianDir, "daily-notes.json");
  const exists = await fs.stat(dailyPath).catch(() => null);
  if (!exists) {
    await fs.writeFile(dailyPath, JSON.stringify(dailyNotes, null, 2), "utf8");
  }

  const appJson = {
    alwaysUpdateLinks: true,
    newFileLocation: "folder",
    newFileFolderPath: "00-Inbox",
  };
  const appPath = path.join(obsidianDir, "app.json");
  const appExists = await fs.stat(appPath).catch(() => null);
  if (!appExists) {
    await fs.writeFile(appPath, JSON.stringify(appJson, null, 2), "utf8");
  }
}

async function main() {
  console.log(`Bootstrapping vault at: ${vaultPath}`);

  const folders = [
    "00-Inbox",
    "01-Daily",
    "03-Projects",
    "04-Resources",
    "05-Archive",
    "Templates",
    ...AREAS.map((a) => path.join("02-Areas", a)),
  ];

  for (const folder of folders) {
    await ensureDir(path.join(vaultPath, folder));
    const keep = path.join(vaultPath, folder, ".gitkeep");
    const keepExists = await fs.stat(keep).catch(() => null);
    if (!keepExists) {
      await fs.writeFile(keep, "", "utf8");
    }
  }

  await copyTemplate(templateRoot, vaultPath);
  await writeObsidianConfig();

  const brainDataDir = process.env.BRAIN_DATA_DIR ?? path.join(process.env.HOME ?? "", ".brain");
  await ensureDir(brainDataDir);
  await ensureDir(path.join(brainDataDir, "previews"));

  console.log("Vault ready. Open in Obsidian: File → Open folder as vault");
  console.log(vaultPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
