/**
 * Aggregate page views across all MQL return journeys.
 * @param {Array<{ id: string, visits?: Array<{ pages?: Array<{ path: string, title?: string }> }> }>} journeys
 * @param {number} limit
 */
export function computeTopPages(journeys, limit = 20) {
  const byPath = new Map();

  for (const mql of journeys) {
    for (const visit of mql.visits ?? []) {
      for (const page of visit.pages ?? []) {
        const pathKey = page.path?.trim() || "(unknown page)";
        if (!byPath.has(pathKey)) {
          byPath.set(pathKey, {
            path: pathKey,
            title: page.title ?? pathKey,
            views: 0,
            uniqueMqls: new Set(),
          });
        }
        const row = byPath.get(pathKey);
        row.views += 1;
        row.uniqueMqls.add(mql.id);
        if (page.title && row.title === pathKey) {
          row.title = page.title;
        }
      }
    }
  }

  return [...byPath.values()]
    .map(({ path, title, views, uniqueMqls }) => ({
      path,
      title,
      views,
      uniqueMqls: uniqueMqls.size,
      mqlIds: [...uniqueMqls],
    }))
    .sort((a, b) => b.views - a.views || b.uniqueMqls - a.uniqueMqls)
    .slice(0, limit);
}
