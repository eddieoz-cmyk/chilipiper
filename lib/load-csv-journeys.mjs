import fs from "node:fs/promises";
import crypto from "node:crypto";

const SESSION_GAP_MS = 30 * 60 * 1000;

/** Parse one CSV line respecting quoted fields. */
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function pathFromUrl(url) {
  if (!url?.trim()) return "(unknown page)";
  try {
    const u = new URL(url.trim());
    return u.pathname + (u.hash || "");
  } catch {
    return url.trim();
  }
}

function titleFromPath(pathStr) {
  if (!pathStr || pathStr === "(unknown page)") return "Unknown page";
  const slug = pathStr.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).pop();
  if (!slug) return "Home";
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\.[a-z]+$/i, "")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function mqlId(email, mqlDate) {
  const key = `${email.toLowerCase()}|${mqlDate}`;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
}

function groupIntoSessions(events) {
  if (events.length === 0) return [];
  const sorted = [...events].sort(
    (a, b) => new Date(a.ts) - new Date(b.ts),
  );
  const sessions = [];
  let current = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].ts).getTime();
    const next = new Date(sorted[i].ts).getTime();
    if (next - prev > SESSION_GAP_MS) {
      sessions.push(current);
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  sessions.push(current);
  return sessions;
}

export async function loadJourneysFromCsv(csvPath) {
  const text = await fs.readFile(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

  const required = ["MQL_EMAIL", "DATE_MQL", "EVENT_TIMESTAMP"];
  for (const col of required) {
    if (idx[col] === undefined) {
      throw new Error(`CSV missing required column: ${col}`);
    }
  }

  const byMql = new Map();

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length < headers.length) continue;

    const email = (row[idx.MQL_EMAIL] ?? "").trim().toLowerCase();
    const mqlDateRaw = (row[idx.DATE_MQL] ?? "").trim();
    const eventTs = (row[idx.EVENT_TIMESTAMP] ?? "").trim();
    const pageUrl = (row[idx.PAGEVIEW_URL] ?? "").trim();
    const matchType =
      idx.MATCH_TYPE !== undefined ? (row[idx.MATCH_TYPE] ?? "").trim() : "";
    const leadStatus =
      idx.LEAD_STATUS !== undefined ? (row[idx.LEAD_STATUS] ?? "").trim() : "";
    const lastCombinedScore =
      idx.LAST_COMBINED_SCORE !== undefined
        ? (row[idx.LAST_COMBINED_SCORE] ?? "").trim()
        : "";
    const mainSegment =
      idx.MAIN_SEGMENT !== undefined ? (row[idx.MAIN_SEGMENT] ?? "").trim() : "";
    const mainOwnerName =
      idx.MAIN_OWNER_NAME !== undefined
        ? (row[idx.MAIN_OWNER_NAME] ?? "").trim()
        : "";
    const nurtureReason =
      idx.CURR_NURTURING_REASON !== undefined
        ? (row[idx.CURR_NURTURING_REASON] ?? "").trim()
        : "";

    if (!email || !mqlDateRaw) continue;

    const mqlKey = `${email}|${mqlDateRaw}`;
    if (!byMql.has(mqlKey)) {
      byMql.set(mqlKey, {
        id: mqlId(email, mqlDateRaw),
        email,
        mqlDate: new Date(mqlDateRaw).toISOString(),
        leadStatus,
        lastCombinedScore,
        mainSegment,
        mainOwnerName,
        nurtureReason,
        events: [],
      });
    }

    if (!eventTs) continue;
    const eventTime = new Date(eventTs).getTime();
    const mqlTime = new Date(mqlDateRaw).getTime();
    if (Number.isNaN(eventTime) || eventTime <= mqlTime) continue;

    byMql.get(mqlKey).events.push({
      ts: new Date(eventTs).toISOString(),
      url: pageUrl,
      matchType,
    });
  }

  const journeys = [];

  for (const record of byMql.values()) {
    const sessions = groupIntoSessions(record.events);
    const visits = sessions.map((sessionEvents) => {
      const pages = sessionEvents.map((ev) => {
        const p = pathFromUrl(ev.url);
        return {
          path: p,
          title: titleFromPath(p),
          viewedAt: ev.ts,
          url: ev.url || null,
        };
      });
      return {
        returnedAt: sessionEvents[0].ts,
        matchType: sessionEvents[0].matchType || null,
        pages,
      };
    });

    journeys.push({
      id: record.id,
      email: record.email,
      mqlDate: record.mqlDate,
      leadStatus: record.leadStatus || null,
      lastCombinedScore: record.lastCombinedScore || null,
      mainSegment: record.mainSegment || null,
      mainOwnerName: record.mainOwnerName || null,
      nurtureReason: record.nurtureReason || null,
      visits,
    });
  }

  journeys.sort((a, b) => new Date(b.mqlDate) - new Date(a.mqlDate));
  return journeys;
}
