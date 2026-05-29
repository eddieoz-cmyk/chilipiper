import { parseCsvLine, splitCsvRows } from "./parse-csv-line.mjs";

function trim(v) {
  return (v ?? "").trim();
}

export function normalizeGuestEmail(email) {
  return trim(email).toLowerCase();
}

/**
 * All website concierge sessions keyed by guest email (lowercase).
 * @returns {Map<string, Array<{ triggeredAt, status, matchedRouteId, primaryAssignedUserId, company, country }>>}
 */
export function buildConciergeGuestIndex(csvText, yearFilter = null) {
  const rows = splitCsvRows(csvText);
  const index = new Map();
  if (rows.length < 2) return index;

  const headerRow = parseCsvLine(rows[0]);
  const headers = headerRow.map((h) => trim(h));
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const year = yearFilter ? String(yearFilter) : null;

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const fields = parseCsvLine(rows[rowIdx]);
    const email = normalizeGuestEmail(fields[idx.GUEST_EMAIL]);
    if (!email) continue;

    const triggeredAt = trim(fields[idx.TRIGGERED_AT]);
    if (year && !triggeredAt.includes(year)) continue;

    const session = {
      triggeredAt,
      status: trim(fields[idx.STATUS]) || null,
      matchedRouteId: trim(fields[idx.MATCHED_ROUTE_ID]) || null,
      primaryAssignedUserId: trim(fields[idx.PRIMARY_ASSIGNED_USER_ID]) || null,
      meetingId: trim(fields[idx.MEETING_ID]) || null,
      company: trim(fields[idx.COMPANY]) || null,
      country: trim(fields[idx.COUNTRY]) || null,
    };

    if (!index.has(email)) index.set(email, []);
    index.get(email).push(session);
  }

  for (const sessions of index.values()) {
    sessions.sort((a, b) => a.triggeredAt.localeCompare(b.triggeredAt));
  }

  return index;
}

export function parseMeetingInstant(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Best prior website session for a handoff guest (latest before handoff booked). */
export function findPriorConciergeSession(guestIndex, guestEmail, bookedAt) {
  const email = normalizeGuestEmail(guestEmail);
  if (!email) return null;

  const sessions = guestIndex.get(email);
  if (!sessions?.length) return null;

  const booked = parseMeetingInstant(bookedAt);
  let pool = sessions;
  if (booked) {
    const before = sessions.filter((s) => {
      const t = parseMeetingInstant(s.triggeredAt);
      return t && t <= booked;
    });
    if (before.length) pool = before;
  }

  return pool[pool.length - 1];
}
