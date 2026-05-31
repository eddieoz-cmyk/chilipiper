/** Client + server shared report aggregations (meetings.csv = source of truth). */

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
  const keys = [];
  if (m.assignedUserId) keys.push(`id:${m.assignedUserId}`);
  if (m.assignedUser?.email) keys.push(`email:${m.assignedUser.email}`);
  if (m.hostUser?.id) keys.push(`id:${m.hostUser.id}`);
  if (m.hostUser?.email) keys.push(`email:${m.hostUser.email}`);
  if (m.bookerUser?.id) keys.push(`id:${m.bookerUser.id}`);
  if (m.bookerUser?.email) keys.push(`email:${m.bookerUser.email}`);
  if (m.ae) keys.push(`email:${m.ae}`);
  if (m.bdr) keys.push(`email:${m.bdr}`);
  return keys;
}

export function meetingMatchesRep(m, repKey) {
  if (!repKey) return true;
  return repKeysForMeeting(m).includes(repKey);
}

/** BDR / owning rep for dashboards — handoffs credit the BDR, not the AE host. */
export function primaryRepPerson(m) {
  if (m.meetingType === "handoff") return m.bookerUser ?? null;
  if (m.meetingType === "concierge") return m.assignedUser ?? null;
  if (m.meetingType === "chilical") return m.hostUser ?? m.bookerUser ?? null;
  return m.assignedUser ?? m.hostUser ?? m.bookerUser ?? null;
}

export function primaryRepKey(m) {
  const person = primaryRepPerson(m);
  if (person?.id) return `id:${person.id}`;
  if (person?.email) return `email:${person.email}`;
  if (m.meetingType === "handoff" && m.bdr) return `email:${m.bdr}`;
  return "unknown";
}

export function primaryRepName(m) {
  const person = primaryRepPerson(m);
  return person?.name ?? "Unknown";
}

