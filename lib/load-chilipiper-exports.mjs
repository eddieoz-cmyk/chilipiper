import fs from "node:fs/promises";
import { chilipiperDataDirFromEnv, chilipiperExportPaths } from "./chilipiper-data-dir.mjs";
import { parseChilipiperMeetingsCsv, parseMeetingExportFunnel } from "./parse-chilipiper-meetings.mjs";
import { parseChilipiperUsersCsv } from "./parse-chilipiper-users.mjs";
import { computeMeetingsMetrics } from "./compute-meetings-metrics.mjs";
import { enrichChilipiperMeetingsPayload } from "./enrich-chilipiper-meetings.mjs";

function splitMeetingsByType(meetings) {
  const concierge = meetings.filter((m) => m.meetingType === "concierge");
  const handoff = meetings.filter((m) => m.meetingType === "handoff");
  return {
    concierge: { meetings: concierge, headers: [], meetingType: "concierge" },
    handoff: { meetings: handoff, headers: [], meetingType: "handoff" },
  };
}

export async function loadMeetingsFromChilipiperDir(dataDir, opts = {}) {
  const paths = await chilipiperExportPaths(dataDir);
  const year = opts.year ?? (Number(process.env.CHILIPIPER_YEAR) || 2026);

  const [meetingsCsv, usersCsv] = await Promise.all([
    fs.readFile(paths.meetings, "utf8"),
    paths.users ? fs.readFile(paths.users, "utf8") : Promise.resolve(null),
  ]);

  const parsedMeetings = parseChilipiperMeetingsCsv(meetingsCsv, { year });
  const funnel = parseMeetingExportFunnel(parsedMeetings.meetings, year);
  const users = usersCsv ? parseChilipiperUsersCsv(usersCsv) : null;

  const { concierge, handoff } = splitMeetingsByType(parsedMeetings.meetings);
  const metrics = computeMeetingsMetrics(parsedMeetings.meetings);

  const payload = {
    meetings: parsedMeetings.meetings,
    sheets: {
      concierge: { headers: parsedMeetings.headers, rowCount: concierge.meetings.length },
      handoff: { headers: parsedMeetings.headers, rowCount: handoff.meetings.length },
    },
    metrics,
    funnel: {
      year,
      conciergeLog: funnel,
    },
    users,
    meta: {
      source: "chilipiper-export",
      dataDir,
      year,
      files: paths,
      meetingRows: parsedMeetings.meetings.length,
      skippedOutsideYear: parsedMeetings.skipped,
      fetchedAt: new Date().toISOString(),
    },
  };

  await enrichChilipiperMeetingsPayload(payload, paths);
  return payload;
}

export async function loadChilipiperExports(projectRoot) {
  const dataDir = chilipiperDataDirFromEnv(projectRoot);
  try {
    await fs.access(dataDir);
  } catch {
    throw new Error(
      `Chili Piper data folder not found at ${dataDir}. Set CHILIPIPER_DATA_DIR or add ../chilipiper exports.`,
    );
  }
  return loadMeetingsFromChilipiperDir(dataDir);
}
