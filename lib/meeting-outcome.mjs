function trim(v) {
  return (v ?? "").trim();
}

/**
 * Classify meeting status from Chili Piper export (`EXTENDED_MEETING_STATUS`).
 * Active = not marked Held, No-show, or Canceled in the export — not necessarily future.
 */
export function classifyMeetingOutcome(fields, idx) {
  const ext = trim(fields?.[idx?.EXTENDED_MEETING_STATUS] ?? fields?.extendedStatus);
  const status = trim(fields?.[idx?.MEETING_STATUS] ?? fields?.meetingStatus);
  const noShow = trim(fields?.[idx?.NO_SHOW_STATUS] ?? fields?.noShowStatus);
  const combined = `${ext} ${status}`.toLowerCase();

  if (combined.includes("resched")) return "rescheduled";
  if (ext === "Canceled" || status === "Canceled") return "canceled";
  if (ext === "NoShow" || noShow === "DidNotShow") return "noshow";
  if (ext === "Completed" || noShow === "Showed") return "completed";
  if (ext === "Active" || status === "Active") return "scheduled";
  return "unknown";
}

export function outcomeFlags(outcome) {
  return {
    outcome,
    /** Still on the calendar — not held, canceled, or no-show. */
    isScheduled: outcome === "scheduled",
    scheduled: outcome === "scheduled",
    happened: outcome === "completed",
    canceled: outcome === "canceled",
    rescheduled: outcome === "rescheduled",
    noShow: outcome === "noshow",
  };
}
