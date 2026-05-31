const mqlListEl = document.getElementById("mqlList");
const searchEl = document.getElementById("search");
const detailContentEl = document.getElementById("detailContent");
const detailPlaceholderEl = document.getElementById("detailPlaceholder");
const detailEmailEl = document.getElementById("detailEmail");
const detailMqlDateEl = document.getElementById("detailMqlDate");
const detailReturnSummaryEl = document.getElementById("detailReturnSummary");
const detailMetaGridEl = document.getElementById("detailMetaGrid");
const timelineEl = document.getElementById("timeline");
const headerStatsEl = document.getElementById("headerStats");
const statMqlsEl = document.getElementById("statMqls");
const statReturnsEl = document.getElementById("statReturns");
const topPagesListEl = document.getElementById("topPagesList");
const leadStatusListEl = document.getElementById("leadStatusList");
const combinedScoreListEl = document.getElementById("combinedScoreList");
const segmentListEl = document.getElementById("segmentList");
const ownerListEl = document.getElementById("ownerList");
const outreachListEl = document.getElementById("outreachList");
const assumptionsListEl = document.getElementById("assumptionsList");
const outreachSummaryEl = document.getElementById("outreachSummary");
const outreachFilterAllEl = document.getElementById("outreachFilterAll");
const pageFilterBannerEl = document.getElementById("pageFilterBanner");
const pageFilterLabelEl = document.getElementById("pageFilterLabel");
const pageFilterClearEl = document.getElementById("pageFilterClear");

let mqls = [];
let selectedId = null;
let topPages = [];
let breakdowns = {
  leadStatus: [],
  combinedScore: [],
  segment: [],
  owner: [],
};
let outreachData = {
  immediate: [],
  mqlIds: [],
  assumptions: [],
  counts: { immediate: 0, soon: 0, totalMqls: 0 },
  threshold: 55,
};

/** @type {{ kind: string, key: string, label: string, mqlIds: Set<string> } | null} */
let listFilter = null;

const META_FIELDS = [
  { key: "leadStatus", label: "Lead status" },
  { key: "lastCombinedScore", label: "Combined score" },
  { key: "mainSegment", label: "Segment" },
  { key: "mainOwnerName", label: "Owner" },
];

function formatDate(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatDateShort(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(iso),
  );
}

function displayMeta(value) {
  const v = value == null ? "" : String(value).trim();
  return v || "—";
}

function isNurtureStatus(status) {
  return (status || "").trim().toLowerCase() === "nurture";
}

async function fetchMqls() {
  const res = await fetch("/api/mqls");
  if (!res.ok) throw new Error("Failed to load MQLs");
  return res.json();
}

async function fetchJourney(id) {
  const res = await fetch(`/api/mqls/${encodeURIComponent(id)}/journey`);
  if (!res.ok) throw new Error("Failed to load journey");
  return res.json();
}

async function fetchTopPages() {
  const res = await fetch("/api/top-pages?limit=12");
  if (!res.ok) throw new Error("Failed to load top pages");
  return res.json();
}

async function fetchBreakdowns() {
  const res = await fetch("/api/breakdowns?limit=12");
  if (!res.ok) throw new Error("Failed to load breakdowns");
  return res.json();
}

