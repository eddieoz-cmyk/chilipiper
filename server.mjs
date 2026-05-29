import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadJourneysFromCsv } from "./lib/load-csv-journeys.mjs";
import { computeTopPages } from "./lib/top-pages.mjs";
import { computeAllBreakdowns } from "./lib/breakdown.mjs";
import { computeOutreachPriority } from "./lib/outreach-priority.mjs";
import { loadRoutingFromFiles, fetchRoutingFromGoogle } from "./lib/load-routing-rules.mjs";
import {
  fetchRoutingFromApi,
  routingApiConfigFromEnv,
} from "./lib/fetch-routing-api.mjs";
import { buildRoutingFromChiliPiperFile } from "./lib/fetch-chilipiper-rules.mjs";
import {
  chilipiperDataDirFromEnv,
  chilipiperExportPaths,
} from "./lib/chilipiper-data-dir.mjs";
import {
  loadMeetings,
  meetingsConfigFromEnv,
} from "./lib/load-meetings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadDotEnv() {
  try {
    const text = await fs.readFile(path.join(__dirname, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* .env optional */
  }
}

await loadDotEnv();

const PORT = Number(process.env.PORT) || 3847;
const CSV_PATH =
  process.env.CSV_PATH ?? path.join(__dirname, "test.csv");
const ROUTING_CONCIERGE_CSV =
  process.env.ROUTING_CONCIERGE_CSV ??
  path.join(__dirname, "data", "routing-concierge.csv");
const ROUTING_OFFLINE_CSV =
  process.env.ROUTING_OFFLINE_CSV ??
  path.join(__dirname, "data", "routing-offline-distribution.csv");
const ROUTING_SPREADSHEET_ID = process.env.ROUTING_SPREADSHEET_ID ?? "";
const ROUTING_SOURCE =
  process.env.ROUTING_SOURCE ??
  (routingApiConfigFromEnv() ? "api" : "csv");
const ROUTING_API = routingApiConfigFromEnv();
const MEETINGS_CONFIG = meetingsConfigFromEnv(__dirname);
const CHILIPIPER_DATA_DIR = chilipiperDataDirFromEnv(__dirname);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

let journeysCache = null;
let dataSource = "";
let routingCache = null;
let meetingsCache = null;
let meetingsLoadError = null;

async function mergeOfflineFromCsv(routing) {
  try {
    await fs.access(ROUTING_OFFLINE_CSV);
    const fromCsv = await loadRoutingFromFiles(
      ROUTING_CONCIERGE_CSV,
      ROUTING_OFFLINE_CSV,
    );
    routing.offline = fromCsv.offline;
    routing.meta.offlineSource = ROUTING_OFFLINE_CSV;
    routing.meta.offlinePodCount = fromCsv.offline.pods.length;
  } catch {
    /* offline CSV optional when using API */
  }
  return routing;
}

async function loadRouting(forceRefresh = false) {
  if (ROUTING_SOURCE === "chilipiper-file" || ROUTING_SOURCE === "chilipiper") {
    if (forceRefresh || !routingCache) {
      const paths = await chilipiperExportPaths(CHILIPIPER_DATA_DIR);
      const rulesPath = process.env.CHILIPIPER_RULES_JSON ?? paths.rules;
      routingCache = await buildRoutingFromChiliPiperFile(rulesPath);
    }
    return routingCache;
  }

  if (ROUTING_SOURCE === "api") {
    if (!ROUTING_API?.url) {
      throw new Error(
        "ROUTING_SOURCE=api but ROUTING_API_URL is not set. Add it to .env or the environment.",
      );
    }
    if (forceRefresh || !routingCache) {
      routingCache = await fetchRoutingFromApi(ROUTING_API);
      await mergeOfflineFromCsv(routingCache);
    }
    return routingCache;
  }

  if (ROUTING_SOURCE === "sheets" && ROUTING_SPREADSHEET_ID) {
    if (forceRefresh || !routingCache) {
      routingCache = await fetchRoutingFromGoogle(ROUTING_SPREADSHEET_ID);
    }
    return routingCache;
  }

  routingCache = await loadRoutingFromFiles(
    ROUTING_CONCIERGE_CSV,
    ROUTING_OFFLINE_CSV,
  );
  return routingCache;
}

async function loadMeetingsData(forceRefresh = false) {
  if (forceRefresh || !meetingsCache) {
    meetingsCache = await loadMeetings(MEETINGS_CONFIG, __dirname);
    meetingsLoadError = null;
  }
  return meetingsCache;
}

async function loadJourneys() {
  try {
    await fs.access(CSV_PATH);
    journeysCache = await loadJourneysFromCsv(CSV_PATH);
    dataSource = CSV_PATH;
    return journeysCache;
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        `CSV not found at ${CSV_PATH}. Set CSV_PATH or place mql-journey-events.csv in data/`,
      );
    }
    throw err;
  }
}

