import {
  applyMeetingFilters as applyFilters,
  computeMeetingsReports,
  primaryRepKey,
  primaryRepName,
} from "./meetings-report-logic.mjs";
import {
  formatBookedDate,
  formatPeriodLabel,
  meetingTypeLabel,
  meetingTypeShort,
  statusLabel,
} from "./sales-meeting-labels.mjs";

const $ = (sel) => document.querySelector(sel);

let data = null;
let activeTab = "all";
const filters = {
  dateFrom: "",
  dateTo: "",
  dateField: "bookedAt",
  repKey: "",
  routingRuleId: "",
  region: "",
  meetingType: "",
};

let chartGranularity = "auto";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatRate(rate) {
  if (rate == null) return "—";
  return `${rate}%`;
}

function parseMeetingDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pct(n, d) {
  if (!d) return null;
  return Math.round((n / d) * 1000) / 10;
}

function summarizeType(allMeetings, meetingType) {
  const rows = allMeetings.filter((m) => m.meetingType === meetingType);
  const total = rows.length;
  const scheduled = rows.filter((m) => m.isScheduled).length;
  const canceled = rows.filter((m) => m.canceled).length;
  return {
    meetingType,
    total,
    scheduled,
    canceled,
    rates: {
      scheduledOfTotal: pct(scheduled, total),
      canceledOfTotal: pct(canceled, total),
    },
  };
}

