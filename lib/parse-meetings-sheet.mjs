import { parseCsvLine, splitCsvRows } from "./parse-csv-line.mjs";

function trim(v) {
  return (v ?? "").trim();
}

function normalizeHeader(h) {
  return trim(h).toLowerCase().replace(/\s+/g, " ");
}

/** @param {string} list - comma-separated header aliases from env */
export function headerAliasesFromEnv(list) {
  if (!list) return [];
  return list.split(",").map((s) => normalizeHeader(s)).filter(Boolean);
}

function buildHeaderIndex(headerRow, extraAliases = []) {
  const index = new Map();
  for (let i = 0; i < headerRow.length; i++) {
    const key = normalizeHeader(headerRow[i]);
    if (key && !index.has(key)) index.set(key, i);
  }
  for (const alias of extraAliases) {
    const key = normalizeHeader(alias);
    if (key && !index.has(key)) {
      const hit = headerRow.findIndex((h) => normalizeHeader(h) === key);
      if (hit >= 0) index.set(key, hit);
    }
  }
  return index;
}

function pickField(fields, headerIndex, aliases) {
  for (const alias of aliases) {
    const idx = headerIndex.get(normalizeHeader(alias));
    if (idx != null && idx < fields.length) {
      const v = trim(fields[idx]);
      if (v) return v;
    }
  }
  return "";
}

function isTruthyCell(value) {
  const v = trim(value).toLowerCase();
  if (!v) return false;
  if (["yes", "y", "true", "1", "x", "✓", "checked"].includes(v)) return true;
  if (["no", "n", "false", "0", ""].includes(v)) return false;
  return v.length > 0 && !/^no\b/i.test(v);
}

const DEFAULT_STATUS_ALIASES = [
  "meeting status",
  "status",
  "outcome",
  "meeting outcome",
  "result",
  "disposition",
];

const DEFAULT_BOOKED_LIVE_ALIASES = [
  "booked live",
  "live booking",
  "live book",
  "booking type",
  "book type",
  "concierge live",
];

const DEFAULT_HAPPENED_ALIASES = [
  "meeting held",
  "held",
  "attended",
  "completed",
  "show",
  "showed",
];

const DEFAULT_HANDOFF_ALIASES = [
  "handoff to ae",
  "bdr handoff",
  "handoff",
  "hand off",
  "ae handoff",
  "transferred to ae",
];

const DEFAULT_EMAIL_ALIASES = ["email", "lead email", "contact email", "prospect email"];
const DEFAULT_COMPANY_ALIASES = ["company", "account", "account name", "organization"];
const DEFAULT_REGION_ALIASES = ["region", "geo", "territory", "market"];
const DEFAULT_BDR_ALIASES = ["bdr", "bdr name", "sdr", "booked by"];
const DEFAULT_AE_ALIASES = ["ae", "ae name", "account executive", "sales rep", "owner"];
const DEFAULT_BOOKED_AT_ALIASES = ["booked at", "booked date", "created", "created at", "date booked"];
const DEFAULT_MEETING_AT_ALIASES = [
  "meeting date",
  "meeting time",
  "scheduled",
  "scheduled at",
  "start time",
];

function statusImpliesBookedLive(status) {
  const s = status.toLowerCase();
  return /\blive\b/.test(s) && /\bbook/.test(s);
}

function statusImpliesHappened(status) {
  const s = status.toLowerCase();
  return (
    /\b(held|completed|happened|attended|showed|show|completed meeting)\b/.test(s) &&
    !/\b(no[- ]?show|cancel|cancelled|canceled|resched)\b/.test(s)
  );
}

function statusImpliesHandoff(status) {
  const s = status.toLowerCase();
  if (!s) return false;
  if (/\b(awaiting|pending|not yet|before)\b/.test(s) && /\bhandoff\b/.test(s)) {
    return false;
  }
  return /\b(handoff|hand off|handed off|transferred to ae|bdr.?to.?ae)\b/.test(s);
}

function statusImpliesBooked(status) {
  const s = status.toLowerCase();
  if (!s) return false;
  if (/\b(no[- ]?show|cancel|cancelled|canceled|declined|rejected)\b/.test(s)) {
    return /\bbook/.test(s);
  }
  return /\b(book|booked|scheduled|confirmed|live)\b/.test(s);
}

