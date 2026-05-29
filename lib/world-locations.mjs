import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tokenizeLocations } from "./routing-coverage-gaps.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "world-locations.json");

let cache = null;

export function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\./g, "");
}

/** Extra spellings from the routing sheet → canonical country name. */
const TOKEN_TO_COUNTRY = new Map(
  Object.entries({
    usa: "United States",
    us: "United States",
    "u.s.": "United States",
    "united states of america": "United States",
    uk: "United Kingdom",
    "great britain": "United Kingdom",
    britain: "United Kingdom",
    england: "United Kingdom",
    scotland: "United Kingdom",
    wales: "United Kingdom",
    "northern ireland": "United Kingdom",
    uae: "United Arab Emirates",
    "united arab emirates": "United Arab Emirates",
    russia: "Russia",
    "south korea": "South Korea",
    korea: "South Korea",
    "north korea": "North Korea",
    china: "China",
    vietnam: "Vietnam",
    "viet nam": "Vietnam",
    suriname: "Suriname",
    surinam: "Suriname",
    macedonia: "North Macedonia",
    "czech republic": "Czech Republic",
    "czechia": "Czech Republic",
    "ivory coast": "Ivory Coast",
    "cote d'ivoire": "Ivory Coast",
    "dr congo": "Democratic Republic of the Congo",
    "democratic republic of congo": "Democratic Republic of the Congo",
    congo: "Congo",
    "republic of the congo": "Congo",
    palestine: "Palestine",
    taiwan: "Taiwan",
    "hong kong": "Hong Kong",
    macao: "Macao",
    "the bahamas": "Bahamas",
    bahamas: "Bahamas",
    iran: "Iran",
    syria: "Syria",
    bolivia: "Bolivia",
    tanzania: "Tanzania",
    laos: "Laos",
    brunei: "Brunei",
    "east timor": "Timor-Leste",
    "timor-leste": "Timor-Leste",
    eswatini: "Eswatini",
    swaziland: "Eswatini",
    myanmar: "Myanmar",
    burma: "Myanmar",
    "cape verde": "Cape Verde",
  }).map(([k, v]) => [normalizeKey(k), v]),
);

function buildCountryIndex(countries) {
  const byKey = new Map();
  for (const name of countries) {
    byKey.set(normalizeKey(name), name);
    TOKEN_TO_COUNTRY.set(normalizeKey(name), name);
  }
  return { countries, byKey };
}

function buildSubdivisionIndex(names) {
  const byKey = new Map();
  for (const name of names) {
    byKey.set(normalizeKey(name), name);
  }
  return byKey;
}

export async function loadWorldLocations() {
  if (cache) return cache;
  const raw = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  const countries = buildCountryIndex(raw.countries);
  const usStates = buildSubdivisionIndex(raw.usStates);
  const canadaProvinces = buildSubdivisionIndex(raw.canadaProvinces);
  cache = { countries, usStates, canadaProvinces };
  return cache;
}

/**
 * Map a free-text location token to a world country, US state, or CA province.
 */
export function resolveLocationToken(token, world) {
  const key = normalizeKey(token);
  if (!key) return null;

  if (world.usStates.has(key)) {
    return { kind: "usState", name: world.usStates.get(key) };
  }
  if (world.canadaProvinces.has(key)) {
    return { kind: "canadaProvince", name: world.canadaProvinces.get(key) };
  }

  if (TOKEN_TO_COUNTRY.has(key)) {
    return { kind: "country", name: TOKEN_TO_COUNTRY.get(key) };
  }
  if (world.countries.byKey.has(key)) {
    return { kind: "country", name: world.countries.byKey.get(key) };
  }

  return null;
}

export function collectCoveredFromRules(rules, world) {
  const countries = new Set();
  const usStates = new Set();
  const canadaProvinces = new Set();
  const unmatched = new Set();

  for (const rule of rules) {
    const tokens = [
      ...tokenizeLocations(rule.countries),
      ...tokenizeLocations(rule.state),
    ];
    for (const token of tokens) {
      const resolved = resolveLocationToken(token, world);
      if (!resolved) {
        if (token.length > 2) unmatched.add(token);
        continue;
      }
      if (resolved.kind === "country") {
        countries.add(normalizeKey(resolved.name));
      } else if (resolved.kind === "usState") {
        usStates.add(normalizeKey(resolved.name));
        countries.add(normalizeKey("United States"));
      } else if (resolved.kind === "canadaProvince") {
        canadaProvinces.add(normalizeKey(resolved.name));
        countries.add(normalizeKey("Canada"));
      }
    }
  }

  return { countries, usStates, canadaProvinces, unmatched: [...unmatched].sort() };
}
