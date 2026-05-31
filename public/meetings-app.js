import {
  applyMeetingFilters as applyFilters,
  buildRepsFromMeetings,
  computeMeetingsReports,
  primaryRepKey,
  primaryRepName,
} from "./meetings-report-logic.mjs";
import { formatBookedDate, formatPeriodLabel } from "./sales-meeting-labels.mjs";

const $ = (sel) => document.querySelector(sel);
let data = null;
let activeTab = "all";
let chartGranularity = "auto";
const REPORT_TABS = new Set(["live", "bdr", "outcomes"]);
const filters = {
  dateFrom: "",
  dateTo: "",
  dateField: "bookedAt",
  repKey: "",
  routingRuleId: "",
  region: "",
  websiteStatus: "",
};

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const formatRate = (rate) => (rate == null ? "—" : `${rate}%`);
const pct = (n, d) => (!d ? null : Math.round((n / d) * 1000) / 10);
const parseMeetingDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const applyMeetingFilters = (meetings, f) => applyFilters(meetings, f ?? filters);
const getFilteredForReports = () => applyMeetingFilters(data?.meetings ?? []);
const getFilteredMeetings = () => {
  let rows = getFilteredForReports();
  if ($("#bookedOnly")?.checked) rows = rows.filter((m) => m.booked);
  return rows;
};

function computeWebsiteMetrics(meetings) {
  const total = meetings.length;
  const count = (o) => meetings.filter((m) => m.outcome === o).length;
  const booked = count("scheduled");
  const notBooked = count("not_scheduled");
  const disqualified = count("disqualified");
  const canceled = count("canceled");
  return {
    total,
    booked,
    notBooked,
    disqualified,
    canceled,
    rates: {
      bookedOfTotal: pct(booked, total),
      notBookedOfTotal: pct(notBooked, total),
      disqualifiedOfTotal: pct(disqualified, total),
      canceledOfTotal: pct(canceled, total),
    },
  };
}

function filtersActive() {
  const opts = data?.filterOptions;
  return (
    (filters.dateFrom && filters.dateFrom !== opts?.dateFrom) ||
    (filters.dateTo && filters.dateTo !== opts?.dateTo) ||
    Boolean(filters.repKey || filters.routingRuleId || filters.region || filters.websiteStatus)
  );
}

function updateFilterSummary() {
  const total = data?.meetings?.length ?? 0;
  const filtered = getFilteredForReports().length;
  const el = $("#filterSummary");
  const clearBtn = $("#clearFiltersBtn");
  if (!filtersActive() && filtered === total) {
    el.hidden = true;
    clearBtn.hidden = true;
    return;
  }
  el.hidden = false;
  clearBtn.hidden = false;
  const parts = [`Showing ${filtered.toLocaleString()} of ${total.toLocaleString()} submissions`];
  if (filters.websiteStatus) parts.push(`status: ${filters.websiteStatus}`);
  if (filters.region) parts.push(`country: ${filters.region}`);
  if (filters.repKey) {
    const rep = data?.filterOptions?.reps?.find((r) => r.key === filters.repKey);
    parts.push(`assignee: ${rep?.name ?? filters.repKey.replace(/^id:|^name:/, "")}`);
  }
  if (filters.routingRuleId) {
    const name = data?.filterOptions?.routingRules?.find((r) => r.id === filters.routingRuleId)?.name ?? "selected rule";
    parts.push(`rule: ${name}`);
  }
  if (filters.dateFrom || filters.dateTo) parts.push(formatPeriodLabel(filters.dateFrom, filters.dateTo));
  el.textContent = parts.join(" · ");
}