export function applyMeetingFilters(meetings, filters) {
  let rows = meetings ?? [];
  const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`) : null;
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999Z`) : null;
  const dateField = filters.dateField ?? "meetingAt";

  if (from || to) {
    rows = rows.filter((m) => {
      const d = meetingDate(m, dateField);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  if (filters.region) rows = rows.filter((m) => m.region === filters.region);
  if (filters.routingRuleId) rows = rows.filter((m) => m.routingRuleId === filters.routingRuleId);
  if (filters.meetingType) rows = rows.filter((m) => m.meetingType === filters.meetingType);
  if (filters.repKey) rows = rows.filter((m) => meetingMatchesRep(m, filters.repKey));

  return rows;
}

function bucketDate(m, dateField) {
  const d = meetingDate(m, dateField);
  return d ? d.toISOString().slice(0, 10) : "unknown";
}

function inc(map, key, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

function repLabel(person, fallbackEmail) {
  return person?.name ?? person?.email ?? fallbackEmail ?? "Unknown";
}

/** Website inbound meetings booked in the selected period. */
export function computeLiveBookedReport(meetings, dateField = "bookedAt") {
  const live = meetings.filter((m) => m.meetingType === "concierge");
  const byDate = new Map();
  const byRegion = new Map();
  const byRule = new Map();

  for (const m of live) {
    inc(byDate, bucketDate(m, dateField));
    inc(byRegion, m.region ?? m.routingRuleRegion ?? "Unknown");
    const ruleKey = m.routingRuleId ?? "unknown";
    if (!byRule.has(ruleKey)) {
      byRule.set(ruleKey, {
        ruleId: m.routingRuleId,
        ruleName: m.routingRuleName ?? "Unknown rule",
        region: m.region ?? m.routingRuleRegion,
        count: 0,
      });
    }
    byRule.get(ruleKey).count++;
  }

  return {
    total: live.length,
    byDate: [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
    byRegion: [...byRegion.entries()].sort((a, b) => b[1] - a[1]).map(([region, count]) => ({ region, count })),
    byRule: [...byRule.values()].sort((a, b) => b.count - a.count),
  };
}

/** Per routing rule: how many meetings each BDR/assignee received (from website log assignee or booker). */
export function computeRuleBdrDistribution(meetings) {
  const byRule = new Map();

  for (const m of meetings) {
    if (!m.routingRuleId) continue;
    const ruleKey = m.routingRuleId;
    if (!byRule.has(ruleKey)) {
      byRule.set(ruleKey, {
        ruleId: m.routingRuleId,
        ruleName: m.routingRuleName ?? "Unknown",
        region: m.region ?? m.routingRuleRegion,
        total: 0,
        bdrs: new Map(),
      });
    }
    const rule = byRule.get(ruleKey);
    rule.total++;

    const bdrPerson = primaryRepPerson(m) ?? m.bookerUser;
    const bdrKey = bdrPerson?.id ? `id:${bdrPerson.id}` : bdrPerson?.email ? `email:${bdrPerson.email}` : "unknown";
    if (!rule.bdrs.has(bdrKey)) {
      rule.bdrs.set(bdrKey, {
        key: bdrKey,
        name: repLabel(bdrPerson, m.bdr),
        email: bdrPerson?.email ?? m.bdr ?? null,
        count: 0,
      });
    }
    rule.bdrs.get(bdrKey).count++;
  }

  return [...byRule.values()]
    .map((r) => ({
      ...r,
      bdrs: [...r.bdrs.values()].sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.total - a.total);
}

export function computeOutcomeReport(meetings) {
  const counts = { scheduled: 0, canceled: 0, rescheduled: 0, noshow: 0, completed: 0, unknown: 0 };
  for (const m of meetings) {
    const o = m.outcome ?? (m.canceled ? "canceled" : m.isScheduled ? "scheduled" : "unknown");
    if (counts[o] != null) counts[o]++;
    else counts.unknown++;
  }
  const total = meetings.length;
  return { total, counts };
}

export function computeHandoffReport(meetings) {
  const handoffs = meetings.filter((m) => m.meetingType === "handoff");
  const pairs = new Map();
  const rows = [];

  for (const m of handoffs) {
    const bdr = m.bookerUser ?? { name: null, email: m.bdr };
    const ae = m.hostUser ?? { name: null, email: m.ae };
    const pairKey = `${bdr.email ?? bdr.name}::${ae.email ?? ae.name}`;
    if (!pairs.has(pairKey)) {
      pairs.set(pairKey, {
        bdrName: repLabel(bdr, m.bdr),
        bdrEmail: bdr.email ?? m.bdr,
        aeName: repLabel(ae, m.ae),
        aeEmail: ae.email ?? m.ae,
        total: 0,
        scheduled: 0,
        canceled: 0,
        fromRouter: 0,
        fromOwnership: 0,
        unlinked: 0,
      });
    }
    const p = pairs.get(pairKey);
    p.total++;
    if (m.isScheduled) p.scheduled++;
    if (m.canceled) p.canceled++;
    const origin = m.handoffRouteOrigin ?? "unlinked";
    if (origin === "router") p.fromRouter++;
    else if (origin === "ownership") p.fromOwnership++;
    else p.unlinked++;

    rows.push({
      id: m.id,
      email: m.email,
      company: m.company ?? m.title,
      bdrName: repLabel(bdr, m.bdr),
      bdrEmail: bdr.email ?? m.bdr,
      aeName: repLabel(ae, m.ae),
      aeEmail: ae.email ?? m.ae,
      outcome: m.outcome,
      happened: m.happened,
      priorRule: m.priorRoutingRuleName ?? m.routingRuleName,
      routeOrigin: m.handoffRouteOrigin,
      meetingAt: m.meetingAt,
    });
  }

  return {
    total: handoffs.length,
    scheduled: handoffs.filter((m) => m.isScheduled).length,
    canceled: handoffs.filter((m) => m.canceled).length,
    byPair: [...pairs.values()].sort((a, b) => b.total - a.total),
    rows: rows.sort((a, b) => String(b.bookedAt).localeCompare(String(a.bookedAt))),
  };
}

export function computeMeetingsReports(meetings, dateField = "bookedAt") {
  return {
    liveBooked: computeLiveBookedReport(meetings, dateField),
    ruleBdrDistribution: computeRuleBdrDistribution(meetings),
    outcomes: computeOutcomeReport(meetings),
    handoffs: computeHandoffReport(meetings),
  };
}
