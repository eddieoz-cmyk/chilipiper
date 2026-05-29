const HIGH_INTENT_FRAGMENTS = [
  "pricing",
  "book-a-demo",
  "book-demo",
  "free-trial",
  "/demo",
];

const ACTIVE_STATUSES = new Set([
  "SQL",
  "Sales Qualifying",
  "Discovery Call",
  "Evaluating",
  "Negotiating",
]);

const DEPRIORITIZE_STATUSES = new Set(["Nurture", "Not Relevant"]);

export const ANALYST_ASSUMPTIONS = [
  "Recency: returned within the last 7 days (last 3 days weighted highest).",
  "Engagement: 2+ post-MQL return sessions signal active re-interest.",
  "Intent: viewed pricing, book-a-demo, or free-trial pages on return.",
  "Funnel: SQL, Discovery Call, or Sales Qualifying status (not Nurture / Not Relevant).",
  "Fit: combined score in A or B tier preferred over C/D.",
  "Threshold: priority score ≥ 55 = contact immediately (analyst rule of thumb).",
];

function gradePoints(score) {
  const m = (score || "").trim().match(/^([A-D])(\d+)?$/i);
  if (!m) return 0;
  const letter = m[1].toUpperCase();
  const num = Number(m[2] || 1);
  if (letter === "A") return 15 - Math.min(num, 4);
  if (letter === "B") return 10 - Math.min(num, 4);
  if (letter === "C") return 4;
  return 0;
}

function pathIsHighIntent(path) {
  const p = (path || "").toLowerCase();
  return HIGH_INTENT_FRAGMENTS.some((frag) => p.includes(frag));
}

function daysSince(iso, nowMs) {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (nowMs - new Date(iso).getTime()) / 86400000;
}

export function computeOutreachPriority(journeys, limit = 20) {
  const now = Date.now();
  const IMMEDIATE_THRESHOLD = 55;

  const ranked = journeys.map((mql) => {
    let points = 0;
    const reasons = [];
    const visits = mql.visits ?? [];
    const returnCount = visits.length;
    const lastReturn =
      returnCount > 0
        ? visits.reduce((latest, v) =>
            new Date(v.returnedAt) > new Date(latest) ? v.returnedAt : latest,
          visits[0].returnedAt)
        : null;

    const days = daysSince(lastReturn, now);

    if (returnCount >= 3) {
      points += 28;
      reasons.push(`${returnCount} return visits`);
    } else if (returnCount === 2) {
      points += 22;
      reasons.push("2 return visits");
    } else if (returnCount === 1) {
      points += 10;
      reasons.push("1 return visit");
    } else {
      return {
        id: mql.id,
        email: mql.email,
        priorityScore: 0,
        tier: "none",
        reasons: ["No return visits yet"],
        returnVisitCount: 0,
        lastReturn: null,
        leadStatus: mql.leadStatus,
        lastCombinedScore: mql.lastCombinedScore,
        mainOwnerName: mql.mainOwnerName,
      };
    }

    if (days <= 3) {
      points += 32;
      reasons.push("Back within 3 days");
    } else if (days <= 7) {
      points += 24;
      reasons.push("Back within 7 days");
    } else if (days <= 14) {
      points += 10;
      reasons.push("Back within 14 days");
    }

    let intentHits = 0;
    for (const visit of visits) {
      for (const page of visit.pages ?? []) {
        if (pathIsHighIntent(page.path)) intentHits += 1;
      }
    }
    if (intentHits > 0) {
      points += 18 + Math.min(12, intentHits * 4);
      reasons.push("High-intent pages");
    }

    const status = (mql.leadStatus || "").trim();
    if (ACTIVE_STATUSES.has(status)) {
      points += 18;
      reasons.push(status);
    } else if (DEPRIORITIZE_STATUSES.has(status)) {
      points -= 18;
      reasons.push(`${status} (lower urgency)`);
    }

    const gradePts = gradePoints(mql.lastCombinedScore);
    points += gradePts;
    if (gradePts >= 10 && mql.lastCombinedScore) {
      reasons.push(`Score ${mql.lastCombinedScore}`);
    }

    const tier =
      points >= IMMEDIATE_THRESHOLD
        ? "immediate"
        : points >= 38
          ? "soon"
          : "watch";

    return {
      id: mql.id,
      email: mql.email,
      priorityScore: Math.round(points),
      tier,
      reasons: reasons.slice(0, 4),
      returnVisitCount: returnCount,
      lastReturn,
      leadStatus: mql.leadStatus ?? null,
      lastCombinedScore: mql.lastCombinedScore ?? null,
      mainOwnerName: mql.mainOwnerName ?? null,
    };
  });

  const allImmediate = ranked
    .filter((r) => r.tier === "immediate")
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const soon = ranked.filter((r) => r.tier === "soon").length;

  return {
    assumptions: ANALYST_ASSUMPTIONS,
    threshold: IMMEDIATE_THRESHOLD,
    immediate: allImmediate.slice(0, limit),
    counts: {
      immediate: allImmediate.length,
      soon,
      totalMqls: journeys.length,
    },
    mqlIds: allImmediate.map((r) => r.id),
  };
}