async function fetchOutreachPriority() {
  const res = await fetch("/api/outreach-priority?limit=25");
  if (!res.ok) throw new Error("Failed to load outreach priority");
  return res.json();
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function setListFilter(kind, key, bannerText, mqlIds) {
  listFilter = { kind, key, label: bannerText, mqlIds: new Set(mqlIds) };
  searchEl.value = "";
  pageFilterLabelEl.textContent = bannerText;
  pageFilterBannerEl.hidden = false;
  renderAllInsights();
  renderList();
  if (mqlIds.length > 0) {
    selectMql(mqlIds[0]);
  } else {
    selectedId = null;
    detailContentEl.hidden = true;
    detailPlaceholderEl.hidden = false;
    mqlListEl.innerHTML =
      `<li class="mql-list-empty-filter">No MQLs match this filter.</li>`;
  }
}

function showDetailPanel(show) {
  detailContentEl.hidden = !show;
  detailPlaceholderEl.hidden = show;
}

function clearListFilter() {
  listFilter = null;
  pageFilterBannerEl.hidden = true;
  renderAllInsights();
  renderList();
}

function isFilterActive(kind, key) {
  return listFilter?.kind === kind && listFilter?.key === key;
}

function renderMetaGrid(mql) {
  const fields = [...META_FIELDS];
  if (isNurtureStatus(mql?.leadStatus)) {
    fields.push({ key: "nurtureReason", label: "Nurture reason" });
  }
  detailMetaGridEl.innerHTML = fields
    .map(
      (f) => `
    <div>
      <dt>${f.label}</dt>
      <dd>${escapeHtml(displayMeta(mql?.[f.key]))}</dd>
    </div>`,
    )
    .join("");
}

function renderBreakdownList(container, items, kind, options = {}) {
  const { sublabel = "" } = options;
  if (!items.length) {
    container.innerHTML = `<li class="loading">No data</li>`;
    return;
  }
  const max = items[0].count;
  container.innerHTML = items
    .map((item, i) => {
      const active = isFilterActive(kind, item.label) ? " is-filter-active" : "";
      const pct = max > 0 ? Math.round((item.count / max) * 100) : 0;
      const sub = sublabel ? `<span class="insight-item-sub">${escapeHtml(sublabel)}</span>` : "";
      return `
        <li class="insight-item${active}" data-kind="${escapeHtml(kind)}" data-key="${escapeHtml(item.label)}">
          <span class="top-page-rank">${i + 1}</span>
          <div class="top-page-info">
            <span class="insight-item-label">${escapeHtml(item.label)}</span>
            ${sub}
          </div>
          <div class="top-page-stats">
            <button type="button" class="top-page-stat-btn" title="Show these MQLs">
              ${item.count} MQL${item.count === 1 ? "" : "s"}
            </button>
          </div>
          <div class="top-page-bar-wrap" aria-hidden="true">
            <div class="top-page-bar" style="width: ${pct}%"></div>
          </div>
        </li>`;
    })
    .join("");

  container.querySelectorAll(".top-page-stat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const el = btn.closest(".insight-item");
      const kindAttr = el?.dataset.kind;
      const key = el?.dataset.key;
      const row = items.find((x) => x.label === key);
      if (row && kindAttr) {
        setListFilter(
          kindAttr,
          key,
          `${row.count} MQL${row.count === 1 ? "" : "s"} · ${key}`,
          row.mqlIds ?? [],
        );
      }
    });
  });
}

function renderTopPages() {
  if (!topPages.length) {
    topPagesListEl.innerHTML = `<li class="loading">No page views yet</li>`;
    return;
  }
  const maxViews = topPages[0].views;
  topPagesListEl.innerHTML = topPages
    .map((p, i) => {
      const pct = maxViews > 0 ? Math.round((p.views / maxViews) * 100) : 0;
      const active = isFilterActive("page", p.path) ? " is-filter-active" : "";
      return `
        <li class="insight-item top-page-item${active}" data-path="${escapeHtml(p.path)}">
          <span class="top-page-rank">${i + 1}</span>
          <div class="top-page-info">
            <span class="top-page-path">${escapeHtml(p.path)}</span>
            <span class="top-page-title">${escapeHtml(p.title)}</span>
          </div>
          <div class="top-page-stats">
            <button type="button" class="top-page-stat-btn" title="Show MQLs who viewed this page">
              <strong>${p.views}</strong> views
            </button>
            ·
            <button type="button" class="top-page-stat-btn" title="Show MQLs who visited this page">
              ${p.uniqueMqls} MQL${p.uniqueMqls === 1 ? "" : "s"}
            </button>
          </div>
          <div class="top-page-bar-wrap" aria-hidden="true">
            <div class="top-page-bar" style="width: ${pct}%"></div>
          </div>
        </li>`;
    })
    .join("");

  topPagesListEl.querySelectorAll(".top-page-stat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const path = btn.closest(".insight-item")?.dataset.path;
      const page = topPages.find((p) => p.path === path);
      if (page) {
        setListFilter(
          "page",
          path,
          `${page.uniqueMqls} MQL${page.uniqueMqls === 1 ? "" : "s"} visited ${path}`,
          page.mqlIds ?? [],
        );
      }
    });
  });
}

