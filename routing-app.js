const $ = (sel) => document.querySelector(sel);

let data = null;
let gapsData = null;
let activeTab = "concierge";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusClass(status) {
  if (!status) return "";
  const s = status.toLowerCase();
  if (s.includes("live")) return "pill pill-live";
  if (s.includes("old")) return "pill pill-old";
  return "pill";
}

function matchesRegion(value, region) {
  return value === region;
}

function conciergeRegion(r, region) {
  return matchesRegion(r.section, region) || matchesRegion(r.region, region);
}

function bdrList(p) {
  return [p.bdr, p.bdr1, p.bdr2].filter(Boolean).join(", ") || "—";
}

function repList(p) {
  return [p.salesRep1, p.salesRep2].filter(Boolean).join(", ") || "—";
}

function renderConcierge() {
  const region = $("#regionFilter").value;
  const status = $("#statusFilter").value;
  const rules = data?.concierge?.rules ?? [];
  const filtered = rules.filter((r) => {
    if (region && !conciergeRegion(r, region)) return false;
    if (status && r.ruleStatus !== status) return false;
    return true;
  });

  const tbody = $("#conciergeBody");
  tbody.innerHTML = filtered
    .map(
      (r) => `
    <tr>
      <td class="col-name">
        <strong>${escapeHtml(r.name)}</strong>
        ${r.notes ? `<span class="row-note">${escapeHtml(r.notes)}</span>` : ""}
        ${r.moduleNotes ? `<span class="row-note">${escapeHtml(r.moduleNotes)}</span>` : ""}
      </td>
      <td>${r.ruleStatus ? `<span class="${statusClass(r.ruleStatus)}">${escapeHtml(r.ruleStatus)}</span>` : "—"}</td>
      <td>${escapeHtml(r.region || r.section)}</td>
      <td>${escapeHtml(r.state) || "—"}</td>
      <td>${escapeHtml(r.size) || "—"}</td>
      <td>${escapeHtml(r.segment) || "—"}</td>
      <td class="col-team">${escapeHtml(r.teamMembers) || "—"}</td>
      <td class="col-num">${escapeHtml(r.repCount) || "—"}</td>
      <td class="col-countries">${escapeHtml(r.countries) || "—"}</td>
    </tr>`,
    )
    .join("");

  $("#conciergeEmpty").hidden = filtered.length > 0;
  $("#badgeConcierge").textContent = String(rules.length);
}

function renderGaps() {
  const region = $("#regionFilter").value;
  const gaps = gapsData ?? data?.coverageGaps;
  const gap = gaps?.byRegion?.[region];
  const countries = gap?.uncoveredCountries ?? [];
  const states = gap?.uncoveredStates ?? [];

  const worldTotal = gaps?.summary?.worldCountryCount ?? "—";
  if (!gaps) {
    $("#gapsMeta").textContent =
      "Could not load coverage gaps. Hard-refresh the page or restart the server.";
  } else if (!gap) {
    $("#gapsMeta").textContent = `No gap data for region “${region}”.`;
  } else {
    $("#gapsMeta").textContent = `${gap.assignedCountryCount ?? 0} of ${worldTotal} world countries assigned in ${region} rules · ${gap.assignedUsStateCount ?? 0} US states recognized`;
  }

  const statesTitle = gap?.subdivisionLabel
    ? `${gap.subdivisionLabel} not in rules`
    : "States / provinces not in rules";
  $("#gapsStatesTitle").textContent = statesTitle;
  $("#gapsStatesCard").hidden = region !== "US" && region !== "Canada";

  $("#gapsCountryCount").textContent = String(countries.length);
  $("#gapsStateCount").textContent = String(states.length);
  const gapTotal =
    countries.length + (region === "US" || region === "Canada" ? states.length : 0);
  $("#badgeGaps").textContent = String(gapTotal);

  const countryList = $("#gapsCountries");
  countryList.innerHTML = countries
    .map((c) => `<li class="gaps-chip">${escapeHtml(c)}</li>`)
    .join("");
  $("#gapsCountriesEmpty").hidden = countries.length > 0;
  countryList.hidden = countries.length === 0;

  const stateList = $("#gapsStates");
  stateList.innerHTML = states
    .map((s) => `<li class="gaps-chip">${escapeHtml(s)}</li>`)
    .join("");
  $("#gapsStatesEmpty").hidden = states.length > 0;
  stateList.hidden = states.length === 0;
}

function renderOffline() {
  const region = $("#regionFilter").value;
  const pods = data?.offline?.pods ?? [];
  const filtered = pods.filter((p) => {
    if (region && p.region !== region) return false;
    return true;
  });

  const tbody = $("#offlineBody");
  tbody.innerHTML = filtered
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.region)}</td>
      <td>${escapeHtml(p.focusArea) || "—"}</td>
      <td>${escapeHtml(p.mapping) || "—"}</td>
      <td><span class="segment-tag">${escapeHtml(p.segment) || "—"}</span></td>
      <td class="col-name"><strong>${escapeHtml(p.podName) || "—"}</strong></td>
      <td>${escapeHtml(p.chiliPiperRule) || "—"}</td>
      <td>${escapeHtml(p.segmentRules) || "—"}</td>
      <td class="col-team">${escapeHtml(bdrList(p))}</td>
      <td class="col-team">${escapeHtml(repList(p))}</td>
      <td>${escapeHtml(p.statusNote) || "—"}</td>
    </tr>`,
    )
    .join("");

  $("#offlineEmpty").hidden = filtered.length > 0;
  $("#badgeOffline").textContent = String(pods.length);
}

function fillRegionOptions({ preserve = false } = {}) {
  const select = $("#regionFilter");
  const previous = preserve ? select.value : "";
  const gaps = gapsData ?? data?.coverageGaps;
  const regions =
    activeTab === "offline"
      ? data?.offline?.regions ?? []
      : activeTab === "gaps"
        ? Object.keys(gaps?.byRegion ?? {}).sort()
        : data?.concierge?.regions ?? [];

  if (regions.length === 0) {
    select.innerHTML = '<option value="">No regions</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = regions
    .map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`)
    .join("");

  if (preserve && regions.includes(previous)) {
    select.value = previous;
  } else {
    select.value = regions[0];
  }
}

