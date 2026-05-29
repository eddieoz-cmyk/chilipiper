const EMPTY = "(empty)";

/** Sort A1, A2, B1, B2, C1… then non-matching labels, (empty) last. */
export function compareCombinedScoreLabel(a, b) {
  if (a === EMPTY && b === EMPTY) return 0;
  if (a === EMPTY) return 1;
  if (b === EMPTY) return -1;

  const parse = (label) => {
    const m = label.trim().match(/^([A-Za-z]+)(\d+)?$/);
    if (m) {
      return { letter: m[1].toUpperCase(), num: Number(m[2] ?? 0), raw: label };
    }
    return { letter: label.toUpperCase(), num: -1, raw: label };
  };

  const pa = parse(a);
  const pb = parse(b);
  if (pa.letter !== pb.letter) return pa.letter.localeCompare(pb.letter);
  if (pa.num !== pb.num) return pa.num - pb.num;
  return pa.raw.localeCompare(pb.raw);
}

function labelOf(value) {
  const v = value == null ? "" : String(value).trim();
  return v || EMPTY;
}

/**
 * @param {Array<Record<string, unknown>>} journeys
 * @param {string} field - property on each journey object
 * @param {number} limit
 */
export function computeFieldBreakdown(journeys, field, limit = 12) {
  const byLabel = new Map();

  for (const mql of journeys) {
    const label = labelOf(mql[field]);
    if (!byLabel.has(label)) {
      byLabel.set(label, { label, count: 0, mqlIds: new Set() });
    }
    const row = byLabel.get(label);
    row.count += 1;
    row.mqlIds.add(mql.id);
  }

  return [...byLabel.values()]
    .map(({ label, count, mqlIds }) => ({
      label,
      count,
      mqlIds: [...mqlIds],
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function computeCombinedScoreBreakdown(journeys, limit = 12) {
  const rows = computeFieldBreakdown(journeys, "lastCombinedScore", 500);
  return rows
    .sort((a, b) => compareCombinedScoreLabel(a.label, b.label))
    .slice(0, limit);
}

export function computeAllBreakdowns(journeys, limit = 12) {
  return {
    leadStatus: computeFieldBreakdown(journeys, "leadStatus", limit),
    combinedScore: computeCombinedScoreBreakdown(journeys, limit),
    segment: computeFieldBreakdown(journeys, "mainSegment", limit),
    owner: computeFieldBreakdown(journeys, "mainOwnerName", limit),
  };
}