function computeMeetingsMetrics(allMeetings) {
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

function filtersActive() {
  const opts = data?.filterOptions;
  return (
    (filters.dateFrom && filters.dateFrom !== opts?.dateFrom) ||
    (filters.dateTo && filters.dateTo !== opts?.dateTo) ||
    Boolean(filters.repKey) ||
    Boolean(filters.routingRuleId) ||
    Boolean(filters.region) ||
    Boolean(filters.meetingType)
  );
}

function applyMeetingFilters(meetings, overrideFilters) {
  return applyFilters(meetings, overrideFilters ?? filters);
}

function getFilteredMeetings() {
  let rows = applyMeetingFilters(data?.meetings ?? []);
  if ($("#excludeCanceled")?.checked) {
    rows = rows.filter((m) => m.isScheduled);
  }
  return rows;
}

function getFilteredForReports() {
  return applyMeetingFilters(data?.meetings ?? []);
}

const REPORT_TABS = new Set(["live", "bdr", "outcomes", "handoffs"]);

function getMetricsForView() {
  const rows = applyMeetingFilters(data?.meetings ?? []);
  return computeMeetingsMetrics(rows);
}

function updateFilterSummary() {
  const total = data?.meetings?.length ?? 0;
  const filtered = applyMeetingFilters(data?.meetings ?? []).length;
  const el = $("#filterSummary");
  const clearBtn = $("#clearFiltersBtn");

  if (!filtersActive() && filtered === total) {
    el.hidden = true;
    clearBtn.hidden = true;
    return;
  }

  el.hidden = false;
  clearBtn.hidden = false;

  const parts = [`Showing ${filtered.toLocaleString()} of ${total.toLocaleString()} meetings`];
  if (filters.repKey) {
    const rep = data?.filterOptions?.reps?.find((r) => r.key === filters.repKey);
    parts.push(`rep: ${rep?.name ?? rep?.email ?? filters.repKey}`);
  }
  if (filters.routingRuleId) {
    const name =
      data?.filterOptions?.routingRules?.find((r) => r.id === filters.routingRuleId)?.name ??
      "selected rule";
    parts.push(`rule: ${name}`);
  }
  if (filters.region) parts.push(`region: ${filters.region}`);
  if (filters.meetingType) parts.push(`source: ${meetingTypeLabel(filters.meetingType)}`);
  if (filters.dateFrom || filters.dateTo) {
    parts.push(formatPeriodLabel(filters.dateFrom, filters.dateTo));
  }
  el.textContent = parts.join(" · ");
}

function populateFilterControls() {
  const opts = data?.filterOptions;
  if (!opts) return;

  if (!filters.dateFrom) filters.dateFrom = opts.dateFrom ?? "";
  if (!filters.dateTo) filters.dateTo = opts.dateTo ?? "";

  $("#filterDateFrom").value = filters.dateFrom;
  $("#filterDateTo").value = filters.dateTo;
  if (opts.dateRangeMin) $("#filterDateFrom").min = opts.dateRangeMin;
  if (opts.dateRangeMax) {
    $("#filterDateFrom").max = opts.dateRangeMax;
    $("#filterDateTo").max = opts.dateRangeMax;
  }
  if (opts.dateRangeMin) $("#filterDateTo").min = opts.dateRangeMin;

  const typeSel = $("#filterMeetingType");
  typeSel.value = filters.meetingType;

  const regionSel = $("#filterRegion");
  regionSel.innerHTML =
    `<option value="">All regions</option>` +
    (opts.regions ?? [])
      .map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`)
      .join("");
  regionSel.value = filters.region;

  const repSel = $("#filterRep");
  repSel.innerHTML =
    `<option value="">All reps</option>` +
    (opts.reps ?? [])
      .map((r) => {
        const label = r.name ?? r.key.replace(/^id:|^email:/, "");
        return `<option value="${escapeHtml(r.key)}">${escapeHtml(label)}</option>`;
      })
      .join("");
  repSel.value = filters.repKey;

  const ruleSel = $("#filterRoutingRule");
  const rules = opts.routingRules ?? [];
  const byRegion = new Map();
  for (const rule of rules) {
    const region = rule.region ?? "Other";
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push(rule);
  }

  let rulesHtml = `<option value="">All routing rules (${rules.length} used in meetings)</option>`;
  for (const region of [...byRegion.keys()].sort((a, b) => a.localeCompare(b))) {
    const group = byRegion.get(region);
    rulesHtml += `<optgroup label="${escapeHtml(region)}">`;
    for (const rule of group) {
      rulesHtml += `<option value="${escapeHtml(rule.id)}">${escapeHtml(rule.name)}</option>`;
    }
    rulesHtml += `</optgroup>`;
  }
  ruleSel.innerHTML = rulesHtml;
  ruleSel.value = filters.routingRuleId;
}

function clearFilters() {
  const opts = data?.filterOptions;
  filters.dateFrom = opts?.dateFrom ?? "";
  filters.dateTo = opts?.dateTo ?? "";
  filters.dateField = "bookedAt";
  filters.repKey = "";
  filters.routingRuleId = "";
  filters.region = "";
  filters.meetingType = "";
  populateFilterControls();
  renderAll();
}

function meetingDateForChart(m) {
  return (
    parseMeetingDate(m[filters.dateField]) ??
    parseMeetingDate(m.meetingAt) ??
    parseMeetingDate(m.bookedAt)
  );
}

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function startOfUtcWeek(d) {
  const day = startOfUtcDay(d);
  const dow = day.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addUtcDays(day, diff);
}

function startOfUtcMonth(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function bucketKeyForDate(d, granularity) {
  if (granularity === "month") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (granularity === "week") {
    return startOfUtcWeek(d).toISOString().slice(0, 10);
  }
  return startOfUtcDay(d).toISOString().slice(0, 10);
}

function advanceBucket(cursor, granularity) {
  if (granularity === "month") {
    return new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  if (granularity === "week") return addUtcDays(cursor, 7);
  return addUtcDays(cursor, 1);
}

function pickGranularity(from, to) {
  if (!from || !to) return "week";
  const days = Math.max(1, Math.ceil((to - from) / 86400000));
  if (days > 120) return "week";
  if (days > 14) return "day";
  return "day";
}

function formatBucketLabel(key, granularity) {
  const d = new Date(`${key}T00:00:00.000Z`);
  if (granularity === "month") {
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  if (granularity === "week") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function buildPeriodSeries(meetings) {
  const dated = [];
  for (const m of meetings) {
    const d = meetingDateForChart(m);
    if (d) dated.push({ m, d });
  }

  let rangeFrom = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`) : null;
  let rangeTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999Z`) : null;

  for (const { d } of dated) {
    if (!rangeFrom || d < rangeFrom) rangeFrom = startOfUtcDay(d);
    if (!rangeTo || d > rangeTo) rangeTo = startOfUtcDay(d);
  }

  if (!rangeFrom || !rangeTo) {
    return { buckets: [], granularity: "day", total: 0 };
  }

  const granularity =
    chartGranularity === "auto" ? pickGranularity(rangeFrom, rangeTo) : chartGranularity;

  if (granularity === "month") {
    rangeFrom = startOfUtcMonth(rangeFrom);
    rangeTo = startOfUtcMonth(rangeTo);
  } else if (granularity === "week") {
    rangeFrom = startOfUtcWeek(rangeFrom);
    rangeTo = startOfUtcWeek(rangeTo);
  } else {
    rangeFrom = startOfUtcDay(rangeFrom);
    rangeTo = startOfUtcDay(rangeTo);
  }

  const bucketMap = new Map();
  let cursor = new Date(rangeFrom);
  const end = new Date(rangeTo);
  while (cursor <= end) {
    const key = bucketKeyForDate(cursor, granularity);
    bucketMap.set(key, { key, concierge: 0, handoff: 0, chilical: 0, other: 0, total: 0 });
    cursor = advanceBucket(cursor, granularity);
  }

  for (const { m, d } of dated) {
    const key = bucketKeyForDate(d, granularity);
    let b = bucketMap.get(key);
    if (!b) {
      b = { key, concierge: 0, handoff: 0, chilical: 0, other: 0, total: 0 };
      bucketMap.set(key, b);
    }
    if (m.meetingType === "concierge") b.concierge++;
    else if (m.meetingType === "handoff") b.handoff++;
    else if (m.meetingType === "chilical") b.chilical++;
    else b.other++;
    b.total++;
  }

  const buckets = [...bucketMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const total = buckets.reduce((s, b) => s + b.total, 0);
  return { buckets, granularity, total, rangeFrom, rangeTo };
}

function renderPeriodChart() {
  const meetings = getFilteredMeetings();
  const { buckets, granularity, total, rangeFrom, rangeTo } = buildPeriodSeries(meetings);
  const svg = $("#periodChart");
  const empty = $("#chartEmpty");

  const granLabel =
    granularity === "month" ? "month" : granularity === "week" ? "week" : "day";
  const dateLabel = "booking date";
  let subtitle = `${total.toLocaleString()} meetings · by ${granLabel} · ${dateLabel}`;
  if (rangeFrom && rangeTo) {
    const fmt = (d) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    subtitle += ` · ${fmt(rangeFrom)} – ${fmt(rangeTo)}`;
  }
  $("#chartSubtitle").textContent = subtitle;

  if (!buckets.length || total === 0) {
    svg.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const w = 800;
  const h = 280;
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 52;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const maxVal = Math.max(...buckets.map((b) => b.total), 1);
  const n = buckets.length;
  const gap = Math.min(4, chartW / n / 4);
  const barW = Math.max(2, (chartW - gap * (n - 1)) / n);

  const yTicks = Math.min(4, maxVal);
  let svgParts = [];

  for (let i = 0; i <= yTicks; i++) {
    const val =
      yTicks === 0 ? maxVal : Math.round((maxVal * (yTicks - i)) / yTicks);
    const y = padT + (chartH * i) / yTicks;
    svgParts.push(`<line class="grid-line" x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" />`);
    svgParts.push(
      `<text class="axis-label" x="${padL - 8}" y="${y + 4}" text-anchor="end">${val}</text>`,
    );
  }

  buckets.forEach((b, i) => {
    const x = padL + i * (barW + gap);
    const segments = [
      { cls: "bar-concierge", n: b.concierge },
      { cls: "bar-handoff", n: b.handoff },
      { cls: "bar-chilical", n: b.chilical },
      { cls: "bar-other", n: b.other },
    ];
    let yTop = padT + chartH;
    for (const seg of segments) {
      if (!seg.n) continue;
      const barH = (seg.n / maxVal) * chartH;
      yTop -= barH;
      const title = `${formatBucketLabel(b.key, granularity)}: ${seg.cls.replace("bar-", "")} ${seg.n}`;
      svgParts.push(
        `<rect class="${seg.cls}" x="${x}" y="${yTop}" width="${barW}" height="${barH}" rx="1"><title>${escapeHtml(title)}</title></rect>`,
      );
    }
    if (n <= 40 || i % Math.ceil(n / 20) === 0 || i === n - 1) {
      const label = formatBucketLabel(b.key, granularity);
      svgParts.push(
        `<text class="axis-label" x="${x + barW / 2}" y="${h - 12}" text-anchor="middle">${escapeHtml(label)}</text>`,
      );
    }
  });

  svg.innerHTML = svgParts.join("");
}