function refreshFilterOptions() {
  const opts = data?.filterOptions;
  if (!opts) return;

  const contextMeetings = applyMeetingFilters(data?.meetings ?? [], { ...filters, repKey: "" });
  const availableReps = buildRepsFromMeetings(contextMeetings);
  const repSel = $("#filterRep");
  const prevRep = filters.repKey;
  repSel.innerHTML =
    `<option value="">All assignees${availableReps.length ? ` (${availableReps.length} in view)` : ""}</option>` +
    availableReps
      .map((r) => `<option value="${escapeHtml(r.key)}">${escapeHtml(r.name ?? r.key.replace(/^id:|^name:/, ""))}</option>`)
      .join("");
  filters.repKey = prevRep && availableReps.some((r) => r.key === prevRep) ? prevRep : "";
  repSel.value = filters.repKey;

  let rules = opts.routingRules ?? [];
  if (filters.region) rules = rules.filter((r) => (r.region ?? "") === filters.region);
  const byRegion = new Map();
  for (const rule of rules) {
    const region = rule.region ?? "Other";
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push(rule);
  }
  let rulesHtml = `<option value="">All routing rules (${rules.length} in view)</option>`;
  for (const region of [...byRegion.keys()].sort((a, b) => a.localeCompare(b))) {
    rulesHtml += `<optgroup label="${escapeHtml(region)}">`;
    for (const rule of byRegion.get(region)) {
      rulesHtml += `<option value="${escapeHtml(rule.id)}">${escapeHtml(rule.name)}</option>`;
    }
    rulesHtml += `</optgroup>`;
  }
  const ruleSel = $("#filterRoutingRule");
  ruleSel.innerHTML = rulesHtml;
  filters.routingRuleId =
    filters.routingRuleId && rules.some((r) => r.id === filters.routingRuleId) ? filters.routingRuleId : "";
  ruleSel.value = filters.routingRuleId;
}

function syncRegionAndRuleFilters(changedId) {
  const opts = data?.filterOptions;
  if (!opts) return;
  if (changedId === "filterRegion" && filters.routingRuleId) {
    const rule = opts.routingRules?.find((r) => r.id === filters.routingRuleId);
    if (rule?.region && filters.region && rule.region !== filters.region) filters.routingRuleId = "";
  }
  if (changedId === "filterRoutingRule" && filters.routingRuleId) {
    const rule = opts.routingRules?.find((r) => r.id === filters.routingRuleId);
    if (rule?.region) {
      filters.region = rule.region;
      $("#filterRegion").value = rule.region;
    }
  }
}

function syncFilterDates(changedKey) {
  if (!filters.dateFrom || !filters.dateTo || filters.dateFrom <= filters.dateTo) return;
  if (changedKey === "dateFrom") filters.dateTo = filters.dateFrom;
  else filters.dateFrom = filters.dateTo;
  $("#filterDateFrom").value = filters.dateFrom;
  $("#filterDateTo").value = filters.dateTo;
}

function populateFilterControls() {
  const opts = data?.filterOptions;
  if (!opts) return;
  if (!filters.dateFrom) filters.dateFrom = opts.dateFrom ?? "";
  if (!filters.dateTo) filters.dateTo = opts.dateTo ?? "";
  $("#filterDateFrom").value = filters.dateFrom;
  $("#filterDateTo").value = filters.dateTo;
  if (opts.dateRangeMin) {
    $("#filterDateFrom").min = opts.dateRangeMin;
    $("#filterDateTo").min = opts.dateRangeMin;
  }
  if (opts.dateRangeMax) {
    $("#filterDateFrom").max = opts.dateRangeMax;
    $("#filterDateTo").max = opts.dateRangeMax;
  }
  $("#filterWebsiteStatus").innerHTML =
    `<option value="">All statuses</option>` +
    (opts.websiteStatuses ?? []).map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  $("#filterWebsiteStatus").value = filters.websiteStatus;
  const countries = opts.countries?.length ? opts.countries : opts.regions ?? [];
  $("#filterRegion").innerHTML =
    `<option value="">All countries</option>` +
    countries.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  $("#filterRegion").value = filters.region;
  refreshFilterOptions();
}

function clearFilters() {
  const opts = data?.filterOptions;
  filters.dateFrom = opts?.dateFrom ?? "";
  filters.dateTo = opts?.dateTo ?? "";
  filters.dateField = "bookedAt";
  filters.repKey = filters.routingRuleId = filters.region = filters.websiteStatus = "";
  populateFilterControls();
  renderAll();
}

