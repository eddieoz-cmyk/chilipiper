function pct(n, d) {
  if (!d) return null;
  return Math.round((n / d) * 1000) / 10;
}

function summarizeType(meetings, meetingType) {
  const rows = meetings.filter((m) => m.meetingType === meetingType);
  const total = rows.length;
  const booked = rows.filter((m) => m.booked || m.bookedLive).length;
  const bookedLive = rows.filter((m) => m.bookedLive).length;
  const happened = rows.filter((m) => m.happened).length;
  const handoffToAe = rows.filter((m) => m.handoffToAe).length;

  return {
    meetingType,
    total,
    booked,
    bookedLive,
    happened,
    handoffToAe,
    rates: {
      bookedLiveOfTotal: pct(bookedLive, total),
      happenedOfBookedLive: pct(happened, bookedLive),
      happenedOfTotal: pct(happened, total),
      handoffOfTotal: pct(handoffToAe, total),
      handoffOfHappened: pct(handoffToAe, happened),
    },
  };
}

/** Aggregate KPIs across concierge + handoff meeting rows. */
export function computeMeetingsMetrics(allMeetings) {
  const concierge = summarizeType(allMeetings, "concierge");
  const handoff = summarizeType(allMeetings, "handoff");

  const bookedLive = allMeetings.filter((m) => m.bookedLive).length;
  const happened = allMeetings.filter((m) => m.happened).length;
  const handoffToAe = allMeetings.filter((m) => m.handoffToAe).length;
  const total = allMeetings.length;

  return {
    total,
    bookedLive,
    happened,
    handoffToAe,
    rates: {
      bookedLiveOfTotal: pct(bookedLive, total),
      happenedOfBookedLive: pct(happened, bookedLive),
      handoffOfHappened: pct(handoffToAe, happened),
    },
    byType: { concierge, handoff },
  };
}
