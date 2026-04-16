/* Growth Stock Scanner — Frontend JS (mobile + desktop) */

let sortCol = "total_score";
let sortDir = "desc";
let polling = false;
let currentData = [];

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtN(v, dec) {
  if (v == null) return "—";
  return parseFloat(v).toFixed(dec);
}
function fmtPct(v) {
  if (v == null) return "—";
  return (v > 0 ? "+" : "") + parseFloat(v).toFixed(1) + "%";
}
function fmtPct2(v) {
  if (v == null) return "—";
  return (parseFloat(v) * 100).toFixed(1) + "%";
}
function momVal(v) { return v != null ? (v >= 0 ? "+" : "") + v.toFixed(1) + "%" : "—"; }
function esc(s)    { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function pctColor(v) { if (v == null) return "muted"; return v >= 15 ? "pos" : v >= 0 ? "warn" : "neg"; }
function peColor(v)  { if (v == null) return "muted"; return v < 25  ? "pos" : v < 50 ? "warn" : "neg"; }
function pegColor(v) { if (v == null) return "muted"; return v < 1   ? "pos" : v < 1.5 ? "warn" : "neg"; }
function deColor(v)  { if (v == null) return "muted"; return v < 0.5 ? "pos" : v < 1.5 ? "warn" : "neg"; }
function fcfColor(v) { if (v == null) return "muted"; return v > 0   ? "pos" : "neg"; }

function scoreCls(s) {
  if (s >= 50) return "score-gold";
  if (s >= 30) return "score-cyan";
  return "score-plain";
}

function momCell(v) {
  if (v == null) return '<span class="muted">—</span>';
  const cls = v >= 0 ? "pos" : "neg";
  const barCls = v >= 0 ? "pos-bar" : "neg-bar";
  const bw = Math.min(Math.abs(v) / 100 * 32, 32);
  return `<div class="mom-bar ${barCls}" style="width:${bw}px"></div><span class="${cls}">${v>=0?"+":""}${v.toFixed(1)}%</span>`;
}

const isMobile = () => window.innerWidth < 900;

// ── Scan ──────────────────────────────────────────────────────────────────────
async function startScan() {
  const btn = document.getElementById("btn-scan");
  btn.disabled = true;
  btn.classList.add("scanning");
  document.getElementById("btn-label").textContent = "Scanning…";
  document.getElementById("live-dot").classList.add("active");
  document.getElementById("status-msg").textContent = "Starting scan…";

  try {
    const r = await fetch("/api/scan/start", { method: "POST" });
    const j = await r.json();
    if (!j.ok && j.msg !== "Scan already running") {
      alert("Error: " + j.msg);
      resetBtn(); return;
    }
  } catch(e) {
    alert("Cannot connect to server.\nMake sure app.py is running.");
    resetBtn(); return;
  }

  polling = true;
  pollStatus();
}

function resetBtn() {
  const btn = document.getElementById("btn-scan");
  btn.disabled = false;
  btn.classList.remove("scanning");
  document.getElementById("btn-label").textContent = "Scan Now";
  document.getElementById("live-dot").classList.remove("active");
}

async function pollStatus() {
  if (!polling) return;
  try {
    const r = await fetch("/api/scan/status");
    const s = await r.json();

    const pct = s.progress || 0;
    document.getElementById("progress-fill").style.width = pct + "%";
    document.getElementById("progress-label").textContent =
      s.running ? `${s.done} / ${s.total} (${pct}%)` : (s.last_scan ? `Done ${s.elapsed}s` : "Ready");

    document.getElementById("hdr-count").textContent = s.count || "0";
    const errNote = s.errors > 0 ? ` (${s.errors} skipped)` : "";
    document.getElementById("status-msg").textContent = s.running
      ? `Scanning... ${s.done}/${s.total} -- ${s.count} stocks found${errNote}`
      : `Done -- ${s.count} stocks, ${s.errors || 0} skipped, ${s.elapsed}s`;

    if (s.last_scan) document.getElementById("hdr-lastscan").textContent = s.last_scan;
    if (s.count > 0) await loadStocks();

    if (s.running) {
      setTimeout(pollStatus, 1800);
    } else {
      polling = false;
      resetBtn();
      await loadStocks();
      await loadSectors();
    }
  } catch(e) {
    polling = false;
    resetBtn();
  }
}

// ── Load stocks ───────────────────────────────────────────────────────────────
async function loadStocks() {
  const params = new URLSearchParams({
    sector:    document.getElementById("f-sector").value,
    search:    document.getElementById("f-search").value,
    cap_max:   document.getElementById("f-cap").value,
    min_score: document.getElementById("f-score").value,
    limit:     document.getElementById("f-limit").value,
    sort_by:   sortCol,
    sort_dir:  sortDir,
  });
  try {
    const r = await fetch("/api/stocks?" + params);
    const j = await r.json();
    currentData = j.stocks || [];
    if (isMobile()) renderCards(currentData, j.total || 0);
    else            renderTable(currentData, j.total || 0);
  } catch(e) {}
}

// ── Filters / sort ────────────────────────────────────────────────────────────
function applyFilters() { loadStocks(); }

function resetFilters() {
  document.getElementById("f-search").value = "";
  document.getElementById("f-sector").value = "All";
  document.getElementById("f-cap").value    = "2b";
  document.getElementById("f-score").value  = "0";
  document.getElementById("f-limit").value  = "50";
  loadStocks();
}

document.querySelectorAll("th.sortable").forEach(th => {
  th.addEventListener("click", () => {
    if (sortCol === th.dataset.col) sortDir = sortDir === "desc" ? "asc" : "desc";
    else { sortCol = th.dataset.col; sortDir = "desc"; }
    loadStocks();
  });
});

async function loadSectors() {
  try {
    const r = await fetch("/api/sectors");
    const j = await r.json();
    const sel = document.getElementById("f-sector");
    const cur = sel.value;
    sel.innerHTML = '<option value="All">All Sectors</option>' +
      (j.sectors || []).map(s => `<option value="${esc(s)}"${s===cur?" selected":""}>${esc(s)}</option>`).join("");
  } catch(e) {}
}

// ── Desktop table render ──────────────────────────────────────────────────────
function renderTable(stocks, total) {
  const tbody = document.getElementById("tbody");
  const empty = document.getElementById("table-empty-desk");
  document.getElementById("hdr-count").textContent = total;

  if (stocks.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  const medals = ["🥇","🥈","🥉"];

  tbody.innerHTML = stocks.map((s, i) => {
    const sc = s.total_score;
    return `
    <tr class="${i < 3 ? "top-row" : ""}" onclick="openDrawer(${i})">
      <td class="td-rank">${i < 3 ? medals[i] : i+1}</td>
      <td class="td-name"><div class="company">${esc(s.name)}</div><div class="industry">${esc(s.industry||"—")}</div></td>
      <td class="td-ticker">${esc(s.ticker)}</td>
      <td style="font-size:11px;color:var(--text2)">${esc(s.exchange||"—")}</td>
      <td><span class="sector-tag">${esc(s.sector||"—")}</span></td>
      <td class="td-num">${s.market_cap_fmt||"—"}</td>
      <td class="td-score"><span class="score-badge ${scoreCls(sc)}">${fmtN(sc,1)}</span></td>
      <td class="td-subscores"><div class="sub-scores">
        <span class="sp sp-g">${fmtN(s.growth_score,1)}</span>
        <span class="sp sp-v">${fmtN(s.value_score,1)}</span>
        <span class="sp sp-q">${fmtN(s.quality_score,1)}</span>
      </div></td>
      <td class="td-num ${pctColor(s.revenue_growth)}">${fmtPct(s.revenue_growth)}</td>
      <td class="td-num ${pctColor(s.earnings_growth)}">${fmtPct(s.earnings_growth)}</td>
      <td class="td-num ${pctColor(s.eps_growth)}">${fmtPct(s.eps_growth)}</td>
      <td class="td-num ${peColor(s.pe_ratio)}">${fmtN(s.pe_ratio,1)}</td>
      <td class="td-num ${pegColor(s.peg_ratio)}">${fmtN(s.peg_ratio,2)}</td>
      <td class="td-num ${pctColor(s.roe)}">${fmtN(s.roe,1)}${s.roe!=null?"%":""}</td>
      <td class="td-num ${deColor(s.debt_equity)}">${fmtN(s.debt_equity,2)}</td>
      <td class="td-num ${fcfColor(s.fcf)}">${s.fcf_fmt||"—"}</td>
      <td class="td-num">${fmtPct2(s.insider_own)}</td>
      <td class="td-num">${fmtPct2(s.inst_own)}</td>
      <td class="td-num"><div class="mom-cell">${momCell(s.price_mom_6m)}</div></td>
      <td class="td-num"><div class="mom-cell">${momCell(s.price_mom_12m)}</div></td>
    </tr>`;
  }).join("");

  // Sort header arrows
  document.querySelectorAll("th.sortable").forEach(th => {
    th.classList.toggle("sort-active", th.dataset.col === sortCol);
    let lbl = th.textContent.replace(/ [▼▲]$/, "");
    if (th.dataset.col === sortCol) lbl += sortDir === "desc" ? " ▼" : " ▲";
    th.textContent = lbl;
  });
}

// ── Mobile card render ────────────────────────────────────────────────────────
function renderCards(stocks, total) {
  const container = document.getElementById("mobile-cards");
  const empty     = document.getElementById("table-empty-mobile");
  document.getElementById("hdr-count").textContent = total;

  if (stocks.length === 0) {
    container.innerHTML = "";
    empty.style.display = "flex";
    return;
  }
  empty.style.display = "none";
  const medals = ["🥇","🥈","🥉"];

  container.innerHTML = stocks.map((s, i) => {
    const sc     = s.total_score;
    const scCls  = scoreCls(sc);
    const isTop  = i < 3;
    const rank   = isTop ? medals[i] : i + 1;

    // Pick 3 most informative metrics for the mini-grid
    const metrics = [
      { label: "Rev Gr%",  val: fmtPct(s.revenue_growth),  cls: pctColor(s.revenue_growth) },
      { label: "P/E",      val: fmtN(s.pe_ratio, 1),       cls: peColor(s.pe_ratio) },
      { label: "ROE%",     val: s.roe != null ? fmtN(s.roe,1)+"%" : "—", cls: pctColor(s.roe) },
      { label: "Earn Gr%", val: fmtPct(s.earnings_growth), cls: pctColor(s.earnings_growth) },
      { label: "PEG",      val: fmtN(s.peg_ratio, 2),      cls: pegColor(s.peg_ratio) },
      { label: "Mom 6M",   val: momVal(s.price_mom_6m),    cls: pctColor(s.price_mom_6m) },
    ].slice(0, 3);

    return `
    <div class="m-card${isTop ? " top-card" : ""}" onclick="openDrawer(${i})">
      <span class="mc-arrow">&#8250;</span>
      <div class="mc-top">
        <div class="mc-left">
          <span class="mc-rank">${rank}</span>
          <span class="mc-ticker">${esc(s.ticker)}</span>
          <span class="sector-tag">${esc(s.sector||"—")}</span>
        </div>
        <div class="mc-right">
          <div class="sub-scores">
            <span class="sp sp-g">${fmtN(s.growth_score,0)}</span>
            <span class="sp sp-v">${fmtN(s.value_score,0)}</span>
            <span class="sp sp-q">${fmtN(s.quality_score,0)}</span>
          </div>
          <span class="score-badge ${scCls}">${fmtN(sc,1)}</span>
        </div>
      </div>
      <div class="mc-name">${esc(s.name)} &nbsp;·&nbsp; ${s.market_cap_fmt||"—"}</div>
      <div class="mc-metrics">
        ${metrics.map(m => `
          <div class="mc-metric">
            <div class="mc-mlabel">${m.label}</div>
            <div class="mc-mval ${m.cls}">${m.val}</div>
          </div>`).join("")}
      </div>
    </div>`;
  }).join("");
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function openDrawer(idx) {
  const s = currentData[idx];
  if (!s) return;

  document.getElementById("d-ticker").textContent  = s.ticker || "—";
  document.getElementById("d-name").textContent    = s.name   || "";
  document.getElementById("d-total").textContent   = fmtN(s.total_score,  1);
  document.getElementById("d-growth").textContent  = fmtN(s.growth_score, 1);
  document.getElementById("d-value").textContent   = fmtN(s.value_score,  1);
  document.getElementById("d-quality").textContent = fmtN(s.quality_score,1);
  document.getElementById("d-time").textContent    = s.fetched_at || "—";

  document.getElementById("d-meta").innerHTML = `
    <span>Exchange</span> ${esc(s.exchange||"—")} &nbsp;·&nbsp;
    <span>Country</span> ${esc(s.country||"—")}<br>
    <span>Sector</span> ${esc(s.sector||"—")} &nbsp;·&nbsp;
    <span>Industry</span> ${esc(s.industry||"—")}<br>
    <span>Market Cap</span> ${s.market_cap_fmt||"—"} &nbsp;·&nbsp;
    <span>Price</span> ${s.price!=null?s.price.toFixed(2):"—"} ${esc(s.currency||"")}
  `;

  const fields = [
    ["Revenue Growth",  fmtPct(s.revenue_growth),         pctColor(s.revenue_growth)],
    ["Earnings Growth", fmtPct(s.earnings_growth),        pctColor(s.earnings_growth)],
    ["EPS Growth",      fmtPct(s.eps_growth),             pctColor(s.eps_growth)],
    ["P/E Ratio",       s.pe_ratio!=null?fmtN(s.pe_ratio,1)+"x":"—", peColor(s.pe_ratio)],
    ["PEG Ratio",       fmtN(s.peg_ratio,2),              pegColor(s.peg_ratio)],
    ["ROE %",           s.roe!=null?fmtN(s.roe,1)+"%":"—", pctColor(s.roe)],
    ["Debt / Equity",   fmtN(s.debt_equity,2),            deColor(s.debt_equity)],
    ["Free Cash Flow",  s.fcf_fmt||"—",                   fcfColor(s.fcf)],
    ["Insider Own.",    fmtPct2(s.insider_own),           ""],
    ["Instit. Own.",    fmtPct2(s.inst_own),              ""],
    ["Mom 6M %",        momVal(s.price_mom_6m),           pctColor(s.price_mom_6m)],
    ["Mom 12M %",       momVal(s.price_mom_12m),          pctColor(s.price_mom_12m)],
    ["Avg Volume",      s.volume!=null?Number(s.volume).toLocaleString():"—", ""],
    ["Currency",        esc(s.currency||"—"),             ""],
  ];

  document.getElementById("d-grid").innerHTML = fields.map(([l,v,c]) =>
    `<div class="dg-item"><div class="dg-label">${l}</div><div class="dg-val ${c}">${v}</div></div>`
  ).join("");

  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawer-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawer-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

// Re-render on resize crossing mobile breakpoint
let lastMobile = isMobile();
window.addEventListener("resize", () => {
  const nowMobile = isMobile();
  if (nowMobile !== lastMobile) {
    lastMobile = nowMobile;
    if (currentData.length > 0) {
      if (nowMobile) renderCards(currentData, currentData.length);
      else           renderTable(currentData, currentData.length);
    }
  }
});
