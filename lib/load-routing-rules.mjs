import fs from "node:fs/promises";
import { parseCsvLine, splitCsvRows } from "./parse-csv-line.mjs";
import { buildRoutingPayload } from "./build-routing-payload.mjs";

const REGION_HEADERS = new Set([
  "APJ",
  "DACH",
  "US",
  "Canada",
  "LATAM",
  "Nordics / Benelux / EuroWest / Iberia",
  "Benelux/Nordics (Non-Native queue)",
  "IL/CEE",
  "UKI & ROW ",
  "Open",
]);

function trim(v) {
  return (v ?? "").trim();
}

function normalizeModule(raw) {
  const m = trim(raw).toLowerCase();
  if (!m) return [];
  return m
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.includes("consierge") || s.includes("concierge") ? "concierge" : s.includes("distro") ? "distro" : s));
}

function isRegionHeader(name) {
  const n = trim(name);
  if (!n) return false;
  if (REGION_HEADERS.has(n)) return true;
  return /^[A-Z][A-Za-z/&\s]+$/.test(n) && !n.includes("|") && n.length < 45;
}

function isSubheaderRow(fields) {
  const name = trim(fields[0]);
  return name === "Name" || name === "Spam Checker";
}

function isSystemRow(name) {
  const n = trim(name).toLowerCase();
  return (
    !n ||
    n === "name" ||
    n.startsWith("spam checker") ||
    n === "ownership" ||
    n === "customer/churn/pending churn/notrelevant ignore" ||
    n === "noa test domains" ||
    n === "blocked domains" ||
    n.startsWith("accounts owned") ||
    n === "catch all"
  );
}

/**
 * Parse Concierge / Distro routing sheet (gid=0).
 * Returns { rules, regions } where each rule has modules: ['concierge','distro'].
 */
export function parseConciergeSheet(csvText) {
  const rows = splitCsvRows(csvText);
  const rules = [];
  let currentRegion = "Global";

  for (const row of rows.slice(1)) {
    const fields = parseCsvLine(row);
    const name = trim(fields[0]);
    if (!name) continue;

    if (isRegionHeader(name) && fields.slice(1).every((f) => !trim(f))) {
      currentRegion = name.replace(/\s+$/, "");
      continue;
    }
    if (isSubheaderRow(fields) || isSystemRow(name)) continue;
    if (!name.includes("|") && !trim(fields[2])) continue;

    const modules = normalizeModule(fields[10]);
    const rule = {
      id: `${currentRegion}::${name}`,
      name,
      ruleStatus: trim(fields[1]) || null,
      region: trim(fields[2]) || currentRegion,
      state: trim(fields[3]) || null,
      size: trim(fields[4]) || null,
      segment: trim(fields[5]) || null,
      normalizedBuckets: trim(fields[6]) || null,
      notes: trim(fields[7]) || null,
      teamMembers: trim(fields[8]) || null,
      repCount: trim(fields[9]) || null,
      modules,
      moduleLabel: trim(fields[10]) || null,
      moduleNotes: trim(fields[11]) || null,
      countries: trim(fields[12]) || null,
      section: currentRegion,
      hasConcierge: modules.includes("concierge"),
      hasDistro: modules.includes("distro"),
    };
    rules.push(rule);
  }

  const regions = [...new Set(rules.map((r) => r.section))].sort();
  return { rules, regions };
}

/** Parse offline distribution POD sheet (gid=1420297909). */
export function parseOfflineDistributionSheet(csvText) {
  const rows = splitCsvRows(csvText);
  const pods = [];

  for (const row of rows.slice(1)) {
    const fields = parseCsvLine(row);
    const region = trim(fields[0]);
    if (!region) continue;

    pods.push({
      id: `${region}::${trim(fields[4])}::${trim(fields[1])}::${pods.length}`,
      region,
      focusArea: trim(fields[1]) || null,
      mapping: trim(fields[2]) || null,
      segment: trim(fields[3]) || null,
      podName: trim(fields[4]) || null,
      chiliPiperRule: trim(fields[5]) || null,
      segmentRules: trim(fields[6]) || null,
      bdr: trim(fields[7]) || null,
      bdr1: trim(fields[8]) || null,
      bdr2: trim(fields[9]) || null,
      salesRep1: trim(fields[10]) || null,
      salesRep2: trim(fields[11]) || null,
      manager: trim(fields[12]) || null,
      bdrManager: trim(fields[13]) || null,
      statusNote: trim(fields[15]) || null,
      newHireBdr: trim(fields[16]) || null,
      newHireAe1: trim(fields[17]) || null,
      newHireAe2: trim(fields[18]) || null,
      seniorBdr: trim(fields[19]) || null,
      seniorAe1: trim(fields[20]) || null,
      seniorAe2: trim(fields[21]) || null,
    });
  }

  const regions = [...new Set(pods.map((p) => p.region))].sort();
  return { pods, regions };
}

async function buildRoutingFromCsvStrings(conciergeCsv, offlineCsv, meta) {
  const concierge = parseConciergeSheet(conciergeCsv);
  const offline = parseOfflineDistributionSheet(offlineCsv);
  return buildRoutingPayload(concierge, offline, meta);
}

export async function loadRoutingFromFiles(conciergePath, offlinePath) {
  const [conciergeCsv, offlineCsv] = await Promise.all([
    fs.readFile(conciergePath, "utf8"),
    fs.readFile(offlinePath, "utf8"),
  ]);
  return buildRoutingFromCsvStrings(conciergeCsv, offlineCsv, {
    source: "csv",
    conciergePath,
    offlinePath,
  });
}

const SHEET_GIDS = {
  concierge: "0",
  offline: "1420297909",
};

export async function fetchRoutingFromGoogle(spreadsheetId) {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  const [conciergeRes, offlineRes] = await Promise.all([
    fetch(`${base}&gid=${SHEET_GIDS.concierge}`),
    fetch(`${base}&gid=${SHEET_GIDS.offline}`),
  ]);
  if (!conciergeRes.ok || !offlineRes.ok) {
    throw new Error(
      `Failed to fetch spreadsheet (concierge: ${conciergeRes.status}, offline: ${offlineRes.status})`,
    );
  }
  const conciergeCsv = await conciergeRes.text();
  const offlineCsv = await offlineRes.text();
  return buildRoutingFromCsvStrings(conciergeCsv, offlineCsv, {
    source: "google-sheets",
    spreadsheetId,
    fetchedAt: new Date().toISOString(),
  });
}