const CHART_OUTCOME = {
  scheduled: "booked",
  not_scheduled: "not_booked",
  disqualified: "disqualified",
  canceled: "canceled",
};
const chartBucket = (m) => CHART_OUTCOME[m.outcome] ?? null;
const meetingDateForChart = (m) => parseMeetingDate(m[filters.dateField]) ?? parseMeetingDate(m.bookedAt);
const startOfUtcDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addUtcDays = (d, n) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
const startOfUtcWeek = (d) => {
  const day = startOfUtcDay(d);
  return addUtcDays(day, day.getUTCDay() === 0 ? -6 : 1 - day.getUTCDay());
};
const startOfUtcMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const bucketKeyForDate = (d, g) =>
  g === "month"
    ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    : g === "week"
      ? startOfUtcWeek(d).toISOString().slice(0, 10)
      : startOfUtcDay(d).toISOString().slice(0, 10);
const advanceBucket = (c, g) =>
  g === "month"
    ? new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1))
    : addUtcDays(c, g === "week" ? 7 : 1);
const pickGranularity = (from, to) => {
  if (!from || !to) return "week";
  return Math.max(1, Math.ceil((to - from) / 86400000)) > 120 ? "week" : "day";
};
const formatBucketLabel = (key, g) => {
  const d = new Date(`${key}T00:00:00.000Z`);
  if (g === "month") return d.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
};
const emptyBucket = (key) => ({ key, booked: 0, not_booked: 0, disqualified: 0, canceled: 0, total: 0 });

function buildPeriodSeries(meetings) {
  const dated = meetings.flatMap((m) => {
    const d = meetingDateForChart(m);
    return d ? [{ m, d }] : [];
  });
  if (!dated.length) return { buckets: [], granularity: "day", total: 0, rangeFrom: null, rangeTo: null };

  let rangeFrom = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`) : null;
  let rangeTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999Z`) : null;
  for (const { d } of dated) {
    if (!rangeFrom || d < rangeFrom) rangeFrom = startOfUtcDay(d);
    if (!rangeTo || d > rangeTo) rangeTo = startOfUtcDay(d);
  }
  const granularity = chartGranularity === "auto" ? pickGranularity(rangeFrom, rangeTo) : chartGranularity;
  rangeFrom =
    granularity === "month" ? startOfUtcMonth(rangeFrom) : granularity === "week" ? startOfUtcWeek(rangeFrom) : startOfUtcDay(rangeFrom);
  rangeTo =
    granularity === "month" ? startOfUtcMonth(rangeTo) : granularity === "week" ? startOfUtcWeek(rangeTo) : startOfUtcDay(rangeTo);

  const bucketMap = new Map();
  for (let cursor = new Date(rangeFrom); cursor <= rangeTo; cursor = advanceBucket(cursor, granularity)) {
    bucketMap.set(bucketKeyForDate(cursor, granularity), emptyBucket(bucketKeyForDate(cursor, granularity)));
  }
  for (const { m, d } of dated) {
    const bucket = chartBucket(m);
    if (!bucket) continue;
    const key = bucketKeyForDate(d, granularity);
    const b = bucketMap.get(key) ?? emptyBucket(key);
    b[bucket]++;
    b.total++;
    bucketMap.set(key, b);
  }
  const buckets = [...bucketMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  return { buckets, granularity, total: buckets.reduce((s, b) => s + b.total, 0), rangeFrom, rangeTo };
}

