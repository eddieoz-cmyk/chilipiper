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
  if (status === "Active") return "Scheduled";
  if (status === "Canceled") return "Canceled";
  return status || "Unknown";
}

export function routeRuleTypeLabel(rawType) {
  const t = String(rawType ?? "").trim();
  if (t === "Ownership") return "Account owner queue";
  if (t === "Boolean") return "Geographic router";
  return null;
}
