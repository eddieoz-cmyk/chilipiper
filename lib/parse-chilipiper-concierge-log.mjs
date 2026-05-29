import { parseCsvLine, splitCsvRows } from "./parse-csv-line.mjs";

function trim(v) {
  return (v ?? "").trim();
}

/**
 * Concierge live-booking log (`concierge.csv`) — funnel counts, not calendar meetings.
 */
export function parseChilipiperConciergeLogCsv(csvText, opts = {}) {
  const year = opts.year ?? (Number(process.env.CHILIPIPER_YEAR) || 2026);
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) {
    return { year, total: 0, byStatus: {}, meetingOffered: 0, scheduled: 0 };
  }

  const headerRow = parseCsvLine(rows[0]);
  const headers = headerRow.map((h) => trim(h));
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

  const byStatus = {};
  let meetingOffered = 0;
  let scheduled = 0;
  let total = 0;

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const fields = parseCsvLine(rows[rowIdx]);
    const triggered = trim(fields[idx.TRIGGERED_AT]);
    if (!triggered.includes(String(year))) continue;

    total++;
    const status = trim(fields[idx.STATUS]) || "Unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    if (trim(fields[idx.WAS_MEETING_OFFERED]).toUpperCase() === "TRUE") {
      meetingOffered++;
    }
    if (status === "Scheduled") scheduled++;
  }

  return {
    year,
    total,
    byStatus,
    meetingOffered,
    scheduled,
    timedOut: byStatus.TimedOut ?? 0,
    disqualified: byStatus.Disqualified ?? 0,
    cancelled: byStatus.Cancelled ?? 0,
  };
}