function fillStatusOptions() {
  const select = $("#statusFilter");
  const statuses = [
    ...new Set((data?.concierge?.rules ?? []).map((r) => r.ruleStatus).filter(Boolean)),
  ].sort();
  const current = select.value;
  select.innerHTML =
    '<option value="">All statuses</option>' +
    statuses.map((s) => `<option>${escapeHtml(s)}</option>`).join("");
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

function setTab(tab) {
  activeTab = tab;
  const isConcierge = tab === "concierge";
  const isOffline = tab === "offline";
  const isGaps = tab === "gaps";

  $("#tabConcierge").classList.toggle("active", isConcierge);
  $("#tabConcierge").setAttribute("aria-selected", String(isConcierge));
  $("#tabOffline").classList.toggle("active", isOffline);
  $("#tabOffline").setAttribute("aria-selected", String(isOffline));
  $("#tabGaps").classList.toggle("active", isGaps);
  $("#tabGaps").setAttribute("aria-selected", String(isGaps));

  $("#panelConcierge").hidden = !isConcierge;
  $("#panelOffline").hidden = !isOffline;
  $("#panelGaps").hidden = !isGaps;
  $("#statusFilterWrap").hidden = !isConcierge;

  fillRegionOptions({ preserve: true });
  if (isConcierge) renderConcierge();
  else if (isOffline) renderOffline();
  else renderGaps();
}

function updateMeta(meta) {
  const parts = [];
  if (meta?.conciergeRuleCount != null) {
    parts.push(`${meta.conciergeRuleCount} Concierge rules`);
  }
  if (meta?.offlinePodCount != null) {
    parts.push(`${meta.offlinePodCount} offline pods`);
  }
  if (meta?.fetchedAt) {
    parts.push(`updated ${new Date(meta.fetchedAt).toLocaleString()}`);
  } else if (meta?.conciergePath) {
    parts.push("from local CSV snapshot");
  }
  $("#metaLine").textContent = parts.join(" · ") || "Routing rules";
}

async function loadCoverageGaps() {
  const gapsRes = await fetch("/routing-gaps.json");
  if (gapsRes.ok) {
    gapsData = await gapsRes.json();
    return;
  }
  if (data?.coverageGaps) {
    gapsData = data.coverageGaps;
    return;
  }
  const staticRes = await fetch("/routing-data.json");
  if (staticRes.ok) {
    const staticData = await staticRes.json();
    gapsData = staticData.coverageGaps ?? null;
  }
}

async function loadRouting(refresh = false) {
  if (refresh) {
    const res = await fetch("/api/routing?refresh=1");
    if (!res.ok) {
      throw new Error(
        (await res.text()) || "API refresh failed — restart the server with `node server.mjs`",
      );
    }
    data = await res.json();
  } else {
    const [apiRes, staticRes] = await Promise.all([
      fetch("/api/routing"),
      fetch("/routing-data.json"),
    ]);
    if (apiRes.ok) {
      data = await apiRes.json();
      if (!data.coverageGaps && staticRes.ok) {
        const staticData = await staticRes.json();
        data.coverageGaps = staticData.coverageGaps;
      }
    } else if (staticRes.ok) {
      data = await staticRes.json();
    } else {
      throw new Error(
        "Routing data not found. Restart the server: node server.mjs",
      );
    }
  }
  await loadCoverageGaps();
  updateMeta(data.meta);
  fillStatusOptions();
  setTab(activeTab);
}

function wireEvents() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });
  $("#regionFilter").addEventListener("change", () => {
    if (activeTab === "concierge") renderConcierge();
    else if (activeTab === "offline") renderOffline();
    else renderGaps();
  });
  $("#statusFilter").addEventListener("change", renderConcierge);
  $("#refreshBtn").addEventListener("click", async () => {
    $("#refreshBtn").disabled = true;
    $("#refreshBtn").textContent = "Refreshing…";
    try {
      await loadRouting(true);
    } catch (err) {
      alert(`Refresh failed: ${err.message}`);
    } finally {
      $("#refreshBtn").disabled = false;
      $("#refreshBtn").textContent = "Refresh from Sheets";
    }
  });
}

async function init() {
  wireEvents();
  try {
    await loadRouting();
    const metaRes = await fetch("/api/routing/meta");
    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (meta.canRefresh) {
        $("#refreshBtn").hidden = false;
        $("#refreshBtn").textContent =
          meta.source === "api" ? "Refresh from API" : "Refresh data";
      }
      if (meta.apiUrl) {
        const link = $("#sourceLink");
        link.href = meta.apiUrl.replace(/apiKey=[^&]+/, "apiKey=***");
        link.textContent = "Chili Piper API";
        link.hidden = false;
      }
    }
    if (data?.meta?.source === "chilipiper-api") {
      $("#metaLine").textContent = [
        `${data.meta.conciergeRuleCount} geographic rules`,
        `${data.meta.ruleCount} total from Chili Piper`,
        data.meta.fetchedAt
          ? `updated ${new Date(data.meta.fetchedAt).toLocaleString()}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  } catch (err) {
    $("#metaLine").textContent = `Failed to load: ${err.message}`;
  }
}

init();
