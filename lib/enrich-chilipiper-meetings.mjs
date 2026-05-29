import fs from "node:fs/promises";
import { parseCsvLine, splitCsvRows } from "./parse-csv-line.mjs";
import { loadChilipiperRulesIndex } from "./chilipiper-rules-index.mjs";
import { loadChilipiperUsersIndex, lookupUser } from "./chilipiper-users-index.mjs";
import { buildMeetingsFilterOptions } from "./build-meetings-filter-options.mjs";
import { computeChilipiperLinkage } from "./compute-chilipiper-linkage.mjs";
import { buildConciergeGuestIndex, findPriorConciergeSession } from "./build-concierge-guest-index.mjs";
import { routeOriginFromRule } from "./classify-routing-rule.mjs";
import { computeHandoffDistribution } from "./compute-handoff-distribution.mjs";

function trim(v) {
  return (v ?? "").trim();
}

function attachUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    jobTitle: user.jobTitle,
    role: user.role,
  };
}

/** Latest concierge row per MEETING_ID, keyed for rule + assignee joins. */
export function buildConciergeMeetingIndex(csvText) {
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) return new Map();

  const headerRow = parseCsvLine(rows[0]);
  const headers = headerRow.map((h) => trim(h));
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const byMeetingId = new Map();

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const fields = parseCsvLine(rows[rowIdx]);
    const meetingId = trim(fields[idx.MEETING_ID]);
    if (!meetingId) continue;

    const triggered = trim(fields[idx.TRIGGERED_AT]);
    const prev = byMeetingId.get(meetingId);
    if (prev && triggered < prev.triggeredAt) continue;

    byMeetingId.set(meetingId, {
      triggeredAt: triggered,
      status: trim(fields[idx.STATUS]) || null,
      guestEmail: trim(fields[idx.GUEST_EMAIL]) || null,
      firstName: trim(fields[idx.FIRST_NAME]) || null,
      lastName: trim(fields[idx.LAST_NAME]) || null,
      company: trim(fields[idx.COMPANY]) || null,
      country: trim(fields[idx.COUNTRY]) || null,
      contactState: trim(fields[idx.CONTACT_STATE]) || null,
      employees: trim(fields[idx.NUMBER_OF_EMPLOYEES]) || null,
      matchedRouteId: trim(fields[idx.MATCHED_ROUTE_ID]) || null,
      primaryAssignedUserId: trim(fields[idx.PRIMARY_ASSIGNED_USER_ID]) || null,
    });
  }

  return byMeetingId;
}

function applyRoutingRule(m, rule) {
  if (!rule) return;
  m.routingRuleId = rule.id;
  m.routingRuleName = rule.name;
  m.routingRuleRegion = rule.region;
  m.region = rule.region ?? m.region;
  m.routingRule = rule;
}

function resolveParticipant(usersIndex, userId, fallbackEmail) {
  const user = lookupUser(usersIndex, userId);
  if (user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email ?? fallbackEmail ?? null,
      jobTitle: user.jobTitle,
    };
  }
  if (fallbackEmail) {
    return { id: userId || null, name: null, email: fallbackEmail, jobTitle: null };
  }
  return null;
}

export function enrichMeetingsWithRouting(
  meetings,
  conciergeIndex,
  rulesIndex,
  usersIndex,
  guestIndex = new Map(),
) {
  for (const m of meetings) {
    const concierge = conciergeIndex.get(m.id);
    m.fromWebsiteConcierge = Boolean(concierge);
    const routeId = concierge?.matchedRouteId || m.routingRuleId || null;
    const rule = routeId ? rulesIndex.get(routeId) : null;

    if (!m.company && concierge?.company) m.company = concierge.company;
    if (!m.email && concierge?.guestEmail) m.email = concierge.guestEmail;
    m.country = concierge?.country ?? m.country ?? null;
    m.contactState = concierge?.contactState ?? null;
    m.employeeCount = concierge?.employees ?? null;
    m.conciergeStatus = concierge?.status ?? null;

    applyRoutingRule(m, rule);

    const assignedId = concierge?.primaryAssignedUserId || null;
    m.assignedUserId = assignedId;
    m.assignedUser = attachUser(lookupUser(usersIndex, assignedId));

    const hostId = trim(m.raw?.HOST_ID);
    const bookerId = trim(m.raw?.BOOKER_ID);
    m.hostUser = resolveParticipant(usersIndex, hostId, m.ae);
    m.bookerUser = resolveParticipant(usersIndex, bookerId, m.bdr);

    if (m.assignedUser?.name) {
      m.ae = m.assignedUser.email ?? m.ae;
      if (!m.hostUser?.name) {
        m.hostUser = { ...m.assignedUser, id: assignedId };
      }
    } else if (m.hostUser?.email) {
      m.ae = m.hostUser.email;
    }

    if (m.bookerUser?.email) m.bdr = m.bookerUser.email;

    if (m.meetingType === "handoff") {
      enrichHandoffFromConcierge(m, conciergeIndex, guestIndex, rulesIndex);
    }
  }
  return meetings;
}

