function parseMeetingDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToInputValue(d) {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/** @param {Map} [rulesIndex] full rule list for filter dropdown */
export function buildMeetingsFilterOptions(meetings, rulesIndex = null) {
  let minDate = null;
  let maxDate = null;
  const regions = new Set();
  const meetingTypes = new Set();
  const countries = new Set();
  const rulesUsed = new Map();
  const reps = new Map();

  function addRep(person) {
    if (!person) return;
    const id = person.id ?? person.repId;
    const email = person.email;
    if (!id && !email) return;
    const key = id ? `id:${id}` : `email:${email}`;
    if (reps.has(key)) return;
    reps.set(key, {
      key,
      id: id ?? null,
      name: person.name ?? null,
      email: email ?? null,
    });
  }

  for (const m of meetings) {
    const d = parseMeetingDate(m.meetingAt) ?? parseMeetingDate(m.bookedAt);
    if (d) {
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
    addRep(m.assignedUser);
    addRep(m.hostUser);
    addRep(m.bookerUser);
    if (m.region) regions.add(m.region);
    if (m.meetingType) meetingTypes.add(m.meetingType);
    if (m.country) countries.add(m.country);
    if (m.routingRuleId && m.routingRuleName) {
      rulesUsed.set(m.routingRuleId, {
        id: m.routingRuleId,
        name: m.routingRuleName,
        region: m.routingRule?.region ?? m.routingRuleRegion ?? m.region ?? null,
        segment: m.routingRule?.segment ?? null,
        size: m.routingRule?.size ?? null,
      });
    }
  }

  const routingRules = [...rulesUsed.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    dateFrom: dateToInputValue(minDate),
    dateTo: dateToInputValue(maxDate),
    reps: [...reps.values()].sort((a, b) =>
      (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""),
    ),
    regions: [...regions].sort((a, b) => a.localeCompare(b)),
    meetingTypes: [...meetingTypes].sort(),
    countries: [...countries].sort((a, b) => a.localeCompare(b)),
    routingRules,
    allRoutingRuleCount: rulesIndex?.size ?? routingRules.length,
  };
}
