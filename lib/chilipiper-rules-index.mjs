import fs from "node:fs/promises";
import { mapChiliPiperRule } from "./fetch-chilipiper-rules.mjs";
import { isOwnershipRule } from "./classify-routing-rule.mjs";

/** Full routing rule record for joins from MATCHED_ROUTE_ID. */
export function ruleRecordFromRaw(raw) {
  const mapped = mapChiliPiperRule(raw);
  const ownership = isOwnershipRule(raw);
  return {
    id: raw.id,
    name: mapped.name,
    isOwnershipRule: ownership,
    region: mapped.section ?? mapped.region ?? "Other",
    section: mapped.section,
    state: mapped.state,
    segment: mapped.segment,
    size: mapped.size,
    ruleStatus: mapped.ruleStatus,
    product: mapped.moduleLabel ?? raw.product ?? null,
    type: mapped.chiliPiperType ?? raw.type ?? null,
    countries: mapped.countries,
    hasConcierge: mapped.hasConcierge,
    hasDistro: mapped.hasDistro,
    notes: mapped.notes,
    teamId: raw.teamId ?? null,
    workspaceId: raw.workspaceId ?? null,
  };
}

/** @returns {Map<string, ReturnType<typeof ruleRecordFromRaw>>} */
export async function loadChilipiperRulesIndex(rulesPath) {
  const body = JSON.parse(await fs.readFile(rulesPath, "utf8"));
  const rawRules = body.results ?? body.rules ?? body;
  if (!Array.isArray(rawRules)) {
    throw new Error(`Chili Piper rules file not recognized: ${rulesPath}`);
  }

  const index = new Map();
  for (const raw of rawRules) {
    index.set(raw.id, ruleRecordFromRaw(raw));
  }
  return index;
}