function summarize(mql) {
  const visits = mql.visits ?? [];
  const lastReturn =
    visits.length > 0
      ? visits.reduce((latest, v) =>
          new Date(v.returnedAt) > new Date(latest) ? v.returnedAt : latest,
        visits[0].returnedAt)
      : null;
  return {
    id: mql.id,
    email: mql.email,
    mqlDate: mql.mqlDate,
    returnVisitCount: visits.length,
    lastReturn,
    leadStatus: mql.leadStatus ?? null,
    lastCombinedScore: mql.lastCombinedScore ?? null,
    mainSegment: mql.mainSegment ?? null,
    mainOwnerName: mql.mainOwnerName ?? null,
    nurtureReason: mql.nurtureReason ?? null,
  };
}

function send(res, status, body, contentType = "application/json") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

async function serveStatic(urlPath, res) {
  const safe = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(PUBLIC_DIR, safe === "/" ? "index.html" : safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, "Forbidden", "text/plain");
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    send(res, 200, data, MIME[ext] ?? "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/meetings/meta") {
    send(
      res,
      200,
      JSON.stringify({
        source: MEETINGS_CONFIG.source,
        spreadsheetId: MEETINGS_CONFIG.spreadsheetId || null,
        conciergeGid: MEETINGS_CONFIG.gids.concierge,
        handoffGid: MEETINGS_CONFIG.gids.handoff || null,
        conciergeCsv: MEETINGS_CONFIG.conciergeCsv,
        handoffCsv: MEETINGS_CONFIG.handoffCsv,
        chilipiperDir: CHILIPIPER_DATA_DIR,
        year: Number(process.env.CHILIPIPER_YEAR) || 2026,
        routingSource: ROUTING_SOURCE,
        hasRoutingApi: Boolean(ROUTING_API?.url),
        lastError: meetingsLoadError,
      }),
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/meetings") {
    try {
      const refresh = url.searchParams.get("refresh") === "1";
      const payload = await loadMeetingsData(refresh);
      if (refresh) {
        await fs.writeFile(
          path.join(PUBLIC_DIR, "meetings-data.json"),
          JSON.stringify(payload),
        );
      }
      send(res, 200, JSON.stringify(payload));
    } catch (err) {
      meetingsLoadError = String(err.message ?? err);
      send(res, 500, JSON.stringify({ error: meetingsLoadError }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/routing/meta") {
    send(
      res,
      200,
      JSON.stringify({
        source: ROUTING_SOURCE,
        canRefresh:
          ROUTING_SOURCE === "api" ||
          ROUTING_SOURCE === "chilipiper-file" ||
          ROUTING_SOURCE === "chilipiper" ||
          (ROUTING_SOURCE === "sheets" && Boolean(ROUTING_SPREADSHEET_ID)),
        apiUrl: ROUTING_API?.url ?? null,
        spreadsheetId: ROUTING_SPREADSHEET_ID || null,
        conciergeCsv: ROUTING_CONCIERGE_CSV,
        offlineCsv: ROUTING_OFFLINE_CSV,
      }),
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/routing") {
    try {
      const refresh = url.searchParams.get("refresh") === "1";
      const routing = routingCache ?? (await loadRouting(refresh));
      if (refresh) {
        routingCache = routing;
        await writeRoutingSnapshot(routing);
      }
      send(res, 200, JSON.stringify(routing));
    } catch (err) {
      send(res, 500, JSON.stringify({ error: String(err.message ?? err) }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/meta") {
    send(
      res,
      200,
      JSON.stringify({
        source: dataSource,
        mqlCount: journeysCache?.length ?? 0,
      }),
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/outreach-priority") {
    try {
      const journeys = journeysCache ?? (await loadJourneys());
      const limit = Math.min(
        50,
        Math.max(1, Number(url.searchParams.get("limit")) || 20),
      );
      send(res, 200, JSON.stringify(computeOutreachPriority(journeys, limit)));
    } catch (err) {
      send(res, 500, JSON.stringify({ error: String(err.message ?? err) }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/breakdowns") {
    try {
      const journeys = journeysCache ?? (await loadJourneys());
      const limit = Math.min(
        50,
        Math.max(1, Number(url.searchParams.get("limit")) || 12),
      );
      send(res, 200, JSON.stringify(computeAllBreakdowns(journeys, limit)));
    } catch (err) {
      send(res, 500, JSON.stringify({ error: String(err.message ?? err) }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/top-pages") {
    try {
      const journeys = journeysCache ?? (await loadJourneys());
      const limit = Math.min(
        50,
        Math.max(1, Number(url.searchParams.get("limit")) || 15),
      );
      send(res, 200, JSON.stringify(computeTopPages(journeys, limit)));
    } catch (err) {
      send(res, 500, JSON.stringify({ error: String(err.message ?? err) }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mqls") {
    try {
      const journeys = journeysCache ?? (await loadJourneys());
      send(res, 200, JSON.stringify(journeys.map(summarize)));
    } catch (err) {
      send(res, 500, JSON.stringify({ error: String(err.message ?? err) }));
    }
    return;
  }

  const journeyMatch = url.pathname.match(/^\/api\/mqls\/([^/]+)\/journey$/);
  if (req.method === "GET" && journeyMatch) {
    try {
      const journeys = journeysCache ?? (await loadJourneys());
      const mql = journeys.find((j) => j.id === decodeURIComponent(journeyMatch[1]));
      if (!mql) {
        send(res, 404, JSON.stringify({ error: "MQL not found" }));
        return;
      }
      send(res, 200, JSON.stringify(mql));
    } catch (err) {
      send(res, 500, JSON.stringify({ error: String(err.message ?? err) }));
    }
    return;
  }

  if (req.method === "GET") {
    await serveStatic(url.pathname, res);
    return;
  }

  send(res, 405, JSON.stringify({ error: "Method not allowed" }));
});

const ROUTING_JSON_PATH = path.join(PUBLIC_DIR, "routing-data.json");
const ROUTING_GAPS_PATH = path.join(PUBLIC_DIR, "routing-gaps.json");

async function writeRoutingSnapshot(routing) {
  await fs.writeFile(ROUTING_JSON_PATH, JSON.stringify(routing));
  if (routing.coverageGaps) {
    await fs.writeFile(ROUTING_GAPS_PATH, JSON.stringify(routing.coverageGaps));
  }
}

const journeys = await loadJourneys();
const withReturns = journeys.filter((j) => j.visits.length > 0).length;
const routing = await loadRouting();
await writeRoutingSnapshot(routing);

try {
  const meetings = await loadMeetingsData();
  await fs.writeFile(
    path.join(PUBLIC_DIR, "meetings-data.json"),
    JSON.stringify(meetings),
  );
  console.log(
    `Meetings: ${meetings.metrics.total} rows (${meetings.metrics.bookedLive} booked live, ${meetings.metrics.happened} held, ${meetings.metrics.handoffToAe} BDR→AE handoffs)`,
  );
} catch (err) {
  meetingsLoadError = String(err.message ?? err);
  console.warn(`Meetings data not loaded: ${meetingsLoadError}`);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MQL Journey Dashboard → http://localhost:${PORT}`);
  console.log(`Meetings Dashboard → http://localhost:${PORT}/meetings.html`);
  console.log(`Routing Rules Dashboard → http://localhost:${PORT}/routing.html`);
  console.log(`Loaded ${journeys.length} MQLs (${withReturns} with return visits) from CSV`);
  console.log(
    `Routing: ${routing.meta.conciergeRuleCount} Concierge rules, ${routing.meta.offlinePodCount} offline pods (source: ${routing.meta.source ?? ROUTING_SOURCE})`,
  );
});
