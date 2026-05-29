import {
  loadWorldLocations,
  normalizeKey,
  collectCoveredFromRules,
} from "./world-locations.mjs";

const REGION_BUCKET_STATES = new Set(
  [
    "us",
    "apj",
    "dach",
    "canada",
    "latam",
    "uki/row",
    "uki & row",
    "il/cee",
    "il & cee",
    "benelux",
    "nordics",
    "france",
    "iberia",
    "eurowest",
    "western europe",
    "all region",
    "rest of latam",
    "argentina/uruguay",
    "germany & austria",
    "finland/iceland",
    "non-native",
    "global/system",
    "—",
    "-",
  ].map(normalizeKey),
);

/** Split location lists from countries / state columns. */
export function tokenizeLocations(raw) {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(
      (part) =>
        part &&
        part !== "—" &&
        part !== "-" &&
        !/^see /i.test(part) &&
        !/^no reps/i.test(part),
    );
}

function belongsToRegion(rule, region) {
  return rule.section === region || rule.region === region;
}

/**
 * World countries (and US/CA subdivisions) not listed in this region's rules.
 */
export async function computeRegionGaps(rules, region, world) {
  const regionRules = rules.filter((r) => belongsToRegion(r, region));
  const covered = collectCoveredFromRules(regionRules, world);

  const uncoveredCountries = world.countries.countries
    .filter((name) => !covered.countries.has(normalizeKey(name)))
    .sort((a, b) => a.localeCompare(b));

  let uncoveredStates = [];
  let subdivisionLabel = null;

  if (region === "US") {
    subdivisionLabel = "US states";
    uncoveredStates = [...world.usStates.values()]
      .filter((name) => !covered.usStates.has(normalizeKey(name)))
      .sort((a, b) => a.localeCompare(b));
  } else if (region === "Canada") {
    subdivisionLabel = "Canadian provinces";
    uncoveredStates = [...world.canadaProvinces.values()]
      .filter((name) => !covered.canadaProvinces.has(normalizeKey(name)))
      .sort((a, b) => a.localeCompare(b));
  }

  return {
    region,
    worldCountryCount: world.countries.countries.length,
    assignedCountryCount: covered.countries.size,
    assignedUsStateCount: covered.usStates.size,
    uncoveredCountries,
    uncoveredStates,
    subdivisionLabel,
    unmatchedTokens: covered.unmatched,
  };
}

export async function computeAllCoverageGaps(rules, regions) {
  const world = await loadWorldLocations();
  const byRegion = {};

  for (const region of regions) {
    byRegion[region] = await computeRegionGaps(rules, region, world);
  }

  const allCountries = new Set();
  const allStates = new Set();
  for (const gap of Object.values(byRegion)) {
    for (const c of gap.uncoveredCountries) allCountries.add(c);
    for (const s of gap.uncoveredStates) allStates.add(s);
  }

  return {
    byRegion,
    summary: {
      worldCountryCount: world.countries.countries.length,
      regionsWithGaps: Object.values(byRegion).filter(
        (g) => g.uncoveredCountries.length > 0 || g.uncoveredStates.length > 0,
      ).length,
      totalUncoveredCountries: allCountries.size,
      totalUncoveredStates: allStates.size,
    },
  };
}
