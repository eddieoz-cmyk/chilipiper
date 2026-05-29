import { parseCsvLine, splitCsvRows } from "./parse-csv-line.mjs";
import { classifyMeetingOutcome, outcomeFlags } from "./meeting-outcome.mjs";

function trim(v) {
  return (v ?? "").trim();
}

function rowYear(fields, idx, year) {
  const booked = fields[idx.BOOKED_AT] ?? "";
  return booked.includes(String(year));
}

function meetingHappened(fields, idx) {
  return classifyMeetingOutcome(fields, idx) === "happened";
}

function meetingTypeFromSource(source) {
  const s = trim(source);
  if (s === "Concierge") return "concierge";
  if (s === "Handoff") return "handoff";
  if (s === "ChiliCal") return "chilical";
  return "other";
}

/**
 * Parse Chili Piper `meetings.csv` export.
 * @param {string} csvText
 * @param {{ year?: number }} opts
 */
export function parseChilipiperMeetingsCsv(csvText, opts = {}) {
  const year = opts.year ?? (Number(process.env.CHILIPIPER_YEAR) || 2026);
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) {
    return { meetings: [], headers: [], year, skipped: 0 };
  }

  const headerRow = parseCsvLine(rows[0]);
  const headers = headerRow.map((h) => trim(h));
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

  const meetings = [];
  let skipped = 0;

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const fields = parseCsvLine(rows[rowIdx]);
    if (!rowYear(fields, idx, year)) {
      skipped++;
      continue;
    }

    const sourceType = trim(fields[idx.MEETING_SOURCE_TYPE]);
    const meetingType = meetingTypeFromSource(sourceType);
    const hostEmail = trim(fields[idx.HOST_EMAIL]) || null;
    const bookerEmail = trim(fields[idx.BOOKER_EMAIL]) || null;
    const outcome = classifyMeetingOutcome(fields, idx);
    const flags = outcomeFlags(outcome);
    const happened = flags.happened;

    const raw = {};
    for (let i = 0; i < headers.length; i++) {
      if (headers[i]) raw[headers[i]] = trim(fields[i]);
    }

    const meetingId = trim(fields[idx.MEETING_ID]) || `meeting::${rowIdx}`;

    meetings.push({
      id: meetingId,
      meetingType,
      sourceType: sourceType || null,
      email: trim(fields[idx.PRIMARY_GUEST_EMAIL]) || null,
      company: null,
      country: null,
      contactState: null,
      region: null,
      routingRuleId: trim(fields[idx.MEETING_SOURCE_ROUTING_ID]) || null,
      routingRuleName: null,
      routingRuleRegion: null,
      bdr: bookerEmail && bookerEmail !== hostEmail ? bookerEmail : bookerEmail,
      ae: hostEmail,
      bookedAt: trim(fields[idx.BOOKED_AT]) || null,
      meetingAt: trim(fields[idx.MEETING_START_TIME]) || null,
      status: trim(fields[idx.EXTENDED_MEETING_STATUS]) || trim(fields[idx.MEETING_STATUS]) || null,
      outcome,
      canceled: flags.canceled,
      rescheduled: flags.rescheduled,
      noShow: flags.noShow,
      title: trim(fields[idx.TITLE]) || null,
      booked: true,
      bookedLive: meetingType === "concierge",
      happened,
      handoffToAe: meetingType === "handoff",
      raw,
    });
  }

  return { meetings, headers, year, skipped };
}
