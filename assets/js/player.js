/* Rollout player: one scene at a time, the camera paths from above and what each run generated.

   Two sources, same interface:
   - frames: the five frames of the paper's frame sheets (1, 120, 240, 360, 480), PAGE_DATA.player
   - video:  full rollouts with a measured camera per frame, PAGE_VIDEOS (written by scripts/export_videos.py)
   A scene with a video entry plays the videos and moves the cameras on the map frame by frame; without one it steps
   through the five frames. Scenes that only exist in PAGE_VIDEOS are added to the picker. */
(function () {
  const root = document.getElementById("watch");
  if (!root) return;

  const RUNS = [
    { key: "target", label: "Recording at the planned pose", short: "Recording" },
    { key: "open", label: "World model", short: "World model" },
    { key: "reaim", label: "Re-aim", short: "Re-aim" },
    { key: "ours", label: "Re-aim + RGC", short: "Re-aim + RGC" },
  ];
  const PATHS = ["open", "reaim", "ours"];

  // merge the two sources by "<model key>/<scene>"
  // a scene with a video takes its numbers from the video's own report, so text, map and video always agree
  const scenes = D.player.map((s) => {
    const v = V[`${s.key}/${s.scene}`];
    return v ? { ...s, errors: v.errors || s.errors, factor: v.factor || s.factor, video: v } : { ...s, video: null };
  });
  for (const [id, v] of Object.entries(V)) {
    if (!scenes.some((s) => `${s.key}/${s.scene}` === id)) {
      const [key, scene] = id.split("/");
      scenes.push({ key, scene, model: v.model, factor: v.factor, worst: false, errors: v.errors, paths: null, keyframes: null, frames: null, video: v });
    }
  }

  const picker = root.querySelector(".picker");
  const svg = root.querySelector(".map-svg");
  const staticLayer = root.querySelector(".map-paths");
  const liveLayer = root.querySelector(".map-live");
  const readout = root.querySelector(".readout");
  const strip = root.querySelector(".err-strip");
  const grid = root.querySelector(".screen-grid");
  const wipe = root.querySelector(".wipe");
  const wipeMedia = root.querySelector(".wipe-media");
  const wipeRange = root.querySelector(".wipe-range");
  const comparisonControls = root.querySelector(".comparison-controls");
  const comparisonButtons = root.querySelectorAll(".comparison-btn");
  const playBtn = root.querySelector(".play");
  const scrub = root.querySelector(".scrub");
  const timeLabel = root.querySelector(".time");
  const viewBtns = root.querySelectorAll(".view-btn");
  const mapFrame = root.querySelector(".map-frame");
  const mapTiming = root.querySelector(".map-timing");
  const mapTip = root.querySelector(".map-tooltip");
  const pathToggles = root.querySelectorAll(".trajectory-toggle");
  const fitButtons = root.querySelectorAll(".map-fit");
  const mapRuns = ["plan", ...PATHS];
  const mapLabels = { plan: "Planned path", open: "World model", reaim: "Re-aim", ours: "Re-aim + RGC" };
  const hiddenPaths = new Set();
  let mapTracks = {}, fitMode = "all", mapSize = 1000, dragPointer = null, dragRun = null, hoveredRun = null;

  let cur = null;            // the scene shown
  let k = 4;                 // frame mode: index into keyframes (opens on frame 480, where the runs differ most); video mode: frame number
  let playing = false, timer = null, raf = null, view = "wipe", userTouched = false;
  let media = {};            // run -> <img>/<video> in the grid
  let wipeEls = {};          // run -> <img>/<video> in the wipe view
  let comparisonBase = "open";

  /* ------------------------------------------------------------ picker */
  scenes.forEach((s, i) => {
    const b = el("button", { class: "pick" + (s.worst ? " pick-worst" : ""), role: "tab", type: "button", "aria-label": `${s.model}, scene ${s.scene}` }, picker);
    const thumbnail = s.frames?.target?.at(-1) || s.video?.posters?.target;
    if (thumbnail) setFrameImage(el("img", { class: "pick-thumbnail", alt: "", width: 64, height: 46, decoding: "async", loading: "lazy" }, b), thumbnail, 56);
    const copy = el("span", { class: "pick-copy" }, b);
    el("span", { class: "pick-model", text: s.model }, copy);
    const detail = el("span", { class: "pick-detail", text: `Scene ${String(i + 1).padStart(2, "0")} · ` }, copy);
    el("span", { class: "pick-factor", text: s.factor ? s.factor + "×" : "" }, detail);
    b.addEventListener("click", () => select(i));
  });
  picker.addEventListener("keydown", (e) => {
    const all = [...picker.children], i = all.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (i < 0 || !step) return;
    e.preventDefault();
    const j = (i + step + all.length) % all.length;
    select(j); all[j].focus();
  });

  /* ------------------------------------------------------------ map */
  function track(s, run) { return s.video ? s.video.track[run] : s.paths[run]; }

  function prepareTracks(s) {
    mapTracks = {};
    for (const run of mapRuns) {
      const points = track(s, run), lengths = [0];
      for (let i = 1; i < points.length; i++) {
        lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
      }
      mapTracks[run] = { points, lengths, total: lengths.at(-1) };
    }
  }

  // Exported figure traces have no timestamps. For frame sheets, distribute progress
  // by arc length and label timing as approximate. Video tracks retain measured timing.
  function mapSample(s, run, f) {
    const { points, lengths, total } = mapTracks[run];
    if (s.video) {
      const i = Math.min(f, points.length - 1);
      return { point: points[i], trail: points.slice(0, i + 1) };
    }
    const progress = (s.keyframes[f] - s.keyframes[0]) / (s.keyframes.at(-1) - s.keyframes[0]);
    const distance = progress * total;
    for (let i = 1; i < points.length; i++) {
      if (lengths[i] < distance) continue;
      const t = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
      const point = points[i - 1].map((v, axis) => v + t * (points[i][axis] - v));
      return { point, trail: [...points.slice(0, i), point] };
    }
    return { point: points.at(-1), trail: points };
  }

  function mapGroup(parent, run) {
    const group = el("svg:g", { class: "trajectory-track" + (hoveredRun === run ? " is-highlighted" : ""), "data-path": run }, parent);
    group.toggleAttribute("hidden", hiddenPaths.has(run));
    return group;
  }

  function drawStatic(s) {
    staticLayer.replaceChildren();
    for (const r of mapRuns) {
      mapGroup(staticLayer, r).appendChild(polyline(track(s, r), `p-${r} ghost`));
    }
    const st = track(s, "plan")[0];
    el("svg:circle", { cx: st[0], cy: st[1], r: 12 * mapSize / 1000, class: "m-start" }, staticLayer);
  }

  function drawLive(s, f) {
    liveLayer.replaceChildren();
    for (const r of [...PATHS, "plan"]) {
      const { point: q, trail } = mapSample(s, r, f);
      const group = mapGroup(liveLayer, r);
      if (trail.length > 1) group.appendChild(polyline(trail, `p-${r}`));
      el("svg:circle", { cx: q[0], cy: q[1], r: (r === "plan" ? 10 : 14) * mapSize / 1000, class: `cam cam-${r}` }, group);
    }
    drawStripHead(f);
  }

  function fitMap() {
    const runs = fitMode === "plan" ? ["plan"] : mapRuns.filter((r) => !hiddenPaths.has(r));
    const points = runs.flatMap((r) => mapTracks[r].points);
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    mapSize = Math.max(80, maxX - minX, maxY - minY) * 1.25;
    const x = (minX + maxX - mapSize) / 2, y = (minY + maxY - mapSize) / 2;
    svg.setAttribute("viewBox", `${x} ${y} ${mapSize} ${mapSize}`);
    svg.querySelectorAll("[data-map-bounds]").forEach((rect) => {
      for (const [attr, value] of Object.entries({ x, y, width: mapSize, height: mapSize })) rect.setAttribute(attr, value);
    });
    fitButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fit === fitMode)));
    clearMapHover();
    drawStatic(cur);
    drawLive(cur, k);
  }

  fitButtons.forEach((b) => b.addEventListener("click", () => { fitMode = b.dataset.fit; fitMap(); }));
  pathToggles.forEach((b) => b.addEventListener("click", () => {
    const run = b.dataset.path;
    if (hiddenPaths.has(run)) hiddenPaths.delete(run);
    else hiddenPaths.add(run);
    pathToggles.forEach((toggle) => {
      const shown = !hiddenPaths.has(toggle.dataset.path);
      toggle.setAttribute("aria-pressed", String(shown));
      toggle.disabled = shown && hiddenPaths.size === mapRuns.length - 1;
    });
    fitMap();
  }));

  function nearestFrame(progress) {
    if (cur.video) return Math.round(progress * (cur.video.frames - 1));
    const target = cur.keyframes[0] + progress * (cur.keyframes.at(-1) - cur.keyframes[0]);
    return cur.keyframes.reduce((best, frame, i) => Math.abs(frame - target) < Math.abs(cur.keyframes[best] - target) ? i : best, 0);
  }

  function mapHit(e, onlyRun = null) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    let hit = null;
    for (const run of mapRuns.filter((r) => !hiddenPaths.has(r) && (!onlyRun || onlyRun === r))) {
      const { points, lengths, total } = mapTracks[run];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        const distance = Math.hypot(p.x - a[0] - t * dx, p.y - a[1] - t * dy);
        if (hit && hit.distance <= distance) continue;
        const progress = cur.video ? (i - 1 + t) / (points.length - 1) : (lengths[i - 1] + t * (lengths[i] - lengths[i - 1])) / (total || 1);
        hit = { run, distance, frame: nearestFrame(progress) };
      }
    }
    return hit;
  }

  function clearMapHover() {
    hoveredRun = null;
    mapTip.hidden = true;
    svg.classList.remove("is-highlighting");
    svg.querySelectorAll(".is-highlighted").forEach((g) => g.classList.remove("is-highlighted"));
  }

  function hoverMap(e, hit) {
    clearMapHover();
    if (!hit) return;
    hoveredRun = hit.run;
    svg.classList.add("is-highlighting");
    svg.querySelectorAll(`.trajectory-track[data-path="${hit.run}"]`).forEach((g) => g.classList.add("is-highlighted"));
    const frame = cur.video ? hit.frame : cur.keyframes[hit.frame];
    mapTip.textContent = `${hit.run === "open" ? cur.model : mapLabels[hit.run]} · ${cur.video ? "" : "≈ "}frame ${frame}`;
    const box = svg.getBoundingClientRect();
    mapTip.style.left = Math.max(78, Math.min(box.width - 78, e.clientX - box.left)) + "px";
    mapTip.style.top = Math.max(35, e.clientY - box.top - 12) + "px";
    mapTip.hidden = false;
  }

  function seekMap(e) {
    const hit = mapHit(e, dragRun);
    if (!hit) return;
    if (hit.frame !== k) showFrame(hit.frame);
    if (e.pointerType === "mouse") hoverMap(e, hit);
  }

  svg.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    userTouched = true;
    setPlaying(false);
    dragPointer = e.pointerId;
    dragRun = mapHit(e)?.run || null;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add("is-dragging");
    svg.focus({ preventScroll: true });
    seekMap(e);
  });
  svg.addEventListener("pointermove", (e) => {
    if (e.pointerId === dragPointer) seekMap(e);
    else if (dragPointer === null && e.pointerType === "mouse") hoverMap(e, mapHit(e));
  });
  function endMapDrag(e) {
    if (e.pointerId !== dragPointer) return;
    dragPointer = null;
    dragRun = null;
    svg.classList.remove("is-dragging");
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    clearMapHover();
  }
  svg.addEventListener("pointerup", endMapDrag);
  svg.addEventListener("pointercancel", endMapDrag);
  svg.addEventListener("lostpointercapture", endMapDrag);
  svg.addEventListener("pointerleave", () => { if (dragPointer === null) clearMapHover(); });
  svg.addEventListener("blur", clearMapHover);
  svg.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (step == null && !["Home", "End", " "].includes(e.key)) return;
    e.preventDefault();
    userTouched = true;
    clearMapHover();
    if (e.key === " ") { setPlaying(!playing); return; }
    setPlaying(false);
    const last = +scrub.max;
    showFrame(e.key === "Home" ? 0 : e.key === "End" ? last : Math.max(0, Math.min(last, k + step)));
  });

  /* per-frame error under the map (video mode only) */
  let stripHead = null;
  function drawStrip(s) {
    strip.replaceChildren();
    strip.hidden = !s.video;
    if (!s.video) return;
    const W = 1000, H = 150, n = s.video.frames;
    const all = PATHS.flatMap((r) => s.video.error[r]).filter((v) => v > 0);
    const lo = Math.log10(Math.max(1e-3, Math.min(...all))), hi = Math.log10(Math.max(...all));
    const X = (i) => (i / (n - 1)) * W, Y = (v) => H - 8 - ((Math.log10(Math.max(v, 1e-3)) - lo) / (hi - lo || 1)) * (H - 16);
    const g = el("svg:svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", class: "strip-svg", "aria-hidden": "true" }, strip);
    for (const r of PATHS) g.appendChild(polyline(s.video.error[r].map((v, i) => [X(i).toFixed(1), Y(v).toFixed(1)]), `s-${r}`));
    stripHead = el("svg:line", { x1: 0, x2: 0, y1: 0, y2: H, class: "s-head" }, g);
    el("p", { class: "strip-note", text: "Distance from the planned camera per frame, log scale." }, strip);
  }
  function drawStripHead(f) {
    if (!stripHead || !cur.video) return;
    const x = (f / (cur.video.frames - 1)) * 1000;
    stripHead.setAttribute("x1", x); stripHead.setAttribute("x2", x);
  }

  /* ------------------------------------------------------------ screens */
  function makeMedia(s, run, f) {
    if (s.video) {
      const v = el("video", { muted: "", playsinline: "", preload: "auto", loop: "", "aria-label": `${s.model}: ${RUNS.find((r) => r.key === run).label}` });
      v.muted = true;
      v.src = s.video.files[run];
      if (s.video.posters) v.poster = s.video.posters[run];
      return v;
    }
    const img = el("img", { alt: "", decoding: "async", loading: "lazy" });
    return setFrameImage(img, s.frames[run][f]);
  }

  function buildScreens(s) {
    grid.replaceChildren(); media = {};
    for (const r of RUNS) {
      const tile = el("figure", { class: "tile", "data-run": r.key }, grid);
      const m = makeMedia(s, r.key, k);
      tile.appendChild(m);
      el("figcaption", { class: "tag tag-" + r.key, text: r.key === "open" ? s.model : r.short }, tile);
      media[r.key] = m;
    }
    buildWipe(s);
  }

  function buildWipe(s) {
    wipeMedia.querySelectorAll("img, video").forEach((n) => n.remove());
    wipeEls = { [comparisonBase]: makeMedia(s, comparisonBase, k), ours: makeMedia(s, "ours", k), target: makeMedia(s, "target", k) };
    wipeEls[comparisonBase].classList.add("w-under");
    wipeEls.ours.classList.add("w-over");
    wipeEls.target.classList.add("w-inset");
    wipeMedia.prepend(wipeEls[comparisonBase], wipeEls.ours);
    wipeMedia.querySelector(".inset").prepend(wipeEls.target);
    updateWipeLabels();
    setWipe(wipeRange.value);
  }

  function updateWipeLabels() {
    const label = comparisonBase === "open" ? cur.model : "Re-aim";
    const tag = wipeMedia.querySelector(".w-tag-l");
    tag.className = `tag tag-${comparisonBase} w-tag-l`;
    tag.textContent = label;
    wipeRange.setAttribute("aria-label", `Move the divider between ${label} and Re-aim + RGC`);
    comparisonButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.base === comparisonBase)));
  }

  // only the videos of the view on screen are played; the hidden view's are paused and brought to the same time on a switch
  function allVideos() {
    return Object.values(view === "grid" ? media : wipeEls).filter((m) => m.tagName === "VIDEO");
  }
  function hiddenVideos() {
    return Object.values(view === "grid" ? wipeEls : media).filter((m) => m.tagName === "VIDEO");
  }

  function showFrame(f) {
    k = f;
    if (cur.video) {
      const t = f / cur.video.fps;
      allVideos().forEach((v) => { if (Math.abs(v.currentTime - t) > 0.04) v.currentTime = t; });
    } else {
      for (const [run, m] of Object.entries(media)) {
        setFrameImage(m, cur.frames[run][f]);
        m.alt = `${cur.model}, frame ${cur.keyframes[f]}: ${RUNS.find((r) => r.key === run).label.toLowerCase()}`;
      }
      for (const [run, m] of Object.entries(wipeEls)) {
        setFrameImage(m, cur.frames[run][f]);
        m.alt = `${cur.model}, frame ${cur.keyframes[f]}: ${RUNS.find((r) => r.key === run).label.toLowerCase()}`;
      }
    }
    scrub.value = f;
    updateFrameLabels(f);
    drawLive(cur, f);
  }

  function updateFrameLabels(f) {
    const frameNo = cur.video ? f : cur.keyframes[f];
    const last = cur.video ? cur.video.frames - 1 : cur.keyframes.at(-1);
    timeLabel.textContent = `Frame ${frameNo} of ${last}`;
    scrub.setAttribute("aria-valuetext", timeLabel.textContent);
    mapFrame.textContent = `Frame ${frameNo}`;
    svg.setAttribute("aria-valuemin", cur.video ? 0 : cur.keyframes[0]);
    svg.setAttribute("aria-valuemax", last);
    svg.setAttribute("aria-valuenow", frameNo);
    svg.setAttribute("aria-valuetext", timeLabel.textContent + (cur.video ? "" : "; approximate trajectory position"));
  }

  /* ------------------------------------------------------------ transport */
  function setPlaying(on) {
    playing = on;
    playBtn.setAttribute("aria-pressed", String(on));
    playBtn.querySelector(".play-label").textContent = on ? "Pause" : "Play";
    clearInterval(timer); cancelAnimationFrame(raf);
    if (!cur) return;
    if (cur.video) {
      const vids = allVideos();
      if (on) { vids.forEach((v) => v.play().catch(() => {})); raf = requestAnimationFrame(tick); }
      else vids.forEach((v) => v.pause());
    } else if (on) {
      timer = setInterval(() => showFrame((k + 1) % cur.keyframes.length), 1400);
    }
  }

  // keep every video on the master clock (the "ours" tile) and move the cameras on the map
  function tick() {
    const master = view === "grid" ? media.ours : wipeEls.ours;
    const t = master.currentTime;
    for (const v of allVideos()) if (v !== master && Math.abs(v.currentTime - t) > 0.08) v.currentTime = t;
    const f = Math.min(cur.video.frames - 1, Math.round(t * cur.video.fps));
    if (f !== k) {
      k = f; scrub.value = f;
      updateFrameLabels(f);
      drawLive(cur, f);
    }
    if (playing) raf = requestAnimationFrame(tick);
  }

  playBtn.addEventListener("click", () => { userTouched = true; setPlaying(!playing); });
  scrub.addEventListener("input", () => { userTouched = true; setPlaying(false); showFrame(+scrub.value); });

  /* ------------------------------------------------------------ views: side by side, wipe */
  function setView(v) {
    const was = playing;
    if (cur && cur.video) setPlaying(false);
    view = v;
    viewBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
    grid.hidden = v !== "grid";
    wipe.hidden = v !== "wipe";
    comparisonControls.hidden = v !== "wipe";
    updateFrameSizes();
    if (cur && cur.video) {
      hiddenVideos().forEach((x) => x.pause());
      showFrame(k);
      if (was) setPlaying(true);
    }
  }
  viewBtns.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  function setWipe(p) {
    wipeMedia.style.setProperty("--cut", p + "%");
  }
  wipeRange.addEventListener("input", () => setWipe(wipeRange.value));

  function comparisonFactor(scene) {
    const ratio = scene.errors[comparisonBase] / scene.errors.ours;
    return comparisonBase === "open" && scene.factor ? scene.factor : ratio >= 9.5 ? ratio.toFixed(0) : ratio.toFixed(1);
  }
  function updateComparisonStats() {
    const ratio = cur.errors[comparisonBase] / cur.errors.ours;
    const factor = comparisonFactor(cur);
    const better = ratio >= 1;
    const baseline = comparisonBase === "open" ? cur.model : "Re-aim";
    root.querySelector(".scene-gain").textContent = better ? `${factor}×` : "Higher error";
    root.querySelector(".scene-gain-label").textContent = better ? `lower position error vs. ${baseline} in this scene` : `Higher position error than ${baseline} in this scene`;
    root.querySelector(".scene-improvement").classList.toggle("is-failure", !better);
    scenes.forEach((scene, i) => {
      picker.children[i].querySelector(".pick-factor").textContent = `${comparisonFactor(scene)}×`;
      picker.children[i].classList.toggle("pick-worst", scene.errors[comparisonBase] < scene.errors.ours);
    });
  }
  comparisonButtons.forEach((button) => button.addEventListener("click", () => {
    if (comparisonBase === button.dataset.base) return;
    userTouched = true;
    const wasPlaying = playing;
    setPlaying(false);
    const previousBase = comparisonBase;
    comparisonBase = button.dataset.base;
    const replacement = makeMedia(cur, comparisonBase, k);
    replacement.classList.add("w-under");
    wipeEls[previousBase].replaceWith(replacement);
    delete wipeEls[previousBase];
    wipeEls[comparisonBase] = replacement;
    updateWipeLabels();
    showFrame(k);
    updateComparisonStats();
    if (wasPlaying) setPlaying(true);
  }));

  /* ------------------------------------------------------------ select a scene */
  function select(i) {
    const wasPlaying = playing;
    setPlaying(false);
    cur = scenes[i];
    [...picker.children].forEach((b, j) => { b.setAttribute("aria-selected", String(j === i)); b.tabIndex = j === i ? 0 : -1; });
    const selected = picker.children[i];
    picker.scrollTo({ left: selected.offsetLeft - (picker.clientWidth - selected.offsetWidth) / 2, behavior: reduceMotion ? "instant" : "smooth" });
    const n = cur.video ? cur.video.frames : cur.keyframes.length;
    scrub.max = n - 1;
    k = cur.video ? 0 : Math.min(k, n - 1);
    root.querySelector(".scrub-ticks").replaceChildren(
      ...(cur.video ? [] : cur.keyframes.map((f) => el("span", { text: String(f) }))));
    prepareTracks(cur);
    fitMap();
    mapTiming.textContent = cur.video ? "Markers show the measured camera position at each frame." : "Marker timing is approximate; images show five keyframes.";
    drawStrip(cur);
    buildScreens(cur);
    showFrame(k);

    const e = cur.errors, f = cur.factor;
    const better = f && parseFloat(f) >= 1;
    root.querySelector(".scene-model").textContent = cur.model;
    root.querySelector(".scene-caption").textContent = `Scene ${String(i + 1).padStart(2, "0")} / ${cur.scene} · ${cur.video ? "Video rollout" : "Paper keyframes"}`;
    updateComparisonStats();
    readout.innerHTML =
      `<strong>${cur.model}</strong>, scene ${cur.scene}. Mean position error ` +
      `<span class="r-open">World model: ${fmt(e.open)}</span>, ` +
      `<span class="r-reaim">Re-aim: ${fmt(e.reaim)}</span>, ` +
      `<span class="r-ours">Re-aim + RGC: ${fmt(e.ours)}</span>` +
      (better ? `: <span class="r-factor">${f}× lower</span>.` : `. Re-aim + RGC increases the error in this scene.`);
    if (wasPlaying || !userTouched) setPlaying(wasPlaying);
  }

  select(0);
  setView("wipe");
  // one moment of motion: start stepping through the frames once the player is on screen
  onFirstView(root, () => { if (!reduceMotion && !userTouched) setPlaying(true); });
  // pause when the player leaves the screen
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => { if (!es[0].isIntersecting && playing) setPlaying(false); }, { threshold: 0 }).observe(root);
  }
})();
