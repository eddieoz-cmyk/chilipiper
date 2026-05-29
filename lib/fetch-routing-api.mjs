import { buildRoutingPayload } from "./build-routing-payload.mjs";
import { buildRoutingFromChiliPiper } from "./fetch-chilipiper-rules.mjs";
import {
  parseConciergeSheet,
  parseOfflineDistributionSheet,
} from "./load-routing-rules.mjs";

async function buildRoutingFromCsvStrings(conciergeCsv, offlineCsv, meta) {
  const concierge = parseConciergeSheet(conciergeCsv);
  const offline = parseOfflineDistributionSheet(offlineCsv);
  return buildRoutingPayload(concierge, offline, meta);
}

function trim(v) {
  return (v ?? "").trim() || null;
}

/** Map a single API rule object to the dashboard rule shape. */
function normalizeConciergeRule(raw, index) {
  const modules = String(raw.modules ?? raw.module ?? raw.moduleLabel ?? "")
    .toLowerCase()
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) =>
      s.includes("consierge") || s.includes("concierge")
        ? "concierge"
        : s.includes("distro")
          ? "distro"
          : s,
    );

  const section = trim(raw.section) ?? trim(raw.region) ?? "Global";
  const name = trim(raw.name) ?? `Rule ${index + 1}`;

  return {
    id: trim(raw.id) ?? `${section}::${name}`,
    name,
    ruleStatus: trim(raw.ruleStatus) ?? trim(raw.status),
    region: trim(raw.region) ?? section,
    state: trim(raw.state),
    size: trim(raw.size),
    segment: trim(raw.segment),
    normalizedBuckets: trim(raw.normalizedBuckets),
    notes: trim(raw.notes),
    teamMembers: trim(raw.teamMembers),
    repCount: trim(raw.repCount) ?? trim(raw.count),
    modules,
    moduleLabel: trim(raw.moduleLabel) ?? trim(raw.module),
    moduleNotes: trim(raw.moduleNotes),
    countries: trim(raw.countries),
    section,
    hasConcierge: raw.hasConcierge ?? modules.includes("concierge"),
    hasDistro: raw.hasDistro ?? modules.includes("distro"),
  };
}

function normalizeOfflinePod(raw, index) {
  const region = trim(raw.region) ?? "Unknown";
  return {
    id: trim(raw.id) ?? `${region}::${trim(raw.podName)}::${index}`,
    region,
    focusArea: trim(raw.focusArea),
    mapping: trim(raw.mapping),
    segment: trim(raw.segment),
    podName: trim(raw.podName),
    chiliPiperRule: trim(raw.chiliPiperRule),
    segmentRules: trim(raw.segmentRules),
    bdr: trim(raw.bdr),
    bdr1: trim(raw.bdr1),
    bdr2: trim(raw.bdr2),
    salesRep1: trim(raw.salesRep1),
    salesRep2: trim(raw.salesRep2),
    manager: trim(raw.manager),
    bdrManager: trim(raw.bdrManager),
    statusNote: trim(raw.statusNote),
    newHireBdr: trim(raw.newHireBdr),
    newHireAe1: trim(raw.newHireAe1),
    newHireAe2: trim(raw.newHireAe2),
    seniorBdr: trim(raw.seniorBdr),
    seniorAe1: trim(raw.seniorAe1),
    seniorAe2: trim(raw.seniorAe2),
  };
}

function parseJsonHeaders(envValue) {
  if (!envValue?.trim()) return {};
  try {
    return JSON.parse(envValue);
  } catch {
    throw new Error("ROUTING_API_HEADERS must be valid JSON");
  }
}

/**
 * Normalize API JSON into the dashboard routing payload.
 *
 * Supported response shapes:
 * 1. Full payload: { concierge: { rules, regions?, allRules? }, offline: { pods, regions? } }
 * 2. Arrays: { conciergeRules: [...], offlinePods: [...] }
 * 3. CSV strings: { conciergeCsv: "...", offlineCsv: "..." }
 * 4. Nested data: { data: { ... shapes 1–3 } }
 */
