/** Client + server shared report aggregations for website meetings. */

function trim(v) {
  return (v ?? "").trim();
}

export function parseMeetingDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function meetingDate(m, dateField = "bookedAt") {
  return parseMeetingDate(m[dateField]) ?? parseMeetingDate(m.bookedAt) ?? parseMeetingDate(m.meetingAt);
}

export function repKeysForMeeting(m) {
  const keys = new Set();
  if (m.assignedUserId) keys.add(`id:${m.assignedUserId}`);
  if (m.assignedUser?.id) keys.add(`id:${m.assignedUser.id}`);
  if (m.assignedUser?.name) keys.add(`name:${m.assignedUser.name}`);
  if (m.assignedUserName) keys.add(`name:${m.assignedUserName}`);
  const primary = primaryRepKey(m);
  if (primary !== "unknown") keys.add(primary);
  return [...keys];
}

export function meetingMatchesRep(m, repKey) {
  if (!repKey) return true;
  return repKeysForMeeting(m).includes(repKey);
}

export function primaryRepPerson(m) {
  return m.assignedUser ?? null;
}

export function primaryRepKey(m) {
  const person = primaryRepPerson(m);
  if (person?.id) return `id:${person.id}`;
  if (person?.name) return `name:${person.name}`;
  if (m.assignedUserName) return `name:${m.assignedUserName}`;
  return "unknown";
}

export function primaryRepName(m) {
  const person = primaryRepPerson(m);
  return person?.name ?? m.assignedUserName ?? "Unknown";
}

export function websiteFilterActive(filters) {
  return Boolean(filters?.routingRuleId || filters?.region);
}

function applyDateFilter(rows, filters) {
  const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`) : null;
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999Z`) : null;
  const dateField = filters.dateField ?? "bookedAt";
  if (!from && !to) return rows;

  return rows.filter((m) => {
    const d = meetingDate(m, dateField);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

export function buildRepsFromMeetings(meetings) {
  const reps = new Map();

  function addPerson(key, person) {
    if (!key || key === "unknown" || reps.has(key)) return;
    reps.set(key, {
      key,
      id: person?.id ?? (key.startsWith("id:") ? key.slice(3) : null),
      name: person?.name ?? key.replace(/^id:|^name:/, ""),
      email: person?.email ?? null,
    });
  }

  for (const m of meetings ?? []) {
    if (m.assignedUser?.id) addPerson(`id:${m.assignedUser.id}`, m.assignedUser);
    if (m.assignedUser?.name) addPerson(`name:${m.assignedUser.name}`, m.assignedUser);
    if (m.assignedUserName) addPerson(`name:${m.assignedUserName}`, { name: m.assignedUserName });
    const pk = primaryRepKey(m);
    if (pk !== "unknown") addPerson(pk, primaryRepPerson(m));
  }

  return [...reps.values()].sort((a, b) => (a.name ?? a.key).localeCompare(b.name ?? b.key));
}

export function applyMeetingFilters(meetings, filters) {
  let rows = applyDateFilter(meetings ?? [], filters);

  if (filters.websiteStatus) {
    rows = rows.filter((m) => m.websiteStatus === filters.websiteStatus);
  }
  if (filters.region) {
    rows = rows.filter((m) => m.region === filters.region || m.country === filters.region);
  }
  if (filters.routingRuleId) {
    rows = rows.filter((m) => m.routingRuleId === filters.routingRuleId);
  }
  if (filters.repKey) {
    rows = rows.filter((m) => meetingMatchesRep(m, filters.repKey));
  }

  return rows;
}

function bucketDate(m, dateField) {
  const d = meetingDate(m, dateField);
  return d ? d.toISOString().slice(0, 10) : "unknown";
}

function inc(map, key, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

function repLabel(person, fallbackName) {
  return person?.name ?? fallbackName ?? "Unknown";
}

export function computeLiveBookedReport(meetings, dateField = "bookedAt") {
  const live = meetings;
  const byDate = new Map();
  const byRegion = new Map();
  const byRule = new Map();

  for (const m of live) {
    inc(byDate, bucketDate(m, dateField));
    inc(byRegion, m.region ?? m.country ?? "Unknown");
    const ruleKey = m.routingRuleId ?? "unknown";
    if (!byRule.has(ruleKey)) {
      byRule.set(ruleKey, {
        ruleId: m.routingRuleId,
        ruleName: m.routingRuleName ?? "Unknown rule",
        region: m.region ?? m.routingRuleRegion ?? m.country,
        count: 0,
      });
    }
    byRule.get(ruleKey).count++;
  }

  return {
    total: live.length,
    booked: live.filter((m) => m.booked).length,
    byDate: [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
    byRegion: [...byRegion.entries()].sort((a, b) => b[1] - a[1]).map(([region, count]) => ({ region, count })),
    byRule: [...byRule.values()].sort((a, b) => b.count - a.count),
  };
}

export function computeRuleBdrDistribution(meetings) {
  const byRule = new Map();

  for (const m of meetings) {
    if (!m.routingRuleId && !m.routingRuleName) continue;
    const ruleKey = m.routingRuleId ?? `name:${m.routingRuleName}`;
    if (!byRule.has(ruleKey)) {
      byRule.set(ruleKey, {
        ruleId: m.routingRuleId,
        ruleName: m.routingRuleName ?? "Unknown",
        region: m.region ?? m.routingRuleRegion ?? m.country,
        total: 0,
        booked: 0,
        bdrs: new Map(),
      });
    }
    const rule = byRule.get(ruleKey);
    rule.total++;
    if (m.booked) rule.booked++;

    const bdrPerson = primaryRepPerson(m);
    const bdrKey = primaryRepKey(m);
    if (!rule.bdrs.has(bdrKey)) {
      rule.bdrs.set(bdrKey, {
        key: bdrKey,
        name: repLabel(bdrPerson, m.assignedUserName),
        count: 0,
        booked: 0,
      });
    }
    const bdr = rule.bdrs.get(bdrKey);
    bdr.count++;
    if (m.booked) bdr.booked++;
  }

  return [...byRule.values()]
    .map((r) => ({
      ...r,
      bdrs: [...r.bdrs.values()].sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.total - a.total);
}

export function computeOutcomeReport(meetings) {
  const counts = {
    scheduled: 0,
    not_scheduled: 0,
    disqualified: 0,
    canceled: 0,
    in_progress: 0,
    failed: 0,
    unknown: 0,
  };
  for (const m of meetings) {
    const o = m.outcome ?? "unknown";
    if (counts[o] != null) counts[o]++;
    else counts.unknown++;
  }
  const total = meetings.length;
  return { total, counts };
}

export function computeMeetingsReports(meetings, dateField = "bookedAt") {
  return {
    liveBooked: computeLiveBookedReport(meetings, dateField),
    ruleBdrDistribution: computeRuleBdrDistribution(meetings),
    outcomes: computeOutcomeReport(meetings),
  };
}
