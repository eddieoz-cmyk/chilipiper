function trim(v) {
  return (v ?? "").trim();
}

/**
 * Classify meeting status from Chili Piper export.
 * Active = on calendar (not canceled). This export has no attended/no-show field.
 * @returns {'scheduled'|'canceled'|'rescheduled'|'noshow'|'unknown'}
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
  const scheduled = outcome === "scheduled" || outcome === "completed";
  return {
    outcome,
    /** On calendar — not canceled (does not mean the rep confirmed attendance). */
    isScheduled: scheduled,
    scheduled,
    happened: outcome === "completed",
    canceled: outcome === "canceled",
    rescheduled: outcome === "rescheduled",
    noShow: outcome === "noshow",
  };
}