function repKeyForMeeting(m) {
  return primaryRepKey(m);
}

function repDisplayForMeeting(m) {
  return { name: primaryRepName(m) };
}

function renderRuleAssigneeBreakdown() {
  const section = $("#ruleAssigneeSection");
  if (!filters.routingRuleId) {
    section.hidden = true;
    return;
  }

  const rule =
    data?.filterOptions?.routingRules?.find((r) => r.id === filters.routingRuleId) ??
    data?.meetings?.find((m) => m.routingRuleId === filters.routingRuleId)?.routingRule;

  const websiteRows = applyMeetingFilters(data?.meetings ?? []).filter(
    (m) => m.meetingType === "concierge",
  );
  const periodFilters = { ...filters, routingRuleId: "" };
  const handoffRows = applyMeetingFilters(data?.meetings ?? [], periodFilters).filter(
    (m) => m.meetingType === "handoff",
  );

  section.hidden = false;
  $("#ruleAssigneeHeading").textContent = "Rep breakdown for selected rule";
  const websiteTotal = websiteRows.length;
  const handoffTotal = handoffRows.length;
  $("#ruleAssigneeSubtitle").textContent = rule?.name
    ? `${websiteTotal.toLocaleString()} website meetings on “${rule.name}” · ${handoffTotal.toLocaleString()} BDR handoffs in the same period (handoffs are not tagged with a routing rule)`
    : `${websiteTotal.toLocaleString()} website meetings for selected rule`;

  const byRep = new Map();

  function ensureRep(m) {
    const key = repKeyForMeeting(m);
    if (!byRep.has(key)) {
      byRep.set(key, {
        name: repDisplayForMeeting(m).name,
        total: 0,
        concierge: 0,
        chilical: 0,
        handoff: 0,
        scheduled: 0,
        canceled: 0,
      });
    }
    return byRep.get(key);
  }

  for (const m of websiteRows) {
    const r = ensureRep(m);
    r.total++;
    r.concierge++;
    if (m.isScheduled) r.scheduled++;
    if (m.canceled) r.canceled++;
  }

  for (const m of handoffRows) {
    const r = ensureRep(m);
    r.total++;
    r.handoff++;
    if (m.isScheduled) r.scheduled++;
    if (m.canceled) r.canceled++;
  }

  const sorted = [...byRep.values()].sort((a, b) => b.total - a.total);
  const tbody = $("#ruleAssigneeBody");
  tbody.innerHTML = sorted
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td class="num">${r.total}</td>
      <td class="num">${r.concierge}</td>
      <td class="num">${r.chilical}</td>
      <td class="num">${r.handoff}</td>
      <td class="num">${r.scheduled}</td>
      <td class="num">${r.canceled}</td>
    </tr>
  `,
    )
    .join("");

  $("#ruleAssigneeEmpty").hidden = sorted.length > 0;
}

function renderLiveReport(reports) {
  const panel = $("#liveReportPanel");
  const show = activeTab === "live";
  panel.hidden = !show;
  if (!show) return;

  const live = reports.liveBooked;
  $("#liveReportSubtitle").textContent = `${live.total.toLocaleString()} website inbound meetings in this period`;
  $("#badgeLive").textContent = String(live.total);

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
        `<tr><td>${escapeHtml(r.ruleName)}</td><td>${escapeHtml(r.region) || "—"}</td><td class="num">${r.count}</td></tr>`,
    )
    .join("");
}

function renderBdrReport(reports) {
  const panel = $("#bdrReportPanel");
  const show = activeTab === "bdr";
  panel.hidden = !show;
  if (!show) return;

  const rules = reports.ruleBdrDistribution;
  $("#bdrReportSubtitle").textContent = `${rules.length} routing rules with calendar meetings`;
  $("#badgeBdr").textContent = String(rules.length);

  if (!rules.length) {
    $("#bdrRuleBlocks").innerHTML = "";
    $("#bdrReportEmpty").hidden = false;
    return;
  }
  $("#bdrReportEmpty").hidden = true;

  $("#bdrRuleBlocks").innerHTML = rules
    .map((rule) => {
      const rows = rule.bdrs
        .map(
          (b) =>
            `<tr><td>${escapeHtml(b.name)}</td><td class="num">${b.count}</td></tr>`,
        )
        .join("");
      return `
        <article class="bdr-rule-block">
          <h3>${escapeHtml(rule.ruleName)} <span class="rule-meta">${escapeHtml(rule.region) || ""} · ${rule.total} meetings</span></h3>
          <div class="table-wrap">
            <table class="assignee-table compact-table">
              <thead><tr><th>BDR / assignee</th><th>Meetings</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </article>`;
    })
    .join("");
}

function renderOutcomesReport(reports) {
  const panel = $("#outcomesReportPanel");
  const show = activeTab === "outcomes";
  panel.hidden = !show;
  if (!show) return;

  const { total, counts } = reports.outcomes;
  $("#outcomesReportSubtitle").textContent = `${total.toLocaleString()} calendar meetings in filtered period`;
  $("#badgeOutcomes").textContent = String(total);

  const items = [
    { key: "scheduled", label: "Scheduled", cls: "success" },
    { key: "canceled", label: "Canceled", cls: "danger" },
    { key: "rescheduled", label: "Rescheduled", cls: "warning" },
    { key: "noshow", label: "No-show", cls: "muted" },
    { key: "completed", label: "Completed", cls: "success" },
    { key: "unknown", label: "Other", cls: "other" },
  ];

  $("#outcomeBars").innerHTML = items
    .filter((i) => counts[i.key] > 0 || i.key === "scheduled" || i.key === "canceled")
    .map((i) => {
      const n = counts[i.key] ?? 0;
      const pctVal = total ? Math.round((n / total) * 1000) / 10 : 0;
      return `
        <div class="outcome-bar-row">
          <span class="outcome-label ${i.cls}">${escapeHtml(i.label)}</span>
          <div class="outcome-bar-track"><div class="outcome-bar-fill ${i.cls}" style="width:${pctVal}%"></div></div>
          <span class="num">${n.toLocaleString()} (${pctVal}%)</span>
        </div>`;
    })
    .join("");

  $("#outcomeGrid").innerHTML = items
    .map(
      (i) => `
      <article class="breakdown-card">
        <h3>${escapeHtml(i.label)}</h3>
        <p class="outcome-big">${(counts[i.key] ?? 0).toLocaleString()}</p>
      </article>`,
    )
    .join("");
}

function renderHandoffsReport(reports) {
  const panel = $("#handoffsReportPanel");
  const show = activeTab === "handoffs";
  panel.hidden = !show;
  if (!show) return;

  const h = reports.handoffs;
  $("#handoffsReportSubtitle").textContent = `${h.total.toLocaleString()} handoffs · ${h.scheduled.toLocaleString()} scheduled · ${h.canceled.toLocaleString()} canceled`;
  $("#badgeHandoffs").textContent = String(h.total);

  $("#handoffSummary").innerHTML = `
    <span>Total <strong>${h.total}</strong></span>
    <span>Scheduled <strong>${h.scheduled}</strong></span>
    <span>Canceled <strong>${h.canceled}</strong></span>
    <span>BDR→AE pairs <strong>${h.byPair.length}</strong></span>`;

  $("#handoffPairsBody").innerHTML = h.byPair
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.bdrName)}</td>
      <td>${escapeHtml(p.aeName)}</td>
      <td class="num">${p.total}</td>
      <td class="num">${p.scheduled}</td>
      <td class="num">${p.canceled}</td>
    </tr>`,
    )
    .join("");

  $("#handoffPairsEmpty").hidden = h.byPair.length > 0;
}

