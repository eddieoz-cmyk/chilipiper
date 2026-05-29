import { computeAllCoverageGaps } from "./routing-coverage-gaps.mjs";

/** Build the dashboard payload from parsed concierge + offline data. */
export async function buildRoutingPayload(conciergeParsed, offlineParsed, meta = {}) {
  const conciergeRules = conciergeParsed.rules.filter((r) => r.hasConcierge);
  const conciergeRegions = [
    ...new Set(conciergeRules.map((r) => r.section).filter(Boolean)),
  ].sort();
  const gapRegions = [
    ...new Set(conciergeParsed.rules.map((r) => r.section).filter(Boolean)),
  ].sort();
  const coverageGaps = await computeAllCoverageGaps(
    conciergeParsed.rules,
    gapRegions,
  );

  return {
    concierge: {
      ...conciergeParsed,
      rules: conciergeRules,
      regions: conciergeRegions,
      allRules: conciergeParsed.rules,
    },
    offline: offlineParsed,
    coverageGaps,
    meta: {
      conciergeRuleCount: conciergeRules.length,
      conciergeTotalRules: conciergeParsed.rules.length,
      offlinePodCount: offlineParsed.pods.length,
      coverageGapSummary: coverageGaps.summary,
      ...meta,
    },
  };
}