function renderPeriodChart() {
  const meetings = getFilteredForReports();
  const { buckets, granularity, total, rangeFrom, rangeTo } = buildPeriodSeries(meetings);
  const svg = $("#periodChart");
  const empty = $("#chartEmpty");
  const granLabel = granularity === "month" ? "month" : granularity === "week" ? "week" : "day";
  let subtitle = `${total.toLocaleString()} submissions · stacked by ${granLabel}`;
  if (rangeFrom && rangeTo) {
    const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    subtitle += ` · ${fmt(rangeFrom)} – ${fmt(rangeTo)}`;
  }
  $("#chartSubtitle").textContent = subtitle;
  if (!buckets.length || total === 0) {
    svg.innerHTML = "";
    empty.hidden = false;
    empty.textContent = meetings.length === 0 ? "No submissions match the current filters." : "No chartable outcomes in this period.";
    return;
  }
  empty.hidden = true;
  const w = 800;
  const h = 300;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 56;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const maxVal = Math.max(...buckets.map((b) => b.total), 1);
  const n = buckets.length;
  const gap = n > 20 ? 2 : Math.min(4, chartW / n / 4);
  const barW = Math.max(3, (chartW - gap * (n - 1)) / n);
  const labelStep = n <= 12 ? 1 : n <= 24 ? 2 : Math.max(1, Math.ceil(n / 10));
  const segments = [
    ["bar-concierge", "booked", "booked"],
    ["bar-other", "not_booked", "not booked"],
    ["bar-handoff", "disqualified", "disqualified"],
    ["bar-chilical", "canceled", "canceled"],
  ];
  let svgParts = [];
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxVal * (4 - i)) / 4);
    const y = padT + (chartH * i) / 4;
    svgParts.push(`<line class="grid-line" x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" />`);
    svgParts.push(`<text class="axis-label" x="${padL - 10}" y="${y + 4}" text-anchor="end">${val}</text>`);
  }
  buckets.forEach((b, i) => {
    const x = padL + i * (barW + gap);
    let yTop = padT + chartH;
    for (const [cls, field, label] of segments) {
      const segN = b[field];
      if (!segN) continue;
      const barH = Math.max(1, (segN / maxVal) * chartH);
      yTop -= barH;
      svgParts.push(
        `<rect class="${cls}" x="${x}" y="${yTop}" width="${barW}" height="${barH}" rx="2"><title>${escapeHtml(`${formatBucketLabel(b.key, granularity)}: ${label} ${segN}`)}</title></rect>`,
      );
    }
    if (i % labelStep === 0 || i === n - 1) {
      svgParts.push(
        `<text class="axis-label axis-label-x" x="${x + barW / 2}" y="${h - 14}" text-anchor="middle">${escapeHtml(formatBucketLabel(b.key, granularity))}</text>`,
      );
    }
  });
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.innerHTML = svgParts.join("");
}

function renderRuleAssigneeBreakdown() {
  const section = $("#ruleAssigneeSection");
  if (!filters.routingRuleId) {
    section.hidden = true;
    return;
  }
  const filtered = getFilteredForReports();
  const rule = data?.filterOptions?.routingRules?.find((r) => r.id === filters.routingRuleId);
  section.hidden = false;
  $("#ruleAssigneeHeading").textContent = "Assignees for selected rule";
  $("#ruleAssigneeSubtitle").textContent = `${filtered.length.toLocaleString()} submissions · ${rule?.name ?? filters.routingRuleId}`;
  const byRep = new Map();
  for (const m of filtered) {
    const key = primaryRepKey(m);
    if (!byRep.has(key)) {
      byRep.set(key, { name: primaryRepName(m), total: 0, booked: 0, notBooked: 0, disqualified: 0, canceled: 0 });
    }
    const r = byRep.get(key);
    r.total++;
    if (m.outcome === "scheduled") r.booked++;
    else if (m.outcome === "not_scheduled") r.notBooked++;
    else if (m.outcome === "disqualified") r.disqualified++;
    else if (m.outcome === "canceled") r.canceled++;
  }
  const sorted = [...byRep.values()].sort((a, b) => b.total - a.total);
  $("#ruleAssigneeBody").innerHTML = sorted
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.name)}</td><td class="num">${r.total}</td><td class="num">${r.booked}</td><td class="num">${r.notBooked}</td><td class="num">${r.disqualified}</td><td class="num">${r.canceled}</td></tr>`,
    )
    .join("");
  $("#ruleAssigneeEmpty").hidden = sorted.length > 0;
}

const OUTCOME_ITEMS = [
  { key: "scheduled", label: "Booked", cls: "success" },
  { key: "not_scheduled", label: "Not booked", cls: "muted" },
  { key: "disqualified", label: "Disqualified", cls: "warning" },
  { key: "canceled", label: "Canceled", cls: "danger" },
  { key: "in_progress", label: "In progress", cls: "other" },
  { key: "failed", label: "Failed", cls: "danger" },
];

function augmentLiveByRuleBooked(meetings, reports) {
  const bookedByRule = new Map();
  for (const m of meetings) {
    if (!m.booked) continue;
    const key = m.routingRuleId ?? "unknown";
    bookedByRule.set(key, (bookedByRule.get(key) ?? 0) + 1);
  }
  for (const r of reports.liveBooked.byRule) r.booked = bookedByRule.get(r.ruleId ?? "unknown") ?? 0;
}

function renderLiveReport(reports) {
  const panel = $("#liveReportPanel");
  panel.hidden = activeTab !== "live";
  if (panel.hidden) return;
  const live = reports.liveBooked;
  $("#liveReportSubtitle").textContent = `${live.total.toLocaleString()} submissions · ${live.booked.toLocaleString()} booked`;
  $("#liveByDateBody").innerHTML = live.byDate
    .slice(-60)
    .reverse()
    .map((r) => `<tr><td>${escapeHtml(r.date)}</td><td class="num">${r.count}</td></tr>`)
    .join("");
  $("#liveByRegionBody").innerHTML = live.byRegion
    .map((r) => `<tr><td>${escapeHtml(r.region)}</td><td class="num">${r.count}</td></tr>`)
    .join("");
  $("#liveByRuleBody").innerHTML = live.byRule
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.ruleName)}</td><td>${escapeHtml(r.region) || "—"}</td><td class="num">${r.count}</td><td class="num">${r.booked ?? 0}</td></tr>`,
    )
    .join("");
}

