import { parseCsvLine, splitCsvRows } from "./parse-csv-line.mjs";

function trim(v) {
  return (v ?? "").trim();
}

function isTruthy(v) {
  return ["true", "yes", "1"].includes(trim(v).toLowerCase());
}

/** Summary stats from Chili Piper users export CSV. */
export function parseChilipiperUsersCsv(csvText) {
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) {
    return { total: 0, active: 0, withConciergeLive: 0, withHandoff: 0 };
  }

  const headerRow = parseCsvLine(rows[0]);
  const headers = headerRow.map((h) => trim(h));
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

  let total = 0;
  let active = 0;
  let withConciergeLive = 0;
  let withHandoff = 0;

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const fields = parseCsvLine(rows[rowIdx]);
    if (fields.every((f) => !trim(f))) continue;
    total++;
    if (trim(fields[idx.Status]) === "Active") active++;
    if (isTruthy(fields[idx["License:ConciergeLive"]])) withConciergeLive++;
    if (isTruthy(fields[idx["License:Handoff"]])) withHandoff++;
  }

  return { total, active, withConciergeLive, withHandoff };
}
