import fs from "node:fs/promises";
import { loadChilipiperRulesIndex } from "./chilipiper-rules-index.mjs";
import {
  loadChilipiperUsersIndex,
  lookupUser,
  lookupUserByEmail,
  lookupUserByName,
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

function rulesByName(rulesIndex) {
  const byName = new Map();
  for (const rule of rulesIndex.values()) {
    byName.set(rule.name, rule);
  }
  return byName;
}

function resolveRule(m, rulesIndex, byName) {
  const routeId = m.routingRuleId || trim(m.raw?.MATCHED_ROUTE_ID) || null;
  if (routeId && !routeId.startsWith("name:")) {
    return rulesIndex.get(routeId) ?? null;
  }
  const ruleName = m.routingRuleName || trim(m.raw?.["Routing Rule Matched"]) || null;
  if (ruleName) return byName.get(ruleName) ?? null;
  return null;
}

export function enrichMeetingsWithRouting(meetings, rulesIndex, usersIndex) {
  const byName = rulesByName(rulesIndex);

  for (const m of meetings) {
    const rule = resolveRule(m, rulesIndex, byName);
    if (rule) applyRoutingRule(m, rule);

    if (!m.region && trim(m.raw?.REGION)) {
      m.region = trim(m.raw.REGION);
    }
    if (!m.region && m.country) {
      m.region = m.country;
    }

    m.fromWebsiteConcierge = m.meetingType === "concierge";

    const assigneeName = m.assignedUserName || trim(m.raw?.["Assigned To"]) || null;
    const assignedUser =
      lookupUser(usersIndex, m.assignedUserId) ??
      lookupUserByName(usersIndex, assigneeName);
    if (assignedUser) {
      m.assignedUserId = assignedUser.id;
      m.assignedUser = attachUser(assignedUser);
    } else if (assigneeName) {
      m.assignedUser = { id: null, name: assigneeName, email: null, jobTitle: null, role: null };
    }

    m.hostUser = m.assignedUser;
    m.bookerUser = null;

    if (m.routeRuleType === "Ownership") {
      m.handoffRouteOrigin = "ownership";
    } else if (m.routeRuleType === "Boolean") {
      m.handoffRouteOrigin = "router";
    }

    if (m.meetingType === "handoff") {
      const routeId = m.routingRuleId;
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
      label: payload.meta?.schema === "website-log" ? "Website concierge log" : "Chili Piper meetings export",
      description:
        payload.meta?.schema === "website-log"
          ? "Website form submissions and meeting booking outcomes from Chili Piper concierge."
          : "Unified export: Concierge, Handoff, and ChiliCal meetings with routing, Salesforce links, and meeting status.",
    },
  };

  redactMeetingsPayload(payload);
  payload.filterOptions = buildMeetingsFilterOptions(payload.meetings, rulesIndex);

  return payload;
}
