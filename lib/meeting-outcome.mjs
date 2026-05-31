function trim(v) {
  return (v ?? "").trim();
}

/** Parse Chili Piper CSV timestamps like `2026-05-29 09:30:00.000 Z`. */
export function parseChilipiperTimestamp(value) {
  const s = trim(value);
  if (!s) return null;
  const normalized = s.includes("T") ? s.replace(" Z", "Z") : s.replace(" Z", "+00:00").replace(" ", "T");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Classify meeting outcome from export status and meeting end time.
 * Past end time → held, unless export already says no-show, held, or canceled.
 */
export function classifyMeetingOutcome(fields, idx, opts = {}) {
  const now = opts.now ?? new Date();
  const ext = trim(fields?.[idx?.EXTENDED_MEETING_STATUS] ?? fields?.extendedStatus);
  const status = trim(fields?.[idx?.MEETING_STATUS] ?? fields?.meetingStatus);
  const noShow = trim(fields?.[idx?.NO_SHOW_STATUS] ?? fields?.noShowStatus);
  const combined = `${ext} ${status}`.toLowerCase();

  if (combined.includes("resched")) return "rescheduled";
  if (ext === "Canceled" || status === "Canceled") return "canceled";
  if (ext === "NoShow" || noShow === "DidNotShow") return "noshow";
  if (ext === "Completed" || noShow === "Showed") return "completed";

  const endTime = parseChilipiperTimestamp(fields?.[idx?.MEETING_END_TIME] ?? fields?.meetingEndTime);
  if (endTime && endTime.getTime() < now.getTime()) return "completed";

  if (ext === "Active" || status === "Active") return "scheduled";
  return "unknown";
}

export function outcomeWasInferredFromEndTime(fields, idx, outcome, opts = {}) {
  if (outcome !== "completed") return false;
  const ext = trim(fields?.[idx?.EXTENDED_MEETING_STATUS] ?? fields?.extendedStatus);
  const noShow = trim(fields?.[idx?.NO_SHOW_STATUS] ?? fields?.noShowStatus);
  if (ext === "Completed" || noShow === "Showed") return false;
  const endTime = parseChilipiperTimestamp(fields?.[idx?.MEETING_END_TIME] ?? fields?.meetingEndTime);
  if (!endTime) return false;
  const now = opts.now ?? new Date();
  return endTime.getTime() < now.getTime();
}

export function outcomeFlags(outcome) {
  return {
    outcome,
    /** Meeting end is in the future — not held, canceled, or no-show. */
    isScheduled: outcome === "scheduled",
    scheduled: outcome === "scheduled",
    happened: outcome === "completed",
    canceled: outcome === "canceled",
    rescheduled: outcome === "rescheduled",
    noShow: outcome === "noshow",
  };
}
