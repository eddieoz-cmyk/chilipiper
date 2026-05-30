function pct(n, d) {
  if (!d) return null;
  return Math.round((n / d) * 1000) / 10;
}

function summarizeType(meetings, meetingType) {
  const rows = meetings.filter((m) => m.meetingType === meetingType);
  const total = rows.length;
  const scheduled = rows.filter((m) => m.isScheduled).length;
  const canceled = rows.filter((m) => m.canceled).length;

  return {
    meetingType,
    total,
    scheduled,
    canceled,
    bookedLive: meetingType === "concierge" ? total : 0,
    handoffToAe: meetingType === "handoff" ? total : 0,
    rates: {
      scheduledOfTotal: pct(scheduled, total),
      canceledOfTotal: pct(canceled, total),
    },
  };
}

/** Aggregate KPIs for sales dashboard. */
export function computeMeetingsMetrics(allMeetings) {
  const concierge = summarizeType(allMeetings, "concierge");
  const handoff = summarizeType(allMeetings, "handoff");
  const chilical = summarizeType(allMeetings, "chilical");

  const scheduled = allMeetings.filter((m) => m.isScheduled).length;
  const canceled = allMeetings.filter((m) => m.canceled).length;
  const total = allMeetings.length;

  return {
    total,
    scheduled,
    canceled,
    bookedLive: concierge.total,
    handoffToAe: handoff.total,
    chilical: chilical.total,
    rates: {
      scheduledOfTotal: pct(scheduled, total),
      canceledOfTotal: pct(canceled, total),
    },
    byType: { concierge, handoff, chilical },
  };
}
