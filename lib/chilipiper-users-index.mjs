import fs from "node:fs/promises";
import { parseCsvLine, splitCsvRows } from "./parse-csv-line.mjs";

function trim(v) {
  return (v ?? "").trim();
}

export function buildChilipiperUsersIndex(csvText) {
  const rows = splitCsvRows(csvText);
  const byId = new Map();
  const byEmail = new Map();
  const byName = new Map();
  if (rows.length < 2) return { byId, byEmail, byName };

  const headerRow = parseCsvLine(rows[0]);
  const headers = headerRow.map((h) => trim(h));
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const fields = parseCsvLine(rows[rowIdx]);
    const id = trim(fields[idx.Id]);
    if (!id) continue;

    const user = {
      id,
      name: trim(fields[idx.Name]) || null,
      email: trim(fields[idx.Email]) || null,
      jobTitle: trim(fields[idx.JobTitle]) || null,
      role: trim(fields[idx.Role]) || null,
      status: trim(fields[idx.Status]) || null,
      crmId: trim(fields[idx.CrmId]) || null,
    };
    byId.set(id, user);
    if (user.email) byEmail.set(user.email.toLowerCase(), user);
    if (user.name) byName.set(user.name.toLowerCase(), user);
  }

  return { byId, byEmail, byName };
}

export async function loadChilipiperUsersIndex(usersPath) {
  if (!usersPath) return { byId: new Map(), byEmail: new Map(), byName: new Map() };
  const csvText = await fs.readFile(usersPath, "utf8");
  return buildChilipiperUsersIndex(csvText);
}

export function lookupUser(usersIndex, userId) {
  if (!userId || !usersIndex) return null;
  const map = usersIndex.byId ?? usersIndex;
  return map.get(userId) ?? null;
}

export function lookupUserByEmail(usersIndex, email) {
  const e = trim(email).toLowerCase();
  if (!e || !usersIndex?.byEmail) return null;
  return usersIndex.byEmail.get(e) ?? null;
}

export function lookupUserByName(usersIndex, name) {
  const n = trim(name).toLowerCase();
  if (!n || !usersIndex?.byName) return null;
  return usersIndex.byName.get(n) ?? null;
}