function renderReports() {
  const meetings = getFilteredForReports();
  const reports = computeMeetingsReports(meetings, filters.dateField);
  renderLiveReport(reports);
  renderBdrReport(reports);
  renderOutcomesReport(reports);
  renderHandoffsReport(reports);
}

function renderAll() {
  updateFilterSummary();
  renderKpis();
  renderReports();
  const onReportTab = REPORT_TABS.has(activeTab);
  const hideOverview = onReportTab;
  document.querySelector(".chart-panel.card")?.toggleAttribute("hidden", hideOverview);
  document.querySelector("#breakdownHeading")?.closest(".card")?.toggleAttribute("hidden", hideOverview);
  document.querySelector(".table-section.card")?.toggleAttribute("hidden", hideOverview && activeTab !== "all");
  document.querySelector("#ruleAssigneeSection")?.toggleAttribute("hidden", hideOverview || !filters.routingRuleId);
  if (!hideOverview) {
    renderPeriodChart();
    renderRuleAssigneeBreakdown();
    renderBreakdown();
    renderTable();
  }
  $("#distributionPanel")?.setAttribute("hidden", "");
  updatePeriodLine();
}

function updatePeriodLine() {
  const el = $("#periodLine");
  if (!el) return;
  const label = formatPeriodLabel(filters.dateFrom, filters.dateTo);
  if (!label) {
    el.hidden = true;
    return;
  }
  const count = applyMeetingFilters(data?.meetings ?? []).length;
  el.textContent = `${label} · ${count.toLocaleString()} meetings in view`;
  el.hidden = false;
}

