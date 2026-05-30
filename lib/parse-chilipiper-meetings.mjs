import { parseCsvLine, splitCsvRows } from "./parse-csv-line.mjs";
import { classifyMeetingOutcome, outcomeFlags } from "./meeting-outcome.mjs";

function trim(v) {
  return (v ?? "").trim();
}

function rowYear(fields, idx, year) {
  const booked = fields[idx.BOOKED_AT] ?? "";
  return booked.includes(String(year));
}

function meetingTypeFromSource(source) {
  const s = trim(source);
  if (s === "Concierge") return "concierge";
  if (s === "Handoff") return "handoff";
  if (s === "ChiliCal") return "chilical";
  return "other";
}

function isGuestEmail(email) {
  const e = trim(email).toLowerCase();
  return !e || e === "guest";
}

/**
 * Parse Chili Piper unified export (`Meeting_new.csv`).
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
    const handedOffBy = trim(fields[idx.HANDED_OFF_BY]) || null;
    const handedOffTo = trim(fields[idx.HANDED_OFF_TO]) || null;
    const outcome = classifyMeetingOutcome(fields, idx);
    const flags = outcomeFlags(outcome);
    const happened = flags.happened;

    const raw = {};
    for (let i = 0; i < headers.length; i++) {
      if (headers[i]) raw[headers[i]] = trim(fields[i]);
    }

    const meetingId = trim(fields[idx.MEETING_ID]) || `meeting::${rowIdx}`;
    const company = trim(fields[idx.COMPANY]) || trim(fields[idx.ACCOUNT_NAME]) || null;
    const region = trim(fields[idx.REGION]) || null;
    const routeId = trim(fields[idx.MATCHED_ROUTE_ID]) || null;
    const assignedUserId = trim(fields[idx.PRIMARY_ASSIGNED_USER_ID]) || null;
    const offerResult = trim(fields[idx.MEETING_OFFER_RESULT]) || null;
    const meetingOffered = trim(fields[idx.WAS_MEETING_OFFERED]).toUpperCase() === "TRUE";

    let bdr = null;
    let ae = hostEmail;
    if (meetingType === "handoff") {
      bdr = handedOffBy || (!isGuestEmail(bookerEmail) ? bookerEmail : null);
      ae = handedOffTo || hostEmail;
    } else if (!isGuestEmail(bookerEmail) && bookerEmail !== hostEmail) {
      bdr = bookerEmail;
    }

    meetings.push({
      id: meetingId,
      meetingType,
      sourceType: sourceType || null,
      email: null,
      company,
      country: null,
      contactState: null,
      region,
      routingRuleId: routeId,
      routingRuleName: null,
      routingRuleRegion: null,
      assignedUserId,
      bdr,
      ae,
      bookedAt: trim(fields[idx.BOOKED_AT]) || null,
      meetingAt: null,
      status: trim(fields[idx.MEETING_STATUS]) || null,
      outcome,
      canceled: flags.canceled,
      rescheduled: flags.rescheduled,
      noShow: flags.noShow,
      title: company,
      booked: true,
      bookedLive:
        meetingType === "concierge" &&
        (offerResult === "MeetingOfferScheduledLogResult" || meetingOffered || !offerResult),
      happened,
      handoffToAe: meetingType === "handoff",
      meetingOffered,
      meetingOfferResult: offerResult,
      raw,
    });
  }

  return { meetings, headers, year, skipped };
}

/** Funnel-style counts from Concierge rows in the unified export. */
export function parseMeetingExportFunnel(meetings, year) {
  const concierge = meetings.filter((m) => m.meetingType === "concierge");
  const byStatus = {};
  let meetingOffered = 0;
  let scheduled = 0;

  for (const m of concierge) {
    const status = m.status || "Unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (m.meetingOffered) meetingOffered++;
    if (m.meetingOfferResult === "MeetingOfferScheduledLogResult") scheduled++;
  }

  return {
    year,
    total: concierge.length,
    byStatus,
    meetingOffered,
    scheduled,
    timedOut: 0,
    disqualified: 0,
    cancelled: byStatus.Canceled ?? 0,
  };
}