/**
 * Parse a meetings tab (header row + data).
 * @param {string} csvText
 * @param {{ meetingType: 'concierge' | 'handoff', columnAliases?: Record<string, string[]> }} opts
 */
export function parseMeetingsSheet(csvText, opts = {}) {
  const { meetingType = "concierge", columnAliases = {} } = opts;
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) {
    return { meetings: [], headers: [], meetingType };
  }

  const headerRow = parseCsvLine(rows[0]);
  const statusAliases = [
    ...DEFAULT_STATUS_ALIASES,
    ...headerAliasesFromEnv(columnAliases.status),
  ];
  const bookedLiveAliases = [
    ...DEFAULT_BOOKED_LIVE_ALIASES,
    ...headerAliasesFromEnv(columnAliases.bookedLive),
  ];
  const happenedAliases = [
    ...DEFAULT_HAPPENED_ALIASES,
    ...headerAliasesFromEnv(columnAliases.happened),
  ];
  const handoffAliases = [
    ...DEFAULT_HANDOFF_ALIASES,
    ...headerAliasesFromEnv(columnAliases.handoff),
  ];

  const headerIndex = buildHeaderIndex(headerRow, [
    ...statusAliases,
    ...bookedLiveAliases,
    ...happenedAliases,
    ...handoffAliases,
  ]);

  const meetings = [];

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const fields = parseCsvLine(rows[rowIdx]);
    if (fields.every((f) => !trim(f))) continue;

    const status = pickField(fields, headerIndex, statusAliases);
    const bookedLiveRaw = pickField(fields, headerIndex, bookedLiveAliases);
    const happenedRaw = pickField(fields, headerIndex, happenedAliases);
    const handoffRaw = pickField(fields, headerIndex, handoffAliases);

    const bookedLive =
      isTruthyCell(bookedLiveRaw) ||
      statusImpliesBookedLive(bookedLiveRaw) ||
      statusImpliesBookedLive(status) ||
      (meetingType === "concierge" && /\blive\b/i.test(bookedLiveRaw));

    const happened =
      isTruthyCell(happenedRaw) ||
      statusImpliesHappened(happenedRaw) ||
      statusImpliesHappened(status);

    const handoffToAe =
      isTruthyCell(handoffRaw) ||
      statusImpliesHandoff(handoffRaw) ||
      statusImpliesHandoff(status);

    const email = pickField(fields, headerIndex, [
      ...DEFAULT_EMAIL_ALIASES,
      ...headerAliasesFromEnv(columnAliases.email),
    ]);
    const company = pickField(fields, headerIndex, [
      ...DEFAULT_COMPANY_ALIASES,
      ...headerAliasesFromEnv(columnAliases.company),
    ]);

    const raw = {};
    for (let i = 0; i < headerRow.length; i++) {
      const key = trim(headerRow[i]);
      if (key) raw[key] = trim(fields[i]);
    }

    meetings.push({
      id: `${meetingType}::${rowIdx}`,
      meetingType,
      email: email || null,
      company: company || null,
      region:
        pickField(fields, headerIndex, [
          ...DEFAULT_REGION_ALIASES,
          ...headerAliasesFromEnv(columnAliases.region),
        ]) || null,
      bdr:
        pickField(fields, headerIndex, [
          ...DEFAULT_BDR_ALIASES,
          ...headerAliasesFromEnv(columnAliases.bdr),
        ]) || null,
      ae:
        pickField(fields, headerIndex, [
          ...DEFAULT_AE_ALIASES,
          ...headerAliasesFromEnv(columnAliases.ae),
        ]) || null,
      bookedAt:
        pickField(fields, headerIndex, [
          ...DEFAULT_BOOKED_AT_ALIASES,
          ...headerAliasesFromEnv(columnAliases.bookedAt),
        ]) || null,
      meetingAt:
        pickField(fields, headerIndex, [
          ...DEFAULT_MEETING_AT_ALIASES,
          ...headerAliasesFromEnv(columnAliases.meetingAt),
        ]) || null,
      status: status || null,
      booked: statusImpliesBooked(status) || bookedLive || Boolean(email || company),
      bookedLive,
      happened,
      handoffToAe,
      raw,
    });
  }

  return {
    meetings,
    headers: headerRow.map((h) => trim(h)).filter(Boolean),
    meetingType,
  };
}
