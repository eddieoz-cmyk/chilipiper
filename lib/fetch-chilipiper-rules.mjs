import { buildRoutingPayload } from "./build-routing-payload.mjs";

const GEO_RULE = /\s\|\s.+:/;

function parseRuleName(name) {
  const raw = String(name ?? "").trim();
  const ruleStatus = /\(not ok\)/i.test(raw) ? "not ok" : "active";
  const clean = raw.replace(/\s*\(not ok\)\s*/gi, "").trim();
  const parts = clean.split("|").map((p) => p.trim());

  if (parts.length < 2) {
    return {
      section: parts[0] || "Other",
      state: null,
      segment: null,
      size: null,
      ruleStatus,
    };
  }

  const section = parts[0];
  const last = parts[parts.length - 1];
  const sizeMatch = last.match(/^(.+?)\s*:\s*(.+)$/);
  const size = sizeMatch ? sizeMatch[2].trim() : null;

  if (parts.length === 2) {
    const segment = sizeMatch ? sizeMatch[1].trim() : parts[1];
    return { section, state: null, segment, size, ruleStatus };
  }

  const state = parts.slice(1, -1).join(" | ");
  const segment = sizeMatch ? sizeMatch[1].trim() : last;
  return { section, state, segment, size, ruleStatus };
}

function walkConditions(node, out) {
  if (!node) return;

  if (node.type === "StaticValueCondition") {
    const field = String(node.dataReference?.field ?? "");
    const fieldLower = field.toLowerCase();

    if (node.operator === "containsAnyOf" && Array.isArray(node.value)) {
      if (
        fieldLower.includes("country") ||
        field === "Country" ||
        fieldLower.includes("state") ||
        fieldLower.includes("province")
      ) {
        for (const v of node.value) {
          if (fieldLower.includes("state") || fieldLower.includes("province")) {
            out.states.add(String(v).trim());
          } else {
            out.countries.add(String(v).trim());
          }
        }
      }
    }

    if (
      fieldLower.includes("employee") &&
      ["<", ">", "<=", ">=", "between", "="].includes(node.operator)
    ) {
      out.employeeConstraints.push({
        field,
        operator: node.operator,
        value: node.value,
      });
    }
  }

  if (Array.isArray(node.conditions)) {
    for (const child of node.conditions) walkConditions(child, out);
  }
}

function extractConditions(rule) {
  const out = {
    countries: new Set(),
    states: new Set(),
    employeeConstraints: [],
  };
  walkConditions(rule.conditions, out);
  return {
    countries: [...out.countries].sort((a, b) => a.localeCompare(b)),
    states: [...out.states].sort((a, b) => a.localeCompare(b)),
    employeeConstraints: out.employeeConstraints,
  };
}

function isGeographicRule(rule) {
  return GEO_RULE.test(rule.name ?? "");
}

export function mapChiliPiperRule(raw) {
  const { section, state, segment, size, ruleStatus } = parseRuleName(raw.name);
  const geo = extractConditions(raw);
  const product = raw.product ?? "Distro";
  const isGeo = isGeographicRule(raw);

  const countries =
    geo.countries.length > 0
      ? geo.countries.join(", ")
      : geo.states.length > 0
        ? geo.states.join(", ")
        : null;

  const notes = [
    raw.type ? `Type: ${raw.type}` : null,
    geo.employeeConstraints.length
      ? `Employees: ${geo.employeeConstraints
          .map((e) => `${e.field} ${e.operator} ${e.value}`)
          .join("; ")}`
      : null,
    raw.teamId ? `Team: ${raw.teamId}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: raw.id,
    name: raw.name,
    ruleStatus,
    region: section,
    state: state || section,
    size,
    segment,
    normalizedBuckets: null,
    notes: notes || null,
    teamMembers: raw.teamId ?? null,
    repCount: null,
    modules: [product.toLowerCase()],
    moduleLabel: product,
    moduleNotes: raw.metadata?.updatedAt
      ? `Updated ${raw.metadata.updatedAt}`
      : null,
    countries,
    section,
    hasConcierge: isGeo,
    hasDistro: product === "Distro",
    chiliPiperType: raw.type,
    workspaceId: raw.workspaceId,
  };
}

export async function fetchAllChiliPiperRules(listUrl, token) {
  const base = new URL(listUrl);
  const pageSize = Number(base.searchParams.get("pageSize")) || 200;
  base.searchParams.delete("apiKey");

  const headers = {
    Accept: "application/json",
    Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
  };

  const all = [];
  for (let page = 0; page < 100; page++) {
    base.searchParams.set("page", String(page));
    base.searchParams.set("pageSize", String(pageSize));

    const res = await fetch(base.toString(), { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Chili Piper API failed (${res.status}): ${text.slice(0, 300) || res.statusText}`,
      );
    }

    const body = await res.json();
    const batch = body.results ?? [];
    all.push(...batch);

    if (batch.length < pageSize) break;
    if (body.total != null && all.length >= body.total) break;
  }

  return all;
}

export function buildRoutingFromChiliPiperRules(rawRules, meta = {}) {
  const rules = rawRules.map(mapChiliPiperRule);
  const geographic = rules.filter((r) => GEO_RULE.test(r.name ?? ""));

  const conciergeParsed = {
    rules: geographic,
    regions: [...new Set(geographic.map((r) => r.section).filter(Boolean))].sort(),
  };

  const offlineParsed = {
    pods: rules
      .filter((r) => !GEO_RULE.test(r.name ?? ""))
      .map((r) => ({
        id: r.id,
        region: r.section,
        focusArea: r.segment,
        mapping: r.state,
        segment: r.chiliPiperType,
        podName: r.name,
        chiliPiperRule: r.name,
        segmentRules: r.countries,
        bdr: null,
        bdr1: null,
        bdr2: null,
        salesRep1: r.teamMembers,
        salesRep2: null,
        manager: null,
        bdrManager: null,
        statusNote: r.ruleStatus,
      })),
    regions: [],
  };
  offlineParsed.regions = [
    ...new Set(offlineParsed.pods.map((p) => p.region).filter(Boolean)),
  ].sort();

  return buildRoutingPayload(conciergeParsed, offlineParsed, {
    ruleCount: rawRules.length,
    geographicRuleCount: geographic.length,
    fetchedAt: new Date().toISOString(),
    ...meta,
  });
}

export async function buildRoutingFromChiliPiper(listUrl, token, meta = {}) {
  const rawRules = await fetchAllChiliPiperRules(listUrl, token);
  return buildRoutingFromChiliPiperRules(rawRules, {
    source: "chilipiper-api",
    apiUrl: listUrl.replace(/apiKey=[^&]+/, "apiKey=***"),
    ...meta,
  });
}

export async function buildRoutingFromChiliPiperFile(filePath, meta = {}) {
  const fs = await import("node:fs/promises");
  const body = JSON.parse(await fs.readFile(filePath, "utf8"));
  const rawRules = body.results ?? body.rules ?? body;
  if (!Array.isArray(rawRules)) {
    throw new Error(`Chili Piper rules file not recognized: ${filePath}`);
  }
  return buildRoutingFromChiliPiperRules(rawRules, {
    source: "chilipiper-export",
    rulesPath: filePath,
    ruleCount: rawRules.length,
    ...meta,
  });
}
