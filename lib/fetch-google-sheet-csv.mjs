/** Fetch a single tab from a public Google Spreadsheet as CSV. */
export async function fetchGoogleSheetCsv(spreadsheetId, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Sheet fetch failed (gid=${gid}): ${res.status}`);
  }
  return res.text();
}