function renderBdrReport(reports) {
  const panel = $("#bdrReportPanel");
  panel.hidden = activeTab !== "bdr";
  if (panel.hidden) return;
  const rules = reports.ruleBdrDistribution;
  $("#bdrReportSubtitle").textContent = `${rules.length} routing rules with assignee activity`;
  if (!rules.length) {
    $("#bdrRuleBlocks").innerHTML = "";
    $("#bdrReportEmpty").hidden = false;
    return;
  }
  $("#bdrReportEmpty").hidden = true;
  $("#bdrRuleBlocks").innerHTML = rules
    .map((rule) => {
      const rows = rule.bdrs
        .map((b) => `<tr><td>${escapeHtml(b.name)}</td><td class="num">${b.count}</td><td class="num">${b.booked ?? 0}</td></tr>`)
        .join("");
      return `<article class="bdr-rule-block"><h3>${escapeHtml(rule.ruleName)} <span class="rule-meta">${escapeHtml(rule.region) || ""} · ${rule.total} total · ${rule.booked} booked</span></h3><div class="table-wrap"><table class="assignee-table compact-table"><thead><tr><th>Assignee</th><th>Total</th><th>Booked</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
    })
    .join("");
}

function renderOutcomesReport(reports) {
  const panel = $("#outcomesReportPanel");
  panel.hidden = activeTab !== "outcomes";
  if (panel.hidden) return;
  const { total, counts } = reports.outcomes;
  $("#outcomesReportSubtitle").textContent = `${total.toLocaleString()} submissions in filtered period`;
  $("#outcomeBars").innerHTML = OUTCOME_ITEMS.filter((i) => (counts[i.key] ?? 0) > 0)
    .map((i) => {
      const n = counts[i.key] ?? 0;
      const pctVal = total ? Math.round((n / total) * 1000) / 10 : 0;
      return `<div class="outcome-bar-row"><span class="outcome-label ${i.cls}">${escapeHtml(i.label)}</span><div class="outcome-bar-track"><div class="outcome-bar-fill ${i.cls}" style="width:${pctVal}%"></div></div><span class="num">${n.toLocaleString()} (${pctVal}%)</span></div>`;
    })
    .join("");
  $("#outcomeGrid").innerHTML = OUTCOME_ITEMS.map(
    (i) => `<article class="breakdown-card"><h3>${escapeHtml(i.label)}</h3><p class="outcome-big">${(counts[i.key] ?? 0).toLocaleString()}</p></article>`,
  ).join("");
}

function renderReports() {
  const meetings = getFilteredForReports();
  const reports = computeMeetingsReports(meetings, filters.dateField);
  augmentLiveByRuleBooked(meetings, reports);
  renderLiveReport(reports);
  renderBdrReport(reports);
  renderOutcomesReport(reports);
  return reports;
}

function renderKpis() {
  const m = computeWebsiteMetrics(getFilteredForReports());
  $("#kpiTotal").textContent = String(m.total);
  $("#kpiBooked").textContent = String(m.booked);
  $("#kpiNotBooked").textContent = String(m.notBooked);
  $("#kpiDisqualified").textContent = String(m.disqualified);
  $("#kpiCanceled").textContent = String(m.canceled);
  $("#kpiTotalFoot").textContent = filtersActive() ? "Filtered submissions" : "This month (booking date)";
  $("#kpiBookedFoot").textContent = `${formatRate(m.rates.bookedOfTotal)} booked rate`;
  $("#kpiNotBookedFoot").textContent = `${formatRate(m.rates.notBookedOfTotal)} of total`;
  $("#kpiDisqualifiedFoot").textContent = `${formatRate(m.rates.disqualifiedOfTotal)} of total`;
  $("#kpiCanceledFoot").textContent = `${formatRate(m.rates.canceledOfTotal)} of total`;
  $("#badgeAll").textContent = String(m.total);
  const reports = computeMeetingsReports(getFilteredForReports(), filters.dateField);
  $("#badgeLive").textContent = String(reports.liveBooked.total);
  $("#badgeBdr").textContent = String(reports.ruleBdrDistribution.length);
  $("#badgeOutcomes").textContent = String(reports.outcomes.total);
}

function statusPill(m) {
  const label = m.statusLabel ?? m.websiteStatus ?? "Unknown";
  let cls = "scheduled";
  if (m.outcome === "scheduled" || m.booked) cls = "scheduled";
  else if (m.outcome === "disqualified" || m.disqualified) cls = "warning";
  else if (m.outcome === "canceled" || m.canceled) cls = "noshow";
  else if (m.outcome === "not_scheduled") cls = "muted";
  return `<span class="status-pill ${cls}">${escapeHtml(label)}</span>`;
}

function formatSalesforceLink(m) {
  if (!m.crmContactUrl) return "—";
  const kind = /\/Lead\//i.test(m.crmContactUrl) ? "Lead" : "Contact";
  return `<a class="sf-link" href="${escapeHtml(m.crmContactUrl)}" target="_blank" rel="noopener noreferrer">${kind}</a>`;
}

function formatRoutingRule(m) {
  const name = m.routingRuleName ?? m.routingRule?.name;
  if (!name) return "—";
  const region = m.region ?? m.routingRule?.region ?? m.country ?? "";
  return `<span class="rule-name">${escapeHtml(name)}</span>${region ? `<span class="rule-meta">${escapeHtml(region)}</span>` : ""}`;
}

function renderTable() {
  const rows = getFilteredMeetings()
    .sort((a, b) => String(b.bookedAt).localeCompare(String(a.bookedAt)))
    .slice(0, 400);
  $("#meetingsBody").innerHTML = rows
    .map(
      (m) =>
        `<tr><td class="date-cell">${formatBookedDate(m.bookedAt)}</td><td>${escapeHtml(m.company || m.title) || "—"}</td><td>${escapeHtml(m.country ?? m.region) || "—"}</td><td class="rule-cell">${formatRoutingRule(m)}</td><td class="person-cell">${escapeHtml(primaryRepName(m))}</td><td>${statusPill(m)}</td><td class="sf-cell">${formatSalesforceLink(m)}</td></tr>`,
    )
    .join("");
  $("#emptyState").hidden = rows.length > 0;
}

function updatePeriodLine() {
  const el = $("#periodLine");
  const label = formatPeriodLabel(filters.dateFrom, filters.dateTo);
  if (!label) {
    el.hidden = true;
    return;
  }
  el.textContent = `${label} · ${getFilteredForReports().length.toLocaleString()} submissions in view`;
  el.hidden = false;
}

function renderAll() {
  refreshFilterOptions();
  updateFilterSummary();
  renderKpis();
  renderReports();
  const onReportTab = REPORT_TABS.has(activeTab);
  document.querySelector(".chart-panel.card")?.toggleAttribute("hidden", onReportTab);
  document.querySelector("#ruleAssigneeSection")?.toggleAttribute("hidden", onReportTab || !filters.routingRuleId);
  document.querySelector(".table-section.card")?.toggleAttribute("hidden", onReportTab && activeTab !== "all");
  if (!onReportTab) {
    renderPeriodChart();
    renderRuleAssigneeBreakdown();
    renderTable();
  }
  updatePeriodLine();
}

function setTab(tab) {
  activeTab = tab;
  for (const el of document.querySelectorAll(".tab")) {
    const on = el.dataset.tab === tab;
    el.classList.toggle("active", on);
    el.setAttribute("aria-selected", String(on));
  }
  renderAll();
}

function renderMeta() {
  const parts = [];
  const rowCount = data?.meetings?.length ?? data?.meta?.meetingRows;
  if (rowCount != null) parts.push(`${Number(rowCount).toLocaleString()} submissions in file`);
  if (data?.meta?.schema === "website-log") parts.push("Website concierge log");
  else if (data?.meta?.source === "chilipiper-export") parts.push("Chili Piper export");
  if (data?.meta?.fetchedAt) parts.push(`Updated ${new Date(data.meta.fetchedAt).toLocaleString()}`);
  $("#metaLine").textContent = parts.join(" · ") || "Website meetings";
  $("#setupHint").hidden = !data?.meta?.lastError;
  if (data?.meta?.lastError) $("#setupHint").textContent = `Could not load data: ${data.meta.lastError}`;
}

async function loadStaticMeetingsJson(refresh = false) {
  let cacheKey = refresh ? String(Date.now()) : "";
  try {
    const metaRes = await fetch(new URL("./site-meta.json", import.meta.url), { cache: "no-store" });
    if (metaRes.ok) cacheKey = (await metaRes.json()).builtAt ?? cacheKey;
  } catch {
    /* optional */
  }
  const dataUrl = new URL("./meetings-data.json", import.meta.url);
  if (cacheKey) dataUrl.searchParams.set("v", cacheKey);
  const res = await fetch(dataUrl, { cache: "no-store" });
  if (!res.ok) {
    $("#metaLine").textContent = "Failed to load meetings data";
    renderMeta();
    return null;
  }
  return res.json();
}

async function loadMeetings(refresh = false) {
  const payload = await loadStaticMeetingsJson(refresh);
  if (!payload) return;
  data = payload;
  filters.dateFrom = data?.filterOptions?.dateFrom ?? "";
  filters.dateTo = data?.filterOptions?.dateTo ?? "";
  filters.repKey = filters.routingRuleId = filters.region = filters.websiteStatus = "";
  populateFilterControls();
  renderAll();
  renderMeta();
  if (refresh) {
    $("#setupHint").hidden = false;
    $("#setupHint").textContent = "Refreshed from static JSON — rebuild after updating the CSV.";
  }
}

function init() {
  $("#refreshBtn").addEventListener("click", () => loadMeetings(true));
  $("#bookedOnly")?.addEventListener("change", renderAll);
  $("#clearFiltersBtn").addEventListener("click", clearFilters);
  for (const [id, key] of [
    ["filterDateFrom", "dateFrom"],
    ["filterDateTo", "dateTo"],
    ["filterRep", "repKey"],
    ["filterRoutingRule", "routingRuleId"],
    ["filterRegion", "region"],
    ["filterWebsiteStatus", "websiteStatus"],
  ]) {
    $(`#${id}`).addEventListener("change", (e) => {
      filters[key] = e.target.value;
      syncFilterDates(key);
      syncRegionAndRuleFilters(id);
      renderAll();
    });
  }
  for (const tab of document.querySelectorAll(".tab")) tab.addEventListener("click", () => setTab(tab.dataset.tab));
  $("#chartGranularity").addEventListener("change", (e) => {
    chartGranularity = e.target.value;
    renderPeriodChart();
  });
  loadMeetings();
}

init();