function applyPriorConciergeSession(m, session, rulesIndex, linkMethod) {
  if (!session) {
    m.handoffRouteOrigin = "unlinked";
    m.conciergeLinkMethod = null;
    return;
  }

  m.conciergeLinkMethod = linkMethod;
  m.priorConciergeTriggeredAt = session.triggeredAt;
  m.priorConciergeStatus = session.status;
  m.fromWebsiteConcierge = true;

  const rule = session.matchedRouteId ? rulesIndex.get(session.matchedRouteId) : null;
  if (rule) {
    m.priorRoutingRuleId = rule.id;
    m.priorRoutingRuleName = rule.name;
    m.handoffRouteOrigin = routeOriginFromRule(rule);
    if (!m.routingRule) applyRoutingRule(m, rule);
    if (!m.region) m.region = rule.region;
  } else {
    m.handoffRouteOrigin = "unlinked";
  }
}

function enrichHandoffFromConcierge(m, conciergeIndex, guestIndex, rulesIndex) {
  const byMeetingId = conciergeIndex.get(m.id);
  if (byMeetingId) {
    applyPriorConciergeSession(m, byMeetingId, rulesIndex, "meetingId");
    return;
  }

  const guestEmail = m.email ?? trim(m.raw?.PRIMARY_GUEST_EMAIL);
  const prior = findPriorConciergeSession(guestIndex, guestEmail, m.bookedAt);
  applyPriorConciergeSession(m, prior, rulesIndex, prior ? "guestEmail" : null);
}

export async function enrichChilipiperMeetingsPayload(payload, paths) {
  const [conciergeCsv, rulesIndex, usersIndex] = await Promise.all([
    fs.readFile(paths.concierge, "utf8"),
    loadChilipiperRulesIndex(paths.rules),
    loadChilipiperUsersIndex(paths.users),
  ]);

  const year = payload.funnel?.year ?? payload.meta?.year;
  const conciergeIndex = buildConciergeMeetingIndex(conciergeCsv);
  const guestIndex = buildConciergeGuestIndex(conciergeCsv, year);
  enrichMeetingsWithRouting(
    payload.meetings,
    conciergeIndex,
    rulesIndex,
    usersIndex,
    guestIndex,
  );

  payload.filterOptions = buildMeetingsFilterOptions(payload.meetings, rulesIndex);
  payload.routingRules = [...rulesIndex.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  payload.usersIndexSize = usersIndex.size;
  payload.linkage = computeChilipiperLinkage(
    payload.meetings,
    payload.funnel?.conciergeLog,
    conciergeIndex,
  );
  payload.handoffDistribution = computeHandoffDistribution(payload.meetings);
  const handoffs = payload.meetings.filter((m) => m.meetingType === "handoff");
  payload.handoffEnrichment = {
    total: handoffs.length,
    linkedByGuestEmail: handoffs.filter((m) => m.conciergeLinkMethod === "guestEmail").length,
    linkedByMeetingId: handoffs.filter((m) => m.conciergeLinkMethod === "meetingId").length,
    fromRouter: handoffs.filter((m) => m.handoffRouteOrigin === "router").length,
    fromOwnership: handoffs.filter((m) => m.handoffRouteOrigin === "ownership").length,
    unlinked: handoffs.filter((m) => m.handoffRouteOrigin === "unlinked").length,
  };
  payload.dataSources = {
    calendar: {
      file: "meetings.csv",
      label: "Calendar meetings",
      description:
        "Every meeting actually booked in Chili Piper (Concierge, Handoff, ChiliCal, etc.).",
    },
    website: {
      file: "concierge.csv",
      label: "Website concierge log",
      description:
        "Sessions started on your site via Concierge live booking — scheduled or not. Counts are usually higher than calendar rows.",
    },
  };

  return payload;
}
