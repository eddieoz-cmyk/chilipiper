function repKey(m) {
  const host = m.hostUser;
  if (host?.id) return `id:${host.id}`;
  if (host?.email) return `email:${host.email}`;
  if (m.ae) return `email:${m.ae}`;
  return "unknown";
}

function repRow(m) {
  const host = m.hostUser;
  return {
    id: host?.id ?? null,
    name: host?.name ?? null,
    email: host?.email ?? m.ae ?? null,
  };
}

/**
 * Per-AE distribution of handoff meetings by prior website route type.
 * @param {Array} meetings - enriched calendar rows
 */
export function computeHandoffDistribution(meetings) {
  const handoffs = meetings.filter((m) => m.meetingType === "handoff");
  const byRep = new Map();

  for (const m of handoffs) {
    const key = repKey(m);
    if (!byRep.has(key)) {
      const r = repRow(m);
      byRep.set(key, {
        repId: r.id,
        name: r.name ?? r.email ?? "Unknown",
        email: r.email,
        total: 0,
        fromRouter: 0,
        fromOwnership: 0,
        unlinked: 0,
        held: 0,
      });
    }
    const row = byRep.get(key);
    row.total++;
    if (m.happened) row.held++;

    const origin = m.handoffRouteOrigin ?? "unlinked";
    if (origin === "ownership") row.fromOwnership++;
    else if (origin === "router") row.fromRouter++;
    else row.unlinked++;
  }

  const reps = [...byRep.values()].sort((a, b) => b.total - a.total);
  const totals = reps.reduce(
    (acc, r) => {
      acc.total += r.total;
      acc.fromRouter += r.fromRouter;
      acc.fromOwnership += r.fromOwnership;
      acc.unlinked += r.unlinked;
      acc.held += r.held;
      return acc;
    },
    { total: 0, fromRouter: 0, fromOwnership: 0, unlinked: 0, held: 0 },
  );

  return { reps, totals, handoffCount: handoffs.length };
}
