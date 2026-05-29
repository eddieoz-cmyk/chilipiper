function trim(v) {
  return (v ?? "").trim();
}

/**
 * Classify calendar meeting outcome from meetings.csv fields.
 * @returns {'happened'|'canceled'|'noshow'|'rescheduled'|'scheduled'}
 */
export function classifyMeetingOutcome(fields, idx) {
  const ext = trim(fields?.[idx?.EXTENDED_MEETING_STATUS] ?? fields?.extendedStatus);
  const status = trim(fields?.[idx?.MEETING_STATUS] ?? fields?.meetingStatus);
  const noShow = trim(fields?.[idx?.NO_SHOW_STATUS] ?? fields?.noShowStatus);
  const combined = `${ext} ${status}`.toLowerCase();

  if (combined.includes("resched")) return "rescheduled";
  if (ext === "Canceled" || status === "Canceled") return "canceled";
  if (ext === "NoShow" || noShow === "DidNotShow") return "noshow";
  if (ext === "Completed" || noShow === "Showed") return "happened";
  if (ext === "Active" || status === "Active") return "happened";
  return "scheduled";
}

export function outcomeFlags(outcome) {
  return {
    outcome,
    happened: outcome === "happened",
    canceled: outcome === "canceled",
    rescheduled: outcome === "rescheduled",
    noShow: outcome === "noshow",
  };
}
