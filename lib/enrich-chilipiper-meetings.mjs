import fs from "node:fs/promises";
import { loadChilipiperRulesIndex } from "./chilipiper-rules-index.mjs";
import {
  loadChilipiperUsersIndex,
  lookupUser,
  lookupUserByEmail,
} from "./chilipiper-users-index.mjs";
import { buildMeetingsFilterOptions } from "./build-meetings-filter-options.mjs";
import { computeChilipiperLinkage } from "./compute-chilipiper-linkage.mjs";
import { routeOriginFromRule } from "./classify-routing-rule.mjs";
import { computeHandoffDistribution } from "./compute-handoff-distribution.mjs";
import { redactMeetingsPayload } from "./redact-pii.mjs";

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

function applyRoutingRule(m, rule) {
  if (!rule) return;
  m.routingRuleId = rule.id;
  m.routingRuleName = rule.name;
  m.routingRuleRegion = rule.region;
  m.region = rule.region ?? m.region;
  m.routingRule = rule;
}

function resolveParticipant(usersIndex, userId, fallbackEmail) {
  const user = lookupUser(usersIndex, userId) ?? lookupUserByEmail(usersIndex, fallbackEmail);
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

export function enrichMeetingsWithRouting(meetings, rulesIndex, usersIndex) {
  for (const m of meetings) {
    const routeId = m.routingRuleId || trim(m.raw?.MATCHED_ROUTE_ID) || null;
    const rule = routeId ? rulesIndex.get(routeId) : null;

    if (routeId && !m.routingRuleId) m.routingRuleId = routeId;
    applyRoutingRule(m, rule);

    if (!m.region && trim(m.raw?.REGION)) {
      m.region = trim(m.raw.REGION);
    }

    m.fromWebsiteConcierge = m.meetingType === "concierge";

    const assignedId = m.assignedUserId || trim(m.raw?.PRIMARY_ASSIGNED_USER_ID) || null;
    m.assignedUserId = assignedId;
    m.assignedUser = attachUser(lookupUser(usersIndex, assignedId));

    m.hostUser = resolveParticipant(usersIndex, null, m.ae);
    m.bookerUser = resolveParticipant(usersIndex, null, m.bdr);

    if (m.routeRuleType === "Ownership") {
      m.handoffRouteOrigin = "ownership";
    } else if (m.routeRuleType === "Boolean") {
      m.handoffRouteOrigin = "router";
    }

    if (m.meetingType === "handoff") {
      if (rule) {
        m.handoffRouteOrigin = routeOriginFromRule(rule);
        m.priorRoutingRuleId = rule.id;
        m.priorRoutingRuleName = rule.name;
        m.conciergeLinkMethod = routeId ? "inlineRoute" : null;
      } else {
        m.handoffRouteOrigin = "unlinked";
        m.conciergeLinkMethod = null;
      }
    }
  }
  return meetings;
}

export async function enrichChilipiperMeetingsPayload(payload, paths) {
  const [rulesIndex, usersIndex] = await Promise.all([
    loadChilipiperRulesIndex(paths.rules),
    loadChilipiperUsersIndex(paths.users),
  ]);

  enrichMeetingsWithRouting(payload.meetings, rulesIndex, usersIndex);

  payload.routingRules = [...rulesIndex.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  payload.usersIndexSize = usersIndex.byId?.size ?? 0;
  payload.linkage = computeChilipiperLinkage(payload.meetings, payload.funnel?.conciergeLog);
  payload.handoffDistribution = computeHandoffDistribution(payload.meetings);
  const handoffs = payload.meetings.filter((m) => m.meetingType === "handoff");
  payload.handoffEnrichment = {
    total: handoffs.length,
    linkedByGuestEmail: 0,
    linkedByMeetingId: 0,
    withInlineRoute: handoffs.filter((m) => m.conciergeLinkMethod === "inlineRoute").length,
    fromRouter: handoffs.filter((m) => m.handoffRouteOrigin === "router").length,
    fromOwnership: handoffs.filter((m) => m.handoffRouteOrigin === "ownership").length,
    unlinked: handoffs.filter((m) => m.handoffRouteOrigin === "unlinked").length,
  };
  payload.dataSources = {
    calendar: {
      file: "Meeting_new.csv",
      label: "Chili Piper meetings export",
      description:
        "Unified export: Concierge, Handoff, and ChiliCal meetings with routing, Salesforce links, and meeting status.",
    },
  };

  redactMeetingsPayload(payload);
  payload.filterOptions = buildMeetingsFilterOptions(payload.meetings, rulesIndex);

  return payload;
}
