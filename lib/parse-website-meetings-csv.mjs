import { parseCsvLine, splitCsvRows } from "./parse-csv-line.mjs";

function trim(v) {
  return (v ?? "").trim();
}

function rowYear(dateValue, year) {
  return (dateValue ?? "").includes(String(year));
}

/** Map Chili Piper website log status to dashboard outcome. */
export function classifyWebsiteLogStatus(status) {
  const s = trim(status);
  if (s === "Meeting Scheduled") {
    return {
      outcome: "scheduled",
      statusLabel: "Booked",
      booked: true,
      canceled: false,
      disqualified: false,
      isScheduled: true,
      happened: false,
      noShow: false,
    };
  }
  if (s === "Cancelled") {
    return {
      outcome: "canceled",
      statusLabel: "Canceled",
      booked: false,
      canceled: true,
      disqualified: false,
      isScheduled: false,
      happened: false,
      noShow: false,
    };
  }
  if (s === "Disqualified") {
    return {
      outcome: "disqualified",
      statusLabel: "Disqualified",
      booked: false,
      canceled: false,
      disqualified: true,
      isScheduled: false,
      happened: false,
      noShow: false,
    };
  }
  if (s === "Meeting Not Scheduled") {
    return {
      outcome: "not_scheduled",
      statusLabel: "Not booked",
      booked: false,
      canceled: false,
      disqualified: false,
      isScheduled: false,
      happened: false,
      noShow: false,
    };
  }
  if (s === "Scheduling Meeting") {
    return {
      outcome: "in_progress",
      statusLabel: "In progress",
      booked: false,
      canceled: false,
      disqualified: false,
      isScheduled: false,
      happened: false,
      noShow: false,
    };
  }
  if (s === "Failed") {
    return {
      outcome: "failed",
      statusLabel: "Failed",
      booked: false,
      canceled: false,
      disqualified: false,
      isScheduled: false,
      happened: false,
      noShow: false,
    };
  }
  return {
    outcome: "unknown",
    statusLabel: s || "Unknown",
    booked: false,
    canceled: false,
    disqualified: false,
    isScheduled: false,
    happened: false,
    noShow: false,
  };
}

export function isWebsiteMeetingsCsv(headers) {
  return headers.includes("Routing Rule Matched") && headers.includes("Assigned To");
}

/**
 * Parse Chili Piper website concierge log export.
 * @param {string} csvText
 * @param {{ year?: number }} opts
 */
export function parseWebsiteMeetingsCsv(csvText, opts = {}) {
  const year = opts.year ?? (Number(process.env.CHILIPIPER_YEAR) || 2026);
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) {
    return { meetings: [], headers: [], year, skipped: 0, schema: "website-log" };
  }

  const headerRow = parseCsvLine(rows[0]);
  const headers = headerRow.map((h) => trim(h));
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

  const meetings = [];
  let skipped = 0;

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const fields = parseCsvLine(rows[rowIdx]);
    const date = trim(fields[idx.Date]);
    if (!rowYear(date, year)) {
      skipped++;
      continue;
    }

    const status = trim(fields[idx.Status]);
    const flags = classifyWebsiteLogStatus(status);
    const ruleName = trim(fields[idx["Routing Rule Matched"]]) || null;
    const assignedTo = trim(fields[idx["Assigned To"]]) || null;
    const company = trim(fields[idx.Company]) || null;
    const country = trim(fields[idx.Country]) || trim(fields[idx["CB Company Country"]]) || null;
    const crmUrl = trim(fields[idx["CRM Record"]]) || null;

    const raw = {};
    for (let i = 0; i < headers.length; i++) {
      if (headers[i]) raw[headers[i]] = trim(fields[i]);
    }

    meetings.push({
      id: `website::${rowIdx}`,
      meetingType: "concierge",
      sourceType: "Website",
      schema: "website-log",
      email: null,
      company,
      country,
      contactState: trim(fields[idx["CB Contact State"]]) || null,
      region: country,
      routingRuleId: ruleName ? `name:${ruleName}` : null,
      routingRuleName: ruleName,
      routingRuleRegion: null,
      routeRuleType: null,
      routeRuleTypeLabel: trim(fields[idx["Assignment Method"]]) || null,
      assignedUserId: null,
      assignedUserName: assignedTo,
      bdr: null,
      ae: null,
      bookedAt: date || null,
      meetingAt: null,
      status,
      extendedStatus: status,
      statusLabel: flags.statusLabel,
      websiteStatus: status,
      crmContactUrl: crmUrl,
      crmLeadOrContactId: null,
      outcome: flags.outcome,
      canceled: flags.canceled,
      disqualified: flags.disqualified,
      rescheduled: false,
      noShow: flags.noShow,
      isScheduled: flags.isScheduled,
      title: company,
      booked: flags.booked,
      bookedLive: flags.booked,
      happened: flags.happened,
      heldInferred: false,
      handoffToAe: false,
      meetingOffered: false,
      meetingOfferResult: null,
      assignmentMethod: trim(fields[idx["Assignment Method"]]) || null,
      trigger: trim(fields[idx.Trigger]) || null,
      spamCheckScore: trim(fields[idx["Spam Check Score"]]) || null,
      employeeCount: trim(fields[idx["Number of Employees"]]) || trim(fields[idx["CB Company Employees"]]) || null,
      raw,
    });
  }

  return { meetings, headers, year, skipped, schema: "website-log" };
}

export function parseWebsiteLogFunnel(meetings, year) {
  const byStatus = {};
  let booked = 0;

  for (const m of meetings) {
    const status = m.websiteStatus || m.status || "Unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (m.booked) booked++;
  }

  return {
    year,
    total: meetings.length,
    byStatus,
    meetingOffered: meetings.length,
    scheduled: booked,
    booked,
    timedOut: byStatus["Meeting Not Scheduled"] ?? 0,
    disqualified: byStatus.Disqualified ?? 0,
    cancelled: byStatus.Cancelled ?? 0,
  };
}
