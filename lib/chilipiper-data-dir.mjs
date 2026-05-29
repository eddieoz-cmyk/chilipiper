import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(__dirname, "..", "..", "chilipiper");

/** Resolve Chili Piper export folder (sibling `chilipiper/` by default). */
export function chilipiperDataDirFromEnv(projectRoot) {
  const configured = process.env.CHILIPIPER_DATA_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(projectRoot, configured);
  }
  return DEFAULT_DIR;
}

export async function chilipiperExportPaths(dataDir) {
  const files = {
    meetings: path.join(dataDir, "meetings.csv"),
    concierge: path.join(dataDir, "concierge.csv"),
    rules: path.join(dataDir, "chilirules.json"),
  };

  const usersDir = await fs.readdir(dataDir).catch(() => []);
  const usersFile = usersDir.find((f) => /^users-export-.*\.csv$/i.test(f));
  if (usersFile) {
    files.users = path.join(dataDir, usersFile);
  }

  return files;
}
