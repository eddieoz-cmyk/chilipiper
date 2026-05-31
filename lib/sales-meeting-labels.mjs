/** Plain-language labels for the sales meetings dashboard. */

const TYPE_LABELS = {
  concierge: "Website inbound",
  handoff: "BDR → AE handoff",
  chilical: "Rep calendar",
  other: "Other",
};

const TYPE_SHORT = {
  concierge: "Website",
  handoff: "Handoff",
  chilical: "Rep calendar",
  other: "Other",
};

export function meetingTypeLabel(meetingType) {
  return TYPE_LABELS[meetingType] ?? TYPE_LABELS.other;
}

export function meetingTypeShort(meetingType) {
  return TYPE_SHORT[meetingType] ?? TYPE_SHORT.other;
}

export function statusLabel(status) {
  if (status === "Active") return "Active";
  if (status === "Canceled") return "Canceled";
  return status || "Unknown";
}

/** Sales-friendly label from Chili Piper extended meeting status. */
export function extendedStatusLabel(extended, meetingStatus) {
  const ext = String(extended ?? "").trim();
  const status = String(meetingStatus ?? "").trim();
  if (status === "Canceled" || ext === "Canceled") return "Canceled";
  if (ext === "NoShow") return "No-show";
  if (ext === "Completed") return "Held";
  if (ext === "Active" || status === "Active") return "Active";
  return ext || status || "Unknown";
}

export function outcomeLabel(outcome) {
  const labels = {
    scheduled: "Scheduled",
    canceled: "Canceled",
    noshow: "No-show",
    completed: "Held",
    rescheduled: "Rescheduled",
    unknown: "Unknown",
  };
  return labels[outcome] ?? outcome ?? "Unknown";
}

export function routeRuleTypeLabel(rawType) {
  const t = String(rawType ?? "").trim();
  if (t === "Ownership") return "Account owner queue";
  if (t === "Boolean") return "Geographic router";
  return null;
}