function renderOutreachPanel() {
  const { immediate, assumptions, counts, threshold } = outreachData;
  assumptionsListEl.innerHTML = (assumptions || [])
    .map((a) => `<li>${escapeHtml(a)}</li>`)
    .join("");
  const shown = immediate.length;
  outreachSummaryEl.textContent =
    counts.immediate > shown
      ? `${counts.immediate} need immediate outreach (top ${shown} below, score ≥ ${threshold})`
      : `${counts.immediate} need immediate outreach (score ≥ ${threshold})`;
  outreachFilterAllEl.hidden = counts.immediate === 0;
  outreachFilterAllEl.textContent = `Show all ${counts.immediate} in list`;

  if (!immediate.length) {
    outreachListEl.innerHTML =
      `<li class="mql-list-empty-filter">No MQLs meet immediate criteria right now.</li>`;
    return;
  }

  const queueActive = isFilterActive("outreach", "queue");
  outreachListEl.innerHTML = immediate
    .map((lead) => {
      const selected = selectedId === lead.id;
      const reasons = (lead.reasons ?? [])
        .map((r) => `<li>${escapeHtml(r)}</li>`)
        .join("");
      return `
        <li>
          <button
            type="button"
            class="outreach-item${selected ? " is-selected" : ""}${queueActive ? " is-filter-active" : ""}"
            data-id="${escapeHtml(lead.id)}"
          >
            <span class="outreach-item-header">
              <span class="outreach-email">${escapeHtml(lead.email)}</span>
              <span class="outreach-score">${lead.priorityScore} pts</span>
            </span>
            <ul class="outreach-reasons">${reasons}</ul>
          </button>
        </li>`;
    })
    .join("");

  outreachListEl.querySelectorAll(".outreach-item").forEach((btn) => {
    btn.addEventListener("click", () => selectMql(btn.dataset.id));
  });
}

function renderAllInsights() {
  renderTopPages();
  renderOutreachPanel();
  renderBreakdownList(leadStatusListEl, breakdowns.leadStatus, "leadStatus");
  renderBreakdownList(
    combinedScoreListEl,
    breakdowns.combinedScore,
    "combinedScore",
    { sublabel: "Last combined score" },
  );
  renderBreakdownList(segmentListEl, breakdowns.segment, "segment", {
    sublabel: "Main segment",
  });
  renderBreakdownList(ownerListEl, breakdowns.owner, "owner", {
    sublabel: "Main owner",
  });
}

function getFilteredMqls() {
  let list = mqls;
  if (listFilter) {
    list = list.filter((m) => listFilter.mqlIds.has(m.id));
  }
  const q = searchEl.value.trim().toLowerCase();
  if (q) {
    list = list.filter((m) => m.email.toLowerCase().includes(q));
  }
  return list;
}

function renderList() {
  const filtered = getFilteredMqls();

  if (filtered.length === 0) {
    mqlListEl.innerHTML = listFilter
      ? `<li class="mql-list-empty-filter">No MQLs match this filter.</li>`
      : `<li class="mql-list-empty-filter">No MQLs match your search.</li>`;
    return;
  }

  mqlListEl.innerHTML = filtered
    .map((m) => {
      const badge =
        m.returnVisitCount === 0
          ? `<span class="badge badge-none">No returns</span>`
          : `<span class="badge badge-active">${m.returnVisitCount} return${m.returnVisitCount === 1 ? "" : "s"}</span>`;
      return `
        <li>
          <button
            type="button"
            class="mql-item"
            role="option"
            aria-selected="${m.id === selectedId}"
            data-id="${m.id}"
          >
            <span class="mql-item-email">${escapeHtml(m.email)}</span>
            <span class="mql-item-meta">
              MQL <strong>${formatDateShort(m.mqlDate)}</strong>
              ${badge}
            </span>
            <span class="mql-item-extra">
              ${escapeHtml(displayMeta(m.leadStatus))} · ${escapeHtml(displayMeta(m.lastCombinedScore))}
            </span>
            <span class="mql-item-extra">
              ${escapeHtml(displayMeta(m.mainSegment))} · ${escapeHtml(displayMeta(m.mainOwnerName))}
            </span>
            ${
              isNurtureStatus(m.leadStatus)
                ? `<span class="mql-item-extra mql-item-nurture">Nurture: ${escapeHtml(displayMeta(m.nurtureReason))}</span>`
                : ""
            }
          </button>
        </li>`;
    })
    .join("");

  mqlListEl.querySelectorAll(".mql-item").forEach((btn) => {
    btn.addEventListener("click", () => selectMql(btn.dataset.id));
  });
}

