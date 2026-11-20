/* Results chart and table (data: PAGE_DATA.results). */
/* ---------------------------------------------------------------- results chart */
const METRICS = [
  { key: "pos", label: "Position error", lower: true, log: true, note: "Distance from the planned camera, in scene units (1 = typical depth of the scene), log scale." },
  { key: "rot", label: "Rotation error", lower: true, log: true, unit: "°", note: "Angle between generated and planned camera, in degrees, log scale." },
  { key: "lpips", label: "LPIPS to recording", lower: true, log: false, note: "Distance between generated frames and the frames recorded at the planned poses. Lower is better." },
  { key: "dino", label: "DINO similarity", lower: false, log: false, note: "Similarity between generated frames and the frames recorded at the planned poses. Higher is better." },
  { key: "ws_camera", label: "WorldScore camera", lower: false, log: false, note: "WorldScore camera control, which fits a scale to the plan first. Higher is better." },
];
const RUNS = [
  { key: "open", label: "World model", cls: "c-open", color: "var(--open)" },
  { key: "reaim", label: "Re-Aim", cls: "c-reaim", color: "var(--reaim)" },
  { key: "full", label: "Re-Aim + RGC", cls: "c-full", color: "var(--ours)" },
  { key: "memory", label: "Pose memory", cls: "c-full", color: "var(--ours)" },
];

const chart = document.querySelector(".chart");
const controls = document.querySelector(".chart-controls");
const note = document.getElementById("chart-note");
const tip = el("div", { class: "tooltip", hidden: "" }, chart);
let current = 0;

METRICS.forEach((m, i) => {
  const b = el("button", { class: "metric", role: "radio", type: "button", text: m.label, "aria-checked": String(i === 0) }, controls);
  b.addEventListener("click", () => drawChart(i));
});

function drawChart(mi) {
  current = mi;
  const M = METRICS[mi];
  controls.querySelectorAll(".metric").forEach((b, k) => b.setAttribute("aria-checked", String(k === mi)));
  note.textContent = M.note + " Red: World model. Green: Re-Aim. Blue: Re-Aim + RGC (pose memory for VMem).";
  chart.querySelectorAll("svg").forEach((n) => n.remove());

  const rows = D.results;
  // the drawing is made at the chart's real width, so text keeps its size on a phone
  const W = Math.max(300, Math.round(chart.clientWidth));
  const narrow = W < 620;
  const left = narrow ? 116 : 190, right = narrow ? 46 : 80, top = 34, rowH = narrow ? 36 : 40, gapSet = 34;
  const H = top + rows.length * rowH + gapSet + 40;
  const svg = el("svg:svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", class: narrow ? "narrow" : "", "aria-label": M.label + " for each model" });
  chart.insertBefore(svg, tip);

  const vals = rows.flatMap((r) => Object.values(r.arms).map((a) => a[M.key]).filter((v) => v != null));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  let ticks;
  if (M.log) {
    lo = Math.pow(10, Math.floor(Math.log10(lo))); hi = Math.pow(10, Math.ceil(Math.log10(hi)));
    ticks = []; for (let t = lo; t <= hi * 1.001; t *= 10) ticks.push(t);
  } else {
    const pad = (hi - lo) * 0.08; lo = Math.max(0, lo - pad); hi = Math.min(1, hi + pad);
    const step = hi - lo > 0.5 ? 0.2 : 0.1;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    ticks = []; for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(+t.toFixed(2));
  }
  const X = (v) => left + (M.log ? (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) : (v - lo) / (hi - lo)) * (W - left - right);

  const yOf = (i) => top + i * rowH + (rows[i].dataset === "RealEstate10K" ? gapSet : 0) + rowH / 2;
  for (const t of ticks) {
    el("svg:line", { x1: X(t), x2: X(t), y1: top - 6, y2: H - 26, class: "c-axis" }, svg);
    el("svg:text", { x: X(t), y: H - 8, "text-anchor": "middle", class: "c-tick", text: M.log ? String(t) : t.toFixed(1) }, svg);
  }
  el("svg:text", { x: 0, y: top - 14, class: "c-set", text: "DL3DV, 480 frames" }, svg);
  const firstRe = rows.findIndex((r) => r.dataset === "RealEstate10K");
  if (firstRe >= 0) el("svg:text", { x: 0, y: yOf(firstRe) - rowH / 2 - 6, class: "c-set", text: "RealEstate10K, 240 frames" }, svg);
  el("svg:text", { x: W, y: top - 14, "text-anchor": "end", class: "c-set", text: M.lower ? "lower by" : "change" }, svg);

  rows.forEach((r, i) => {
    const y = yOf(i);
    const g = el("svg:g", { class: "c-row", tabindex: "0" }, svg);
    el("svg:rect", { x: 0, y: y - rowH / 2, width: W, height: rowH, rx: 6, class: "c-hit" }, g);
    el("svg:text", { x: 0, y: y + 5, class: "c-name", text: r.model }, g);
    const runs = RUNS.filter((k) => r.arms[k.key] && r.arms[k.key][M.key] != null);
    const xs = runs.map((k) => X(r.arms[k.key][M.key]));
    el("svg:line", { x1: Math.min(...xs), x2: Math.max(...xs), y1: y, y2: y, class: "c-link" }, g);
    for (const k of runs) {
      el("svg:circle", { cx: X(r.arms[k.key][M.key]), cy: y, r: k.key === "reaim" ? 6 : 8, class: "c-dot " + k.cls }, g);
    }
    const best = r.arms.full || r.arms.memory, o = r.arms.open;
    let fac = "";
    if (best && best[M.key] != null && o[M.key] != null) {
      fac = M.lower ? (o[M.key] / best[M.key] >= 9.5 ? Math.round(o[M.key] / best[M.key]) : (o[M.key] / best[M.key]).toFixed(1)) + "×"
                    : (best[M.key] - o[M.key] >= 0 ? "+" : "−") + Math.abs(best[M.key] - o[M.key]).toFixed(2);
    }
    el("svg:text", { x: W, y: y + 5, "text-anchor": "end", class: "c-factor", text: fac }, g);

    const lines = runs.map((k) => `<span><i style="background:${k.color}"></i>${k.label}: ${M.key === "pos" ? fmt(r.arms[k.key][M.key]) : r.arms[k.key][M.key].toFixed(M.key === "rot" ? 2 : 3)}${M.unit || ""}</span>`).join("<br>");
    g.setAttribute("aria-label", `${r.model}: ` + runs.map((k) => `${k.label} ${r.arms[k.key][M.key]}`).join(", "));
    const show = () => {
      tip.innerHTML = `<span class="t-name">${r.model} (${r.dataset}, n = ${r.n})</span>${lines}`;
      const box = chart.getBoundingClientRect(), sb = svg.getBoundingClientRect();
      tip.style.left = Math.min(Math.max(((Math.min(...xs) + Math.max(...xs)) / 2 / W) * sb.width + (sb.left - box.left), 120), box.width - 120) + "px";
      tip.style.top = (y - rowH / 2) / H * sb.height + (sb.top - box.top) + "px";
      tip.hidden = false;
    };
    g.addEventListener("mouseenter", show); g.addEventListener("focus", show);
    g.addEventListener("mouseleave", () => (tip.hidden = true)); g.addEventListener("blur", () => (tip.hidden = true));
  });
}
drawChart(0);
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => drawChart(current), 120); });

