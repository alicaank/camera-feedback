/* A toy version of the loop, in the plane, so the controllers can be compared on any response.

   The camera should follow a curved plan of 480 frames, generated in chunks of 24. The "model" moves gain times as far
   as each command asks, turned by a fixed angle. Three ways to command it:
   - world model:  command the plan
   - re-aim:     after each chunk, measure the camera (with optional noise), aim a path from there back to the plan by
                 the end of the next chunk, and send that motion from the pose the model believes it is at
   - RGC:        as re-aim, but divide the motion by the projected gain estimated so far, never by less than one
   This is the scalar loop of the paper, e(k+1) = (1 - g/ĝ)(e(k) - Δ(k)), drawn in two dimensions. */
(function () {
  const root = document.getElementById("sim");
  if (!root) return;

  const N = 480, CH = 24;
  const ARMS = [
    { key: "open", label: "World model" },
    { key: "reaim", label: "Re-Aim" },
    { key: "rgc", label: "Re-Aim + RGC" },
  ];
  const PRESETS = {
    far: { label: "Moves too far", gain: 1.7, turn: 0, noise: 0.04 },
    little: { label: "Moves too little", gain: 0.5, turn: 0, noise: 0.01 },
    drift: { label: "Turns away", gain: 1.0, turn: 10, noise: 0.01 },
    fine: { label: "Follows its plan", gain: 1.0, turn: 0, noise: 0.01 },
  };

  // the plan: a gentle S, about 11 units long
  const plan = [];
  for (let j = 0; j <= N; j++) {
    const s = j / N;
    plan.push([10 * s, 1.5 * Math.sin(1.5 * Math.PI * s)]);
  }
  let planLen = 0;
  for (let j = 1; j <= N; j++) planLen += Math.hypot(plan[j][0] - plan[j - 1][0], plan[j][1] - plan[j - 1][1]);

  // a fixed noise sequence, so a slider change does not reshuffle the measurements
  const gauss = (() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = [];
    for (let i = 0; i < 2 * (N / CH + 1); i++) {
      const u = Math.max(rnd(), 1e-9), v = rnd();
      out.push(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
    }
    return out;
  })();

  function simulate(arm, gain, turnDeg, noise) {
    const th = (turnDeg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    const act = [plan[0].slice()];          // where the camera is
    let cmdPrev = plan[0].slice();            // the last commanded pose: where the model believes it is
    let num = 0, den = 0, gHat = 1;           // projected gain: sum(m.c) / sum(c.c)
    const meas = [], targets = [], gains = [];
    let cmdAtB = cmdPrev.slice(), measAtB = plan[0].slice();
    for (let b = 0; b < N; b += CH) {
      // measure at the boundary
      const a = act[b];
      const M = b === 0 ? a.slice() : [a[0] + noise * gauss[2 * (b / CH)], a[1] + noise * gauss[2 * (b / CH) + 1]];
      if (b > 0 && arm === "rgc") {
        const cd = [cmdPrev[0] - cmdAtB[0], cmdPrev[1] - cmdAtB[1]];
        const md = [M[0] - measAtB[0], M[1] - measAtB[1]];
        num += md[0] * cd[0] + md[1] * cd[1];
        den += cd[0] * cd[0] + cd[1] * cd[1];
        if (den > 1e-9) gHat = num / den;
      }
      const shrink = arm === "rgc" ? Math.max(1, gHat) : 1;
      if (arm !== "open") { meas.push({ b, M }); gains.push({ b, g: gHat }); }
      cmdAtB = cmdPrev.slice(); measAtB = M.slice();
      const tgt = [];
      for (let j = b + 1; j <= Math.min(N, b + CH); j++) {
        let cmd;
        if (arm === "open") cmd = plan[j];
        else {
          const w = 1 - (j - b) / CH;   // the offset from the plan fades out over the chunk
          const Dj = [plan[j][0] + w * (M[0] - plan[b][0]), plan[j][1] + w * (M[1] - plan[b][1])];
          tgt.push(Dj);
          cmd = [cmdAtB[0] + (Dj[0] - M[0]) / shrink, cmdAtB[1] + (Dj[1] - M[1]) / shrink];
        }
        const u = [cmd[0] - cmdPrev[0], cmd[1] - cmdPrev[1]];
        const p = act[j - 1];
        act.push([p[0] + gain * (c * u[0] - s * u[1]), p[1] + gain * (s * u[0] + c * u[1])]);
        cmdPrev = cmd;
      }
      if (arm !== "open") targets.push({ b, from: M, pts: [M, ...tgt] });
    }
    const err = act.map((q, j) => Math.hypot(q[0] - plan[j][0], q[1] - plan[j][1]));
    const mean = err.slice(1).reduce((x, y) => x + y, 0) / N;
    return { act, err, mean, meas, targets, gains };
  }

  /* ------------------------------------------------------------ controls */
  const presetsBox = root.querySelector(".sim-presets");
  const sliders = {
    gain: root.querySelector("#sim-gain"),
    turn: root.querySelector("#sim-turn"),
    noise: root.querySelector("#sim-noise"),
  };
  const outs = {
    gain: root.querySelector("[for=sim-gain] output"),
    turn: root.querySelector("[for=sim-turn] output"),
    noise: root.querySelector("[for=sim-noise] output"),
  };
  const playBtn = root.querySelector(".sim-play");
  const scrub = root.querySelector(".sim-scrub");
  const mapSvg = root.querySelector(".sim-map");
  const errSvg = root.querySelector(".sim-err");
  const bars = root.querySelector(".sim-bars");
  const gainOut = root.querySelector(".sim-ghat");
  const toggles = root.querySelectorAll(".sim-toggle");
  const shown = { open: true, reaim: true, rgc: true };

  for (const [id, p] of Object.entries(PRESETS)) {
    const b = el("button", { type: "button", class: "metric", role: "radio", "aria-checked": "false", "data-preset": id, text: p.label }, presetsBox);
    b.addEventListener("click", () => applyPreset(id, true));
  }
  function applyPreset(id, animate) {
    const p = PRESETS[id];
    sliders.gain.value = p.gain; sliders.turn.value = p.turn; sliders.noise.value = p.noise;
    presetsBox.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.preset === id)));
    recompute();
    if (animate && !reduceMotion) play(); else showAt(N);
  }
  Object.values(sliders).forEach((s) => s.addEventListener("input", () => {
    presetsBox.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-checked", "false"));
    stop(); recompute(); showAt(N);
  }));
  toggles.forEach((t) => t.addEventListener("click", () => {
    const key = t.dataset.arm;
    shown[key] = !shown[key];
    t.setAttribute("aria-pressed", String(shown[key]));
    showAt(frame);
  }));

  /* ------------------------------------------------------------ geometry of the map */
  const MW = 1000, MH = 560;
  let xs = plan.map((p) => p[0]), ys = plan.map((p) => p[1]);
  const pad = 1.6;
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  const yc = (Math.min(...ys) + Math.max(...ys)) / 2;
  const kx = MW / (x1 - x0);
  const T = (q) => [((q[0] - x0) * kx).toFixed(1), (MH / 2 - (q[1] - yc) * kx).toFixed(1)];
  const inside = (q) => { const [x, y] = T(q).map(Number); return x >= 0 && x <= MW && y >= 0 && y <= MH; };
  const clampPt = (q) => { const [x, y] = T(q).map(Number); return [Math.min(MW - 14, Math.max(14, x)), Math.min(MH - 14, Math.max(14, y))]; };

  let res = {}, frame = N;

  function recompute() {
    const g = +sliders.gain.value, t = +sliders.turn.value, n = +sliders.noise.value;
    outs.gain.textContent = g.toFixed(2) + "×";
    outs.turn.textContent = (t > 0 ? "+" : "") + t + "°";
    outs.noise.textContent = n.toFixed(2);
    for (const a of ARMS) res[a.key] = simulate(a.key, g, t, n);
  }

  function showAt(f) {
    frame = f;
    scrub.value = f;
    scrub.setAttribute("aria-valuetext", `Frame ${f} of ${N}`);
    drawMap(f); drawLens(f); drawErr(f); drawBars(f);
  }

  function drawMap(f) {
    mapSvg.replaceChildren();
    // chunk ticks on the plan
    const g0 = el("svg:g", {}, mapSvg);
    g0.appendChild(polyline(plan.map(T), "p-plan"));
    for (let b = CH; b < N; b += CH) { const [x, y] = T(plan[b]); el("svg:circle", { cx: x, cy: y, r: 4, class: "sim-tick" }, g0); }
    const [sx, sy] = T(plan[0]); el("svg:circle", { cx: sx, cy: sy, r: 10, class: "m-start" }, g0);
    const [ex, ey] = T(plan[N]); el("svg:rect", { x: ex - 9, y: ey - 9, width: 18, height: 18, class: "m-mark m-plan" }, g0);

    for (const a of ARMS) {
      if (!shown[a.key]) continue;
      const r = res[a.key];
      const cls = { open: "p-open", reaim: "p-reaim", rgc: "p-ours" }[a.key];
      // the path, split where it leaves the map
      let seg = [];
      for (let j = 0; j <= f; j++) {
        if (inside(r.act[j])) seg.push(T(r.act[j]));
        else { if (seg.length > 1) mapSvg.appendChild(polyline(seg, cls + " sim-path")); seg = []; }
      }
      if (seg.length > 1) mapSvg.appendChild(polyline(seg, cls + " sim-path"));
      // the re-aimed target of the chunk in progress
      if (a.key !== "open" && f < N) {
        const t = r.targets.find((q) => f > q.b && f <= q.b + CH) || r.targets[0];
        if (t) mapSvg.appendChild(polyline(t.pts.map(T), `sim-target sim-target-${a.key}`));
      }
      // measurements so far
      if (a.key !== "open") for (const m of r.meas) if (m.b > 0 && m.b <= f && inside(m.M)) {
        const [x, y] = T(m.M); el("svg:circle", { cx: x, cy: y, r: 5.5, class: `sim-meas sim-meas-${a.key}` }, mapSvg);
      }
      // the camera now (on the edge, as an arrow, when it has left the map)
      const q = r.act[f];
      if (inside(q)) { const [x, y] = T(q); el("svg:circle", { cx: x, cy: y, r: 11, class: `cam cam-${a.key}` }, mapSvg); }
      else {
        const [x, y] = clampPt(q), [tx, ty] = T(q).map(Number);
        const ang = (Math.atan2(ty - y, tx - x) * 180) / Math.PI;
        el("svg:path", { d: "M14 0L-8 -10L-8 10Z", transform: `translate(${x} ${y}) rotate(${ang})`, class: `cam-away cam-${a.key}` }, mapSvg);
      }
    }
  }

  /* a magnifier that follows the camera of re-aim + RGC, so the small errors of the two feedback runs can be seen */
  const ZOOM = 7, LR = 120, LX = MW - LR - 18, LY = LR + 18;
  function drawLens(f) {
    const focus = shown.rgc ? res.rgc.act[f] : shown.reaim ? res.reaim.act[f] : plan[f];
    const [fx, fy] = T(focus).map(Number);
    const g = el("svg:g", { class: "lens" }, mapSvg);
    const id = "lens-clip";
    el("svg:circle", { cx: LX, cy: LY, r: LR }, el("svg:clipPath", { id }, el("svg:defs", {}, g)));
    el("svg:circle", { cx: LX, cy: LY, r: LR, class: "lens-bg" }, g);
    const inner = el("svg:g", { "clip-path": `url(#${id})` }, g);
    const z = el("svg:g", { transform: `translate(${LX} ${LY}) scale(${ZOOM}) translate(${-fx} ${-fy})` }, inner);
    const near = (q) => Math.hypot(q[0] - focus[0], q[1] - focus[1]) < (LR / ZOOM / kx) * 1.6;
    const lo = Math.max(0, f - 60), hi = Math.min(N, f + 60);
    z.appendChild(polyline(plan.slice(lo, hi + 1).map(T), "lens-plan"));
    for (const k of ["reaim", "rgc"]) {
      if (!shown[k]) continue;
      const pts = res[k].act.slice(lo, f + 1).filter(near).map(T);
      if (pts.length > 1) z.appendChild(polyline(pts, `lens-path lens-${k}`));
      const q = res[k].act[f];
      if (near(q)) { const [x, y] = T(q); el("svg:circle", { cx: x, cy: y, r: 9 / ZOOM, class: `cam cam-${k} lens-cam` }, z); }
    }
    el("svg:circle", { cx: LX, cy: LY, r: LR, class: "lens-ring" }, g);
    el("svg:text", { x: LX, y: LY + LR + 30, "text-anchor": "middle", class: "lens-label", text: `${ZOOM}× closer` }, g);
  }

  function drawErr(f) {
    errSvg.replaceChildren();
    const W = Math.max(280, Math.round(errSvg.clientWidth || 400)), H = 170, L = 38, B = 22;
    errSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const pct = (e) => (e / planLen) * 100;
    const vis = ARMS.filter((a) => shown[a.key]).flatMap((a) => res[a.key].err.slice(1).map(pct));
    const hiD = Math.ceil(Math.log10(Math.max(...vis, 0.1))), loD = Math.max(hiD - 4, Math.floor(Math.log10(Math.max(Math.min(...vis.filter((v) => v > 0)), 1e-3))));
    const X = (j) => L + (j / N) * (W - L - 4);
    const Y = (v) => { const t = (Math.log10(Math.max(v, Math.pow(10, loD))) - loD) / (hiD - loD); return H - B - t * (H - B - 8); };
    for (let d = loD; d <= hiD; d++) {
      const v = Math.pow(10, d);
      el("svg:line", { x1: L, x2: W, y1: Y(v), y2: Y(v), class: "c-axis" }, errSvg);
      el("svg:text", { x: L - 6, y: Y(v) + 4, "text-anchor": "end", class: "c-tick", text: (v >= 1 ? v.toFixed(0) : String(+v.toPrecision(1))) + "%" }, errSvg);
    }
    for (let b = 0; b <= N; b += 120) el("svg:text", { x: X(b), y: H - 4, class: "c-tick", "text-anchor": b === 0 ? "start" : b === N ? "end" : "middle", text: String(b) }, errSvg);
    for (const a of ARMS) {
      if (!shown[a.key]) continue;
      const cls = { open: "s-open", reaim: "s-reaim", rgc: "s-ours" }[a.key];
      errSvg.appendChild(polyline(res[a.key].err.slice(1, f + 1).map((e, j) => [X(j + 1).toFixed(1), Y(pct(e)).toFixed(1)]), cls));
    }
    el("svg:line", { x1: X(f), x2: X(f), y1: 0, y2: H - B, class: "s-head" }, errSvg);
  }

  function drawBars(f) {
    bars.replaceChildren();
    const means = ARMS.map((a) => {
      const e = res[a.key].err.slice(1, f + 1);
      return e.length ? e.reduce((x, y) => x + y, 0) / e.length / planLen * 100 : 0;
    });
    const max = Math.max(...means, 1e-6);
    ARMS.forEach((a, i) => {
      const row = el("div", { class: "bar-row" + (shown[a.key] ? "" : " off") }, bars);
      el("span", { class: "bar-label", text: a.label }, row);
      const track = el("span", { class: "bar-track" }, row);
      el("span", { class: `bar bar-${a.key}`, style: `width:${(means[i] / max) * 100}%` }, track);
      el("span", { class: "bar-value", text: means[i] >= 10 ? means[i].toFixed(0) + "%" : means[i].toFixed(1) + "%" }, row);
    });
    const g = res.rgc.gains.filter((q) => q.b <= f).at(-1);
    const gHat = g ? g.g : 1;
    gainOut.innerHTML = `RGC's estimate of the gain so far: <strong>${gHat.toFixed(2)}</strong>` +
      (gHat < 1 ? ", below one, so it divides by one and acts like re-aim." : gHat > 1.05 ? `, so it shrinks each command by ${gHat.toFixed(2)}.` : ".");
  }

  /* ------------------------------------------------------------ animation */
  let raf = null, t0 = 0;
  const DURATION = 7000;
  function play() {
    stop();
    playBtn.setAttribute("aria-pressed", "true"); playBtn.querySelector(".play-label").textContent = "Pause";
    const start = frame >= N ? 0 : frame;
    t0 = performance.now() - (start / N) * DURATION;
    const step = (now) => {
      const f = Math.min(N, Math.round(((now - t0) / DURATION) * N));
      showAt(f);
      if (f < N) raf = requestAnimationFrame(step); else stop();
    };
    raf = requestAnimationFrame(step);
  }
  function stop() {
    cancelAnimationFrame(raf); raf = null;
    playBtn.setAttribute("aria-pressed", "false"); playBtn.querySelector(".play-label").textContent = "Play";
  }
  playBtn.addEventListener("click", () => (raf ? stop() : play()));
  scrub.max = N;
  scrub.addEventListener("input", () => { stop(); showAt(+scrub.value); });

  applyPreset("far", false);
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => drawErr(frame), 120); });
  onFirstView(root.querySelector(".sim-stage"), () => { if (!reduceMotion) { frame = 0; play(); } }, 0.5);
})();