function renderKpis() {
  const m = getMetricsForView();
  const filtered = filtersActive();

  $("#kpiCalendarTotal").textContent = String(m.total);
  $("#kpiConciergeCalendar").textContent = String(m.byType.concierge.total);
  $("#kpiHandoff").textContent = String(m.byType.handoff.total);
  $("#kpiChilical").textContent = String(m.byType.chilical?.total ?? 0);
  $("#kpiScheduled").textContent = String(m.scheduled);

  const canceled = m.canceled;
  $("#kpiCanceled").textContent = String(canceled);
  $("#kpiCanceledFoot").textContent = `${formatRate(m.rates.canceledOfTotal)} cancel rate`;

  $("#kpiCalendarFoot").textContent = filtered ? "Custom date range" : "This month (booking date)";
  $("#kpiConciergeCalendarFoot").textContent = `${formatRate(pct(m.byType.concierge.total, m.total))} of total`;
  $("#kpiHandoffFoot").textContent = `${formatRate(pct(m.byType.handoff.total, m.total))} of total`;
  $("#kpiChilicalFoot").textContent = `${formatRate(pct(m.byType.chilical?.total ?? 0, m.total))} of total`;
  $("#kpiScheduledFoot").textContent = `${formatRate(m.rates.scheduledOfTotal)} still on calendar`;

  $("#badgeAll").textContent = String(m.total);

  const filteredRows = applyMeetingFilters(data?.meetings ?? []);
  const reports = computeMeetingsReports(filteredRows, filters.dateField);
  $("#badgeLive").textContent = String(reports.liveBooked.total);
  $("#badgeBdr").textContent = String(reports.ruleBdrDistribution.length);
  $("#badgeOutcomes").textContent = String(reports.outcomes.total);
  $("#badgeHandoffs").textContent = String(reports.handoffs.total);
}

