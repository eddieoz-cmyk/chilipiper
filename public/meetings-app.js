import {
  applyMeetingFilters as applyFilters,
  computeMeetingsReports,
} from "./meetings-report-logic.mjs";

const $ = (sel) => document.querySelector(sel);

let data = null;
let activeTab = "all";
const filters = {
  dateFrom: "",
  dateTo: "",
  dateField: "meetingAt",
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

function computeMeetingsMetrics(allMeetings) {
  function summarizeType(meetingType) {
    const rows = allMeetings.filter((m) => m.meetingType === meetingType);
    const total = rows.length;
    const bookedLive = rows.filter((m) => m.bookedLive).length;
    const happened = rows.filter((m) => m.happened).length;
    const handoffToAe = rows.filter((m) => m.handoffToAe).length;
    return {
      meetingType,
      total,
      booked: rows.filter((m) => m.booked || m.bookedLive).length,
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

  const concierge = summarizeType("concierge");
  const handoff = summarizeType("handoff");
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

function applyMeetingFilters(meetings) {
  return applyFilters(meetings, filters);
}

function getFilteredMeetings() {
  let rows = applyMeetingFilters(data?.meetings ?? []);
  if (activeTab === "concierge" || activeTab === "handoff") {
    rows = rows.filter((m) => m.meetingType === activeTab);
  }
  if ($("#onlyHeld").checked) {
    rows = rows.filter((m) => m.happened);
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
  const funnelNote = $("#funnelFilterNote");

  if (!filtersActive() && filtered === total) {
    el.hidden = true;
    clearBtn.hidden = true;
    funnelNote.hidden = true;
    return;
  }

  el.hidden = false;
  clearBtn.hidden = false;
  funnelNote.hidden = !data?.funnel?.conciergeLog;

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
  if (filters.meetingType) parts.push(`type: ${filters.meetingType}`);
  if (filters.dateFrom || filters.dateTo) {
    parts.push(`dates: ${filters.dateFrom || "…"} → ${filters.dateTo || "…"}`);
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
  $("#filterDateField").value = filters.dateField;

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
  filters.dateField = "meetingAt";
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
  const dateLabel = filters.dateField === "bookedAt" ? "booked date" : "meeting date";
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
  const person = m.assignedUser ?? m.hostUser;
  if (person?.id) return `id:${person.id}`;
  if (person?.email) return `email:${person.email}`;
  if (m.ae) return `email:${m.ae}`;
  return "unknown";
}

function repDisplayForMeeting(m) {
  const person = m.assignedUser ?? m.hostUser;
  return {
    name: person?.name ?? "Unknown",
  };
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

  const rows = applyMeetingFilters(data?.meetings ?? []);
  section.hidden = false;
  $("#ruleAssigneeHeading").textContent = "Meetings by rep";
  $("#ruleAssigneeSubtitle").textContent = rule?.name
    ? `${rows.length.toLocaleString()} meetings (Meeting_new.csv) on rule: ${rule.name}.`
    : `${rows.length.toLocaleString()} calendar meetings for selected rule`;

  const byRep = new Map();
  for (const m of rows) {
    const key = repKeyForMeeting(m);
    if (!byRep.has(key)) {
      const rep = repDisplayForMeeting(m);
      byRep.set(key, {
        name: rep.name,
        total: 0,
        concierge: 0,
        chilical: 0,
        handoff: 0,
        held: 0,
      });
    }
    const r = byRep.get(key);
    r.total++;
    if (m.happened) r.held++;
    if (m.meetingType === "concierge") r.concierge++;
    else if (m.meetingType === "handoff") r.handoff++;
    else if (m.meetingType === "chilical") r.chilical++;
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
      <td class="num">${r.held}</td>
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
  $("#liveReportSubtitle").textContent = `${live.total.toLocaleString()} live Concierge bookings in filtered period`;
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
    { key: "happened", label: "Happened", cls: "success" },
    { key: "canceled", label: "Canceled", cls: "danger" },
    { key: "rescheduled", label: "Rescheduled", cls: "warning" },
    { key: "noshow", label: "No-show", cls: "muted" },
    { key: "scheduled", label: "Scheduled / other", cls: "other" },
  ];

  $("#outcomeBars").innerHTML = items
    .filter((i) => counts[i.key] > 0 || i.key === "happened" || i.key === "canceled")
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
  $("#handoffsReportSubtitle").textContent = `${h.total.toLocaleString()} handoffs · ${h.happened.toLocaleString()} held · ${h.canceled.toLocaleString()} canceled`;
  $("#badgeHandoffs").textContent = String(h.total);

  $("#handoffSummary").innerHTML = `
    <span>Total <strong>${h.total}</strong></span>
    <span>Held <strong>${h.happened}</strong></span>
    <span>Canceled <strong>${h.canceled}</strong></span>
    <span>BDR→AE pairs <strong>${h.byPair.length}</strong></span>`;

  $("#handoffPairsBody").innerHTML = h.byPair
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.bdrName)}</td>
      <td>${escapeHtml(p.aeName)}</td>
      <td class="num">${p.total}</td>
      <td class="num">${p.happened}</td>
      <td class="num">${p.canceled}</td>
      <td class="num">${p.fromRouter}</td>
      <td class="num">${p.fromOwnership}</td>
      <td class="num">${p.unlinked}</td>
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
}

function renderKpis() {
  const m = getMetricsForView();
  const linkage = data?.linkage;
  const filtered = filtersActive();

  $("#kpiCalendarTotal").textContent = String(m.total);
  $("#kpiConciergeCalendar").textContent = String(m.byType.concierge.total);
  $("#kpiHappened").textContent = String(m.happened);
  $("#kpiHandoff").textContent = String(m.byType.handoff.total);

  const filteredRows = applyMeetingFilters(data?.meetings ?? []);
  const canceled = filteredRows.filter((r) => r.canceled || r.outcome === "canceled").length;
  $("#kpiCanceled").textContent = String(canceled);
  $("#kpiCanceledFoot").textContent = filtered
    ? `${formatRate(pct(canceled, m.total))} of filtered calendar`
    : "MEETING_STATUS / EXTENDED = Canceled";

  if (filtered) {
    $("#kpiCalendarFoot").textContent = "Filtered rows from Meeting_new.csv";
    $("#kpiConciergeCalendarFoot").textContent = `${m.byType.concierge.total} of ${m.total} filtered calendar`;
  } else if (linkage) {
    $("#kpiCalendarFoot").textContent = `${linkage.websiteSessionsScheduled.toLocaleString()} Concierge scheduled (Meeting_new.csv)`;
    $("#kpiConciergeCalendarFoot").textContent = `${linkage.calendarWithWebsiteLog.toLocaleString()} also in website log`;
  } else {
    $("#kpiCalendarFoot").textContent = "All rows in Meeting_new.csv";
    $("#kpiConciergeCalendarFoot").textContent = "MEETING_SOURCE_TYPE = Concierge";
  }

  $("#kpiHappenedFoot").textContent = filtered
    ? `${formatRate(m.rates.happenedOfBookedLive)} of filtered Concierge on calendar`
    : "Not canceled / no-show (Meeting_new.csv)";
  $("#kpiHandoffFoot").textContent = filtered
    ? `${formatRate(m.byType.handoff.rates.handoffOfTotal)} of filtered calendar`
    : "BDR handoff bookings in Meeting_new.csv";

  $("#badgeAll").textContent = String(m.total);
  $("#badgeConcierge").textContent = String(m.byType.concierge.total);
  $("#badgeHandoff").textContent = String(m.byType.handoff.total);

  const reports = computeMeetingsReports(filteredRows, filters.dateField);
  $("#badgeLive").textContent = String(reports.liveBooked.total);
  $("#badgeBdr").textContent = String(reports.ruleBdrDistribution.length);
  $("#badgeOutcomes").textContent = String(reports.outcomes.total);
  $("#badgeHandoffs").textContent = String(reports.handoffs.total);
}

function renderFunnel() {
  const funnel = data?.funnel?.conciergeLog;
  const section = $("#funnelSection");
  if (!funnel) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  $("#funnelYear").textContent = String(funnel.year ?? data?.meta?.year ?? "");

  const users = data?.users;
  const usersBlock = users
    ? `<div class="breakdown-card">
        <h3>Users export</h3>
        <dl class="breakdown-stats">
          <div><dt>Total users</dt><dd>${users.total}</dd></div>
          <div><dt>Active</dt><dd>${users.active}</dd></div>
          <div><dt>Concierge Live license</dt><dd>${users.withConciergeLive}</dd></div>
          <div><dt>Handoff license</dt><dd>${users.withHandoff}</dd></div>
        </dl>
      </div>`
    : "";

  $("#funnelGrid").innerHTML = `
    <article class="breakdown-card">
      <h3>Concierge sessions</h3>
      <dl class="breakdown-stats">
        <div><dt>Triggered</dt><dd>${funnel.total.toLocaleString()}</dd></div>
        <div><dt>Meeting offered</dt><dd>${funnel.meetingOffered.toLocaleString()}</dd></div>
        <div><dt>Scheduled (booked)</dt><dd>${funnel.scheduled.toLocaleString()}</dd></div>
        <div><dt>Timed out</dt><dd>${(funnel.timedOut ?? 0).toLocaleString()}</dd></div>
        <div><dt>Disqualified</dt><dd>${(funnel.disqualified ?? 0).toLocaleString()}</dd></div>
        <div><dt>Cancelled</dt><dd>${(funnel.cancelled ?? 0).toLocaleString()}</dd></div>
      </dl>
    </article>
    ${usersBlock}
  `;
}

function renderBreakdown() {
  const m = getMetricsForView();
  const grid = $("#breakdownGrid");
  const types = [
    { key: "concierge", title: "Concierge meetings" },
    { key: "handoff", title: "BDR handoff meetings" },
  ];

  grid.innerHTML = types
    .map(({ key, title }) => {
      const s = m.byType[key];
      if (!s) return "";
      return `
        <article class="breakdown-card">
          <h3>${escapeHtml(title)}</h3>
          <dl class="breakdown-stats">
            <div><dt>Total rows</dt><dd>${s.total}</dd></div>
            <div><dt>Booked live</dt><dd>${s.bookedLive}</dd></div>
            <div><dt>Held</dt><dd>${s.happened}</dd></div>
            <div><dt>BDR → AE</dt><dd>${s.handoffToAe}</dd></div>
            <div><dt>Held / live</dt><dd>${formatRate(s.rates.happenedOfBookedLive)}</dd></div>
            <div><dt>Handoff / held</dt><dd>${formatRate(s.rates.handoffOfHappened)}</dd></div>
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

function pill(yes) {
  const cls = yes ? "yes" : "no";
  const label = yes ? "Yes" : "—";
  return `<span class="pill ${cls}">${label}</span>`;
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

function renderTable() {
  const rows = filteredMeetingsForTable();
  const tbody = $("#meetingsBody");
  tbody.innerHTML = rows
    .map(
      (m) => `
    <tr>
      <td><span class="type-tag">${escapeHtml(m.meetingType)}</span>${m.fromWebsiteConcierge ? '<span class="site-tag" title="Concierge booking from Meeting_new.csv">site</span>' : ""}</td>
      <td>${escapeHtml(m.company || m.title) || "—"}</td>
      <td>${escapeHtml(m.region) || escapeHtml(m.country) || "—"}</td>
      <td class="rule-cell">${formatRoutingRule(m)}</td>
      <td class="rule-cell" title="${escapeHtml(m.priorRoutingRuleName)}">${escapeHtml(m.priorRoutingRuleName || m.routingRuleName) || "—"}</td>
      <td>${m.meetingType === "handoff" ? formatRouteOrigin(m.handoffRouteOrigin) : "—"}</td>
      <td class="person-cell">${formatPerson(m.assignedUser)}</td>
      <td>${escapeHtml(m.outcome ?? m.status) || "—"}</td>
      <td>${pill(m.bookedLive)}</td>
      <td>${pill(m.happened)}</td>
      <td>${pill(m.handoffToAe)}</td>
      <td class="person-cell">${formatPerson(m.bookerUser)}</td>
      <td class="person-cell">${formatPerson(m.hostUser)}</td>
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
  const src = data?.meta?.source ?? meetingsMeta?.source;
  if (src === "chilipiper-export") {
    parts.push(`Chili Piper exports (${data?.meta?.year ?? ""})`);
  } else if (src === "google-sheets") {
    parts.push("Google Sheet");
  } else if (src === "csv") {
    parts.push("CSV files");
  }
  if (data?.meta?.fetchedAt) {
    parts.push(`Updated ${new Date(data.meta.fetchedAt).toLocaleString()}`);
  }
  $("#metaLine").textContent = parts.join(" · ") || "Meetings funnel";

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
    hint.hidden = false;
    hint.textContent = `Loaded from ${data?.meta?.dataDir ?? "chilipiper folder"}. Refresh exports in that folder and click Refresh.`;
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

async function loadMeetings(refresh = false) {
  const q = refresh ? "?refresh=1" : "";
  let meetingsMeta = {};

  try {
    const [meetingsRes, metaRes] = await Promise.all([
      fetch(`/api/meetings${q}`),
      fetch("/api/meetings/meta"),
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

  const dataUrl = new URL("./meetings-data.json", import.meta.url);
  if (refresh) dataUrl.searchParams.set("t", String(Date.now()));
  const res = await fetch(dataUrl);
  if (!res.ok) {
    $("#metaLine").textContent = "Failed to load meetings data";
    renderMeta({ lastError: `HTTP ${res.status}` });
    return;
  }

  data = await res.json();
  meetingsMeta = { source: "chilipiper", staticSite: true };
  applyLoadedData(meetingsMeta);

  if (refresh && data?.staticSite) {
    $("#setupHint").hidden = false;
    $("#setupHint").textContent =
      "Static site — push new exports to GitHub to rebuild (Actions → Deploy GitHub Pages).";
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
  renderFunnel();
  renderAll();
  renderMeta(meetingsMeta);
  loadRoutingKpi();
}

function init() {
  $("#refreshBtn").addEventListener("click", () => loadMeetings(true));
  $("#onlyHeld").addEventListener("change", renderAll);
  $("#clearFiltersBtn").addEventListener("click", clearFilters);

  for (const id of [
    "filterDateFrom",
    "filterDateTo",
    "filterDateField",
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
            : id === "filterDateField"
              ? "dateField"
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
