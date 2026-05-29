const GEO_RULE = /\s\|\s.+:/;

function walkConditions(node) {
  if (!node) return false;
  if (node.type === "OwnershipCondition") return true;
  if (Array.isArray(node.conditions)) {
    return node.conditions.some((child) => walkConditions(child));
  }
  return false;
}

/** Ownership queue vs geographic/segment router rule. */
export function isOwnershipRule(rawOrRecord) {
  const name = String(rawOrRecord?.name ?? "").toLowerCase();
  if (name.includes("ownership")) return true;
  if (rawOrRecord?.conditions) return walkConditions(rawOrRecord.conditions);
  return false;
}

export function routeOriginFromRule(rule) {
  if (!rule) return "unlinked";
  if (rule.isOwnershipRule) return "ownership";
  if (GEO_RULE.test(rule.name ?? "")) return "router";
  if (rule.hasConcierge || rule.hasDistro) return "router";
  return "router";
}