export async function normalizeApiResponse(body, apiUrl) {
  if (Array.isArray(body?.results) && body.total != null) {
    const token = process.env.ROUTING_API_TOKEN ?? process.env.ROUTING_API_KEY;
    if (!token) {
      throw new Error("ROUTING_API_TOKEN is required for Chili Piper API");
    }
    return buildRoutingFromChiliPiper(apiUrl, token);
  }

  const root = body?.data ?? body;

  if (root?.conciergeCsv && root?.offlineCsv) {
    return buildRoutingFromCsvStrings(root.conciergeCsv, root.offlineCsv, {
      source: "api",
      apiUrl,
      fetchedAt: new Date().toISOString(),
    });
  }

  if (root?.concierge?.rules && root?.offline?.pods) {
    const conciergeParsed = {
      rules: root.concierge.allRules ?? root.concierge.rules,
      regions: root.concierge.regions ?? [],
    };
    const offlineParsed = {
      pods: root.offline.pods,
      regions:
        root.offline.regions ??
        [...new Set(root.offline.pods.map((p) => p.region).filter(Boolean))].sort(),
    };
    if (root.coverageGaps) {
      return {
        concierge: root.concierge,
        offline: root.offline,
        coverageGaps: root.coverageGaps,
        meta: {
          source: "api",
          apiUrl,
          fetchedAt: new Date().toISOString(),
          ...root.meta,
        },
      };
    }
    return buildRoutingPayload(conciergeParsed, offlineParsed, {
      source: "api",
      apiUrl,
      fetchedAt: new Date().toISOString(),
    });
  }

  const conciergeRulesRaw =
    root?.conciergeRules ?? root?.concierge?.rules ?? root?.rules;
  const offlinePodsRaw = root?.offlinePods ?? root?.offline?.pods ?? root?.pods;

  if (Array.isArray(conciergeRulesRaw) && Array.isArray(offlinePodsRaw)) {
    const allRules = conciergeRulesRaw.map(normalizeConciergeRule);
    const pods = offlinePodsRaw.map(normalizeOfflinePod);
    return buildRoutingPayload(
      {
        rules: allRules,
        regions: [...new Set(allRules.map((r) => r.section).filter(Boolean))].sort(),
      },
      {
        pods,
        regions: [...new Set(pods.map((p) => p.region).filter(Boolean))].sort(),
      },
      { source: "api", apiUrl, fetchedAt: new Date().toISOString() },
    );
  }

  throw new Error(
    "Routing API response not recognized. Expected conciergeRules + offlinePods, concierge/offline objects, or conciergeCsv + offlineCsv.",
  );
}

export async function fetchRoutingFromApi({
  url,
  token,
  extraHeaders = {},
  method = "GET",
  body,
}) {
  if (url.includes("chilipiper.com") && token) {
    return buildRoutingFromChiliPiper(url, token);
  }

  const headers = {
    Accept: "application/json",
    ...extraHeaders,
  };
  if (token) {
    headers.Authorization = token.startsWith("Bearer ")
      ? token
      : `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Routing API failed (${res.status}): ${text.slice(0, 200) || res.statusText}`,
    );
  }

  const json = await res.json();
  return normalizeApiResponse(json, url);
}

export function routingApiConfigFromEnv(env = process.env) {
  const url = env.ROUTING_API_URL?.trim();
  if (!url) return null;

  return {
    url,
    token: env.ROUTING_API_TOKEN?.trim() || env.ROUTING_API_KEY?.trim(),
    extraHeaders: parseJsonHeaders(env.ROUTING_API_HEADERS),
    method: (env.ROUTING_API_METHOD ?? "GET").toUpperCase(),
    body: env.ROUTING_API_BODY?.trim() || undefined,
  };
}