function renderBreakdown() {
  const m = getMetricsForView();
  const grid = $("#breakdownGrid");
  const types = [
    { key: "concierge", title: "Website inbound" },
    { key: "handoff", title: "BDR → AE handoff" },
    { key: "chilical", title: "Rep calendar" },
  ];

  grid.innerHTML = types
    .map(({ key, title }) => {
      const s = m.byType[key];
      if (!s) return "";
      return `
        <article class="breakdown-card">
          <h3>${escapeHtml(title)}</h3>
          <dl class="breakdown-stats">
            <div><dt>Booked</dt><dd>${s.total.toLocaleString()}</dd></div>
            <div><dt>Scheduled</dt><dd>${s.scheduled.toLocaleString()}</dd></div>
            <div><dt>Canceled</dt><dd>${s.canceled.toLocaleString()}</dd></div>
            <div><dt>Cancel rate</dt><dd>${formatRate(s.rates.canceledOfTotal)}</dd></div>
          </dl>
        </article>
      `;
    })
    .join("");
}

function filteredMeetingsForTable() {
  let rows = getFilteredMeetings();
  rows = [...rows].sort((a, b) => String(b.bookedAt).localeCompare(String(a.bookedAt)));
  return rows.slice(0, 400);
}

function statusPill(m) {
  const label = m.statusLabel ?? statusLabel(m.status);
  const cls = m.canceled ? "canceled" : "scheduled";
  return `<span class="status-pill ${cls}">${escapeHtml(label)}</span>`;
}

