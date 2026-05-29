import fs from "node:fs/promises";
import path from "node:path";
import { fetchGoogleSheetCsv } from "./fetch-google-sheet-csv.mjs";
import { parseMeetingsSheet } from "./parse-meetings-sheet.mjs";
import { computeMeetingsMetrics } from "./compute-meetings-metrics.mjs";
import { buildMeetingsFilterOptions } from "./build-meetings-filter-options.mjs";
import { loadChilipiperExports } from "./load-chilipiper-exports.mjs";
import { chilipiperDataDirFromEnv } from "./chilipiper-data-dir.mjs";

function columnAliasesFromEnv() {
  return {
    status: process.env.MEETINGS_COL_STATUS,
    bookedLive: process.env.MEETINGS_COL_BOOKED_LIVE,
    happened: process.env.MEETINGS_COL_HAPPENED,
    handoff: process.env.MEETINGS_COL_HANDOFF,
    email: process.env.MEETINGS_COL_EMAIL,
    company: process.env.MEETINGS_COL_COMPANY,
    region: process.env.MEETINGS_COL_REGION,
    bdr: process.env.MEETINGS_COL_BDR,
    ae: process.env.MEETINGS_COL_AE,
    bookedAt: process.env.MEETINGS_COL_BOOKED_AT,
    meetingAt: process.env.MEETINGS_COL_MEETING_AT,
  };
}

function buildMeetingsPayload(conciergeParsed, handoffParsed, meta = {}) {
  const meetings = [...conciergeParsed.meetings, ...handoffParsed.meetings];
  return {
    meetings,
    sheets: {
      concierge: {
        headers: conciergeParsed.headers,
        rowCount: conciergeParsed.meetings.length,
      },
      handoff: {
        headers: handoffParsed.headers,
        rowCount: handoffParsed.meetings.length,
      },
    },
    metrics: computeMeetingsMetrics(meetings),
    filterOptions: buildMeetingsFilterOptions(meetings),
    meta: {
      fetchedAt: new Date().toISOString(),
      ...meta,
    },
  };
}

export async function loadMeetingsFromCsv(conciergePath, handoffPath) {
  const [conciergeCsv, handoffCsv] = await Promise.all([
    fs.readFile(conciergePath, "utf8"),
    fs.readFile(handoffPath, "utf8"),
  ]);
  const aliases = columnAliasesFromEnv();
  const conciergeParsed = parseMeetingsSheet(conciergeCsv, {
    meetingType: "concierge",
    columnAliases: aliases,
  });
  const handoffParsed = parseMeetingsSheet(handoffCsv, {
    meetingType: "handoff",
    columnAliases: aliases,
  });
  return buildMeetingsPayload(conciergeParsed, handoffParsed, {
    source: "csv",
    conciergePath,
    handoffPath,
  });
}

export async function fetchMeetingsFromGoogle(spreadsheetId, gids) {
  const [conciergeCsv, handoffCsv] = await Promise.all([
    fetchGoogleSheetCsv(spreadsheetId, gids.concierge),
    fetchGoogleSheetCsv(spreadsheetId, gids.handoff),
  ]);
  const aliases = columnAliasesFromEnv();
  const conciergeParsed = parseMeetingsSheet(conciergeCsv, {
    meetingType: "concierge",
    columnAliases: aliases,
  });
  const handoffParsed = parseMeetingsSheet(handoffCsv, {
    meetingType: "handoff",
    columnAliases: aliases,
  });
  return buildMeetingsPayload(conciergeParsed, handoffParsed, {
    source: "google-sheets",
    spreadsheetId,
    conciergeGid: gids.concierge,
    handoffGid: gids.handoff,
  });
}

export function meetingsConfigFromEnv(projectRoot) {
  const spreadsheetId = process.env.MEETINGS_SPREADSHEET_ID ?? "";
  const chilipiperDir = chilipiperDataDirFromEnv(projectRoot);
  const defaultSource = process.env.MEETINGS_SOURCE;
  let source = defaultSource;
  if (!source) {
    source = spreadsheetId ? "sheets" : "chilipiper";
  }
  return {
    source,
    chilipiperDir,
    spreadsheetId,
    gids: {
      concierge: process.env.MEETINGS_CONCIERGE_GID ?? "0",
      handoff: process.env.MEETINGS_HANDOFF_GID ?? "",
    },
    conciergeCsv:
      process.env.MEETINGS_CONCIERGE_CSV ?? "data/meetings-concierge-sample.csv",
    handoffCsv: process.env.MEETINGS_HANDOFF_CSV ?? "data/meetings-handoff-sample.csv",
  };
}

/** Resolve paths relative to project root when loading CSV. */
export async function loadMeetings(config, projectRoot) {
  if (config.source === "chilipiper") {
    return loadChilipiperExports(projectRoot);
  }

  if (config.source === "sheets") {
    if (!config.spreadsheetId) {
      throw new Error("MEETINGS_SPREADSHEET_ID is required when MEETINGS_SOURCE=sheets");
    }
    if (!config.gids.handoff) {
      throw new Error("MEETINGS_HANDOFF_GID is required (tab id from the sheet URL)");
    }
    return fetchMeetingsFromGoogle(config.spreadsheetId, config.gids);
  }

  const conciergePath = path.isAbsolute(config.conciergeCsv)
    ? config.conciergeCsv
    : path.join(projectRoot, config.conciergeCsv);
  const handoffPath = path.isAbsolute(config.handoffCsv)
    ? config.handoffCsv
    : path.join(projectRoot, config.handoffCsv);

  return loadMeetingsFromCsv(conciergePath, handoffPath);
}
