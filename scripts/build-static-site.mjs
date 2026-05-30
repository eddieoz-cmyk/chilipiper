#!/usr/bin/env node
/**
 * Build static site for GitHub Pages (no Node server at runtime).
 * Output: ./site/
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMeetingsFromChilipiperDir } from "../lib/load-chilipiper-exports.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const SITE = path.join(ROOT, "site");
const DATA_DIR = process.env.CHILIPIPER_DATA_DIR
  ? path.isAbsolute(process.env.CHILIPIPER_DATA_DIR)
    ? process.env.CHILIPIPER_DATA_DIR
    : path.join(ROOT, process.env.CHILIPIPER_DATA_DIR)
  : path.join(ROOT, "data", "chilipiper");

async function copyDir(src, dest, skip = new Set()) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to, skip);
    } else {
      await fs.copyFile(from, to);
    }
  }
}

async function main() {
  console.log(`Loading Chili Piper data from ${DATA_DIR}…`);
  const payload = await loadMeetingsFromChilipiperDir(DATA_DIR);
  payload.staticSite = true;

  await fs.rm(SITE, { recursive: true, force: true });
  await copyDir(PUBLIC, SITE, new Set(["meetings-data.json", "routing-data.json", "routing-gaps.json"]));

  await fs.writeFile(path.join(SITE, "meetings-data.json"), JSON.stringify(payload));
  const siteMeta = {
    source: "github-pages",
    builtAt: new Date().toISOString(),
    year: payload.meta?.year,
    meetingRows: payload.meetings?.length ?? 0,
    routingRuleCount: payload.routingRules?.length ?? 0,
  };
  await fs.writeFile(path.join(SITE, "site-meta.json"), JSON.stringify(siteMeta));
  // Keep local static preview in sync (gitignored).
  await fs.writeFile(path.join(PUBLIC, "meetings-data.json"), JSON.stringify(payload));
  await fs.writeFile(path.join(PUBLIC, "site-meta.json"), JSON.stringify(siteMeta));

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=./meetings.html" />
    <title>Meetings dashboard</title>
  </head>
  <body>
    <p><a href="./meetings.html">Concierge &amp; handoff meetings</a></p>
  </body>
</html>
`;
  await fs.writeFile(path.join(SITE, "index.html"), indexHtml);

  const stat = await fs.stat(path.join(SITE, "meetings-data.json"));
  console.log(`Built ${SITE} (${payload.meetings.length} meetings, JSON ${(stat.size / 1e6).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