/* ---------------------------------------------------------------- tables */
function resultsTable() {
  const t = document.querySelector(".results-table");
  const cols = [
    ["pos", "Position", 3, true], ["rot", "Rotation (°)", 2, true], ["lpips", "LPIPS", 3, true], ["dino", "DINO", 3, false],
    ["ws_camera", "WS camera", 3, false], ["ws_d3", "WS 3D", 3, false], ["ws_photo", "WS photo.", 3, false], ["ws_style", "WS style", 3, false],
    ["ws_qual", "WS quality", 3, false], ["ws_content", "WS content", 3, false], ["ws_overall", "WS overall", 3, false],
  ];
  const thead = el("thead", {}, t), hr = el("tr", {}, thead);
  el("th", { text: "Model" }, hr); el("th", { class: "l", text: "Commands" }, hr);
  cols.forEach((c) => el("th", { text: c[1] }, hr));
  const tb = el("tbody", {}, t);
  let lastSet = "";
  for (const r of D.results) {
    if (r.dataset !== lastSet) {
      const sr = el("tr", { class: "set-row" }, tb);
      el("td", { colspan: String(cols.length + 2), text: r.dataset === "DL3DV" ? "DL3DV, 480 frames" : "RealEstate10K, 240 frames" }, sr);
      lastSet = r.dataset;
    }
    const runs = RUNS.filter((k) => r.arms[k.key]);
    runs.forEach((k, i) => {
      const tr = el("tr", { class: k.key === "full" || k.key === "memory" ? "ours-row" : "" }, tb);
      el("td", { text: i === 0 ? r.model : i === 1 ? `n = ${r.n}` : "" }, tr);
      el("td", { class: "l", text: k.label }, tr);
      for (const [key, , dec, lower] of cols) {
        const v = r.arms[k.key][key];
        const all = runs.map((q) => r.arms[q.key][key]).filter((x) => x != null);
        const best = all.length > 1 && v === (lower ? Math.min(...all) : Math.max(...all));
        el("td", { class: best ? "best" : "", text: v == null ? "–" : v.toFixed(dec) }, tr);
      }
    });
  }
}
resultsTable();