async function selectMql(id) {
  selectedId = id;
  renderList();
  renderOutreachPanel();

  showDetailPanel(true);

  const summary = mqls.find((m) => m.id === id);
  detailEmailEl.textContent = summary?.email ?? id;
  detailMqlDateEl.textContent = formatDate(summary?.mqlDate);
  renderMetaGrid(summary);
  timelineEl.innerHTML = `<p class="loading">Loading journey…</p>`;

  try {
    const journey = await fetchJourney(id);
    const visits = journey.visits ?? [];
    const filterNote = listFilter ? ` · ${listFilter.label}` : "";
    detailReturnSummaryEl.textContent =
      visits.length === 0
        ? "No return visits yet"
        : `${visits.length} return visit${visits.length === 1 ? "" : "s"} · last ${formatDate(summary?.lastReturn)}${filterNote}`;

    if (visits.length === 0) {
      timelineEl.innerHTML =
        `<p class="timeline-empty">This lead became an MQL on ${formatDate(journey.mqlDate)} but has not returned to the site yet.</p>`;
      return;
    }

    const highlightPath =
      listFilter?.kind === "page" ? listFilter.key : null;

    timelineEl.innerHTML = visits
      .map((visit, i) => {
        const pages = (visit.pages ?? [])
          .map((p) => {
            const hit = highlightPath && p.path === highlightPath;
            return `
            <li class="page-row${hit ? " page-row-highlight" : ""}">
              <span class="page-path">${escapeHtml(p.path)}</span>
              <span class="page-title">${escapeHtml(p.title ?? "")}</span>
              <span class="page-time">${formatDate(p.viewedAt)}</span>
            </li>`;
          })
          .join("");
        const matchNote = visit.matchType
          ? `<span class="visit-match">${escapeHtml(visit.matchType.replace(/_/g, " "))}</span>`
          : "";
        return `
          <article class="visit">
            <span class="visit-dot" aria-hidden="true"></span>
            <div class="visit-header">
              <span class="visit-label">Return visit ${i + 1}</span>
              <time class="visit-time" datetime="${visit.returnedAt}">${formatDate(visit.returnedAt)}</time>
              ${matchNote}
            </div>
            <ul class="pages">${pages}</ul>
          </article>`;
      })
      .join("");
  } catch (err) {
    timelineEl.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

function updateStats() {
  const totalReturns = mqls.reduce((n, m) => n + (m.returnVisitCount ?? 0), 0);
  statMqlsEl.textContent = String(mqls.length);
  statReturnsEl.textContent = String(totalReturns);
  headerStatsEl.hidden = false;
}

const insightLists = [
  topPagesListEl,
  outreachListEl,
  leadStatusListEl,
  combinedScoreListEl,
  segmentListEl,
  ownerListEl,
];

async function init() {
  mqlListEl.innerHTML = `<li class="loading">Loading…</li>`;
  for (const el of insightLists) {
    el.innerHTML = `<li class="loading">Loading…</li>`;
  }
  try {
    const [mqlData, topPagesData, breakdownData, outreach] = await Promise.all([
      fetchMqls(),
      fetchTopPages(),
      fetchBreakdowns(),
      fetchOutreachPriority(),
    ]);
    mqls = mqlData;
    topPages = topPagesData;
    breakdowns = breakdownData;
    outreachData = outreach;
    mqls.sort(
      (a, b) =>
        (b.returnVisitCount ?? 0) - (a.returnVisitCount ?? 0) ||
        new Date(b.mqlDate) - new Date(a.mqlDate),
    );
    updateStats();
    renderAllInsights();
    renderList();
    if (mqls.length > 0) await selectMql(mqls[0].id);
  } catch (err) {
    mqlListEl.innerHTML = `<li class="error">${escapeHtml(err.message)}</li>`;
    for (const el of insightLists) {
      el.innerHTML = `<li class="error">${escapeHtml(err.message)}</li>`;
    }
  }
}

searchEl.addEventListener("input", () => renderList());
pageFilterClearEl.addEventListener("click", clearListFilter);
outreachFilterAllEl.addEventListener("click", () => {
  setListFilter(
    "outreach",
    "queue",
    `${outreachData.counts.immediate} MQLs — immediate outreach`,
    outreachData.mqlIds,
  );
});

init();