function formatPerson(user) {
  if (!user?.name) return "—";
  return `<span class="person-name">${escapeHtml(user.name)}</span>`;
}

function formatRouteOrigin(origin) {
  const o = origin ?? "unlinked";
  const label = o === "ownership" ? "Ownership" : o === "router" ? "Router" : "No site log";
  return `<span class="origin-tag ${escapeHtml(o)}">${label}</span>`;
}

function formatRoutingRule(m) {
  const rule = m.routingRule;
  const name = m.routingRuleName || rule?.name;
  if (!name) return "—";
  const meta = [rule?.segment, rule?.size].filter(Boolean).join(" · ");
  const title = [name, rule?.region, meta, rule?.countries].filter(Boolean).join(" · ");
  const sub = meta || rule?.region || "";
  return `<span class="rule-name" title="${escapeHtml(title)}">${escapeHtml(name)}</span>${sub ? `<span class="rule-meta">${escapeHtml(sub)}</span>` : ""}`;
}

function bdrPerson(m) {
  if (m.meetingType === "handoff") return m.bookerUser ?? m.assignedUser;
  return m.assignedUser ?? m.bookerUser;
}

function aePerson(m) {
  return m.hostUser;
}

function renderTable() {
  const rows = filteredMeetingsForTable();
  const tbody = $("#meetingsBody");
  tbody.innerHTML = rows
    .map(
      (m) => `
    <tr>
      <td class="date-cell">${formatBookedDate(m.bookedAt)}</td>
      <td>${escapeHtml(m.company || m.title) || "—"}</td>
      <td><span class="type-tag type-${escapeHtml(m.meetingType)}">${escapeHtml(meetingTypeShort(m.meetingType))}</span></td>
      <td>${escapeHtml(m.region) || "—"}</td>
      <td class="rule-cell">${formatRoutingRule(m)}</td>
      <td class="person-cell">${formatPerson(bdrPerson(m))}</td>
      <td class="person-cell">${formatPerson(aePerson(m))}</td>
      <td>${statusPill(m)}</td>
    </tr>
  `,
    )
    .join("");
  $("#emptyState").hidden = rows.length > 0;
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

function renderMeta(meetingsMeta) {
  const parts = [];
  const rowCount = data?.meetings?.length ?? data?.meta?.meetingRows;
  if (rowCount != null) {
    parts.push(`${Number(rowCount).toLocaleString()} meetings in file`);
  }
  const src = data?.meta?.source ?? meetingsMeta?.source;
  if (src === "chilipiper-export") {
    parts.push("Chili Piper export");
  } else if (src === "google-sheets") {
    parts.push("Google Sheet");
  } else if (src === "csv") {
    parts.push("CSV files");
  }
  if (data?.meta?.fetchedAt) {
    parts.push(`Updated ${new Date(data.meta.fetchedAt).toLocaleString()}`);
  }
  $("#metaLine").textContent = parts.join(" · ") || "Sales meetings";

  const sheetId = meetingsMeta?.spreadsheetId ?? data?.meta?.spreadsheetId;
  const link = $("#sheetLink");
  if (sheetId) {
    link.href = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    link.hidden = false;
  } else {
    link.hidden = true;
  }

  const hint = $("#setupHint");
  if (meetingsMeta?.lastError) {
    hint.hidden = false;
    hint.textContent = `Could not load meetings: ${meetingsMeta.lastError}. Set MEETINGS_SPREADSHEET_ID and tab GIDs in .env, or use sample CSVs.`;
  } else if (src === "csv") {
    hint.hidden = false;
    hint.textContent =
      "Using sample CSV data. Point MEETINGS_SPREADSHEET_ID at your live sheet (share: anyone with link can view) to go live.";
  } else if (src === "chilipiper-export") {
    hint.hidden = true;
  } else {
    hint.hidden = true;
  }
}

async function loadRoutingKpi() {
  if (data?.routingRules?.length) {
    $("#kpiRouting").textContent = String(data.routingRules.length);
    $("#kpiRoutingFoot").textContent = "From chilirules.json (static build)";
    return;
  }
  try {
    const res = await fetch("/api/routing");
    if (!res.ok) return;
    const routing = await res.json();
    const count =
      routing?.meta?.conciergeRuleCount ?? routing?.concierge?.rules?.length ?? "—";
    $("#kpiRouting").textContent = String(count);
    const src = routing?.meta?.source;
    $("#kpiRoutingFoot").textContent =
      src === "chilipiper-api" || src === "chilipiper-export"
        ? src === "chilipiper-export"
          ? "From chilirules.json"
          : "From Chili Piper API"
        : `Source: ${src ?? "routing"}`;
  } catch {
    /* optional */
  }
}

async function loadStaticMeetingsJson(refresh = false) {
  let cacheKey = refresh ? String(Date.now()) : "";
  try {
    const metaUrl = new URL("./site-meta.json", import.meta.url);
    const metaRes = await fetch(metaUrl, { cache: "no-store" });
    if (metaRes.ok) {
      const siteMeta = await metaRes.json();
      cacheKey = siteMeta.builtAt ?? cacheKey;
    }
  } catch {
    /* site-meta optional for older builds */
  }

  const dataUrl = new URL("./meetings-data.json", import.meta.url);
  if (cacheKey) dataUrl.searchParams.set("v", cacheKey);

  const res = await fetch(dataUrl, { cache: "no-store" });
  if (!res.ok) {
    $("#metaLine").textContent = "Failed to load meetings data";
    renderMeta({ lastError: `HTTP ${res.status}` });
    return null;
  }

  return res.json();
}

async function loadMeetings(refresh = false) {
  const q = refresh ? "?refresh=1" : "";
  let meetingsMeta = {};

  try {
    const [meetingsRes, metaRes] = await Promise.all([
      fetch(`/api/meetings${q}`, { cache: "no-store" }),
      fetch("/api/meetings/meta", { cache: "no-store" }),
    ]);
    meetingsMeta = metaRes.ok ? await metaRes.json() : {};
    if (meetingsRes.ok) {
      data = await meetingsRes.json();
      applyLoadedData(meetingsMeta);
      return;
    }
  } catch {
    /* no local server — use static JSON */
  }

  const payload = await loadStaticMeetingsJson(refresh);
  if (!payload) return;

  data = payload;
  meetingsMeta = { source: "chilipiper", staticSite: true };
  applyLoadedData(meetingsMeta);

  if (refresh && data?.staticSite) {
    $("#setupHint").hidden = false;
    $("#setupHint").textContent =
      "Static site — run ./scripts/deploy-gh-pages.sh after updating Meeting_new.csv.";
  }
}

function applyLoadedData(meetingsMeta) {
  filters.dateFrom = data?.filterOptions?.dateFrom ?? "";
  filters.dateTo = data?.filterOptions?.dateTo ?? "";
  filters.repKey = "";
  filters.routingRuleId = "";
  filters.region = "";
  filters.meetingType = "";

  populateFilterControls();
  renderAll();
  renderMeta(meetingsMeta);
}

function init() {
  $("#refreshBtn").addEventListener("click", () => loadMeetings(true));
  $("#excludeCanceled")?.addEventListener("change", renderAll);
  $("#clearFiltersBtn").addEventListener("click", clearFilters);

  for (const id of [
    "filterDateFrom",
    "filterDateTo",
    "filterRep",
    "filterRoutingRule",
    "filterRegion",
    "filterMeetingType",
  ]) {
    $(`#${id}`).addEventListener("change", (e) => {
      const key =
        id === "filterDateFrom"
          ? "dateFrom"
          : id === "filterDateTo"
            ? "dateTo"
            : id === "filterRep"
              ? "repKey"
              : id === "filterRegion"
                ? "region"
                : id === "filterMeetingType"
                  ? "meetingType"
                  : "routingRuleId";
      filters[key] = e.target.value;
      renderAll();
    });
  }

  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  }

  $("#chartGranularity").addEventListener("change", (e) => {
    chartGranularity = e.target.value;
    renderPeriodChart();
  });

  loadMeetings();
}

init();
