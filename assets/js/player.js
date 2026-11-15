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
    { key: "open", label: "Released model, run as usual", short: "Released model" },
    { key: "reaim", label: "Ours: re-aim alone", short: "Re-aim alone" },
    { key: "ours", label: "Ours: re-aim + RGC", short: "Re-aim + RGC" },
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
  const playBtn = root.querySelector(".play");
  const scrub = root.querySelector(".scrub");
  const timeLabel = root.querySelector(".time");
  const viewBtns = root.querySelectorAll(".view-btn");

  let cur = null;            // the scene shown
  let k = 4;                 // frame mode: index into keyframes (opens on frame 480, where the runs differ most); video mode: frame number
  let playing = false, timer = null, raf = null, view = "grid", userTouched = false;
  let media = {};            // run -> <img>/<video> in the grid
  let wipeEls = {};          // run -> <img>/<video> in the wipe view

  /* ------------------------------------------------------------ picker */
  scenes.forEach((s, i) => {
    const b = el("button", { class: "pick" + (s.worst ? " pick-worst" : ""), role: "tab", type: "button" }, picker);
    el("span", { class: "pick-model", text: s.model }, b);
    el("span", { class: "pick-factor", text: s.factor ? s.factor + "×" : "" }, b);
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

  function drawStatic(s) {
    staticLayer.replaceChildren();
    liveLayer.replaceChildren();
    const ghost = !!s.video;   // with videos the full paths are faint and the live path is drawn on top
    const anim = reduceMotion || ghost ? "" : " draw";
    for (const r of PATHS) {
      staticLayer.appendChild(polyline(track(s, r), `p-${r}${ghost ? " ghost" : ""}${anim}`, { pathLength: 1 }));
    }
    staticLayer.appendChild(polyline(track(s, "plan"), "p-plan"));
    const st = track(s, "plan")[0];
    el("svg:circle", { cx: st[0], cy: st[1], r: 12, class: "m-start" }, staticLayer);
    if (!s.video) {
      // the ends of the paths: frame 480
      const ends = el("svg:g", { class: "ends" + (reduceMotion ? "" : " fade-in") }, staticLayer);
      for (const r of ["plan", ...PATHS]) {
        const q = track(s, r).at(-1);
        if (q[0] < 10 || q[0] > 990 || q[1] < 10 || q[1] > 990) continue;
        el("svg:rect", { x: q[0] - 11, y: q[1] - 11, width: 22, height: 22, class: `m-mark m-${r}` }, ends);
      }
    }
  }

  function drawLive(s, f) {
    if (!s.video) {
      staticLayer.querySelector(".ends")?.classList.toggle("now", f === s.keyframes.length - 1);
      return;
    }
    liveLayer.replaceChildren();
    for (const r of PATHS) {
      const pts = track(s, r).slice(0, f + 1);
      if (pts.length > 1) liveLayer.appendChild(polyline(pts, `p-${r}`));
    }
    for (const r of ["plan", ...PATHS]) {
      const q = track(s, r)[Math.min(f, track(s, r).length - 1)];
      if (q[0] < 0 || q[0] > 1000 || q[1] < 0 || q[1] > 1000) continue;
      el("svg:circle", { cx: q[0], cy: q[1], r: r === "plan" ? 10 : 14, class: `cam cam-${r}` }, liveLayer);
    }
    drawStripHead(f);
  }

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
    const img = el("img", { alt: "", decoding: "async" });
    img.src = s.frames[run][f];
    return img;
  }

  function buildScreens(s) {
    grid.replaceChildren(); media = {};
    for (const r of RUNS) {
      const tile = el("figure", { class: "tile", "data-run": r.key }, grid);
      const m = makeMedia(s, r.key, k);
      tile.appendChild(m);
      el("figcaption", { class: "tag tag-" + r.key, text: r.short }, tile);
      media[r.key] = m;
    }
    wipeMedia.querySelectorAll("img, video").forEach((n) => n.remove());
    wipeEls = { open: makeMedia(s, "open", k), ours: makeMedia(s, "ours", k), target: makeMedia(s, "target", k) };
    wipeEls.open.classList.add("w-under");
    wipeEls.ours.classList.add("w-over");
    wipeEls.target.classList.add("w-inset");
    wipeMedia.prepend(wipeEls.open, wipeEls.ours);
    wipeMedia.querySelector(".inset").prepend(wipeEls.target);
    setWipe(wipeRange.value);
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
        m.src = cur.frames[run][f];
        m.alt = `${cur.model}, frame ${cur.keyframes[f]}: ${RUNS.find((r) => r.key === run).label.toLowerCase()}`;
      }
      for (const [run, m] of Object.entries(wipeEls)) m.src = cur.frames[run][f];
    }
    scrub.value = f;
    const frameNo = cur.video ? f : cur.keyframes[f];
    const last = cur.video ? cur.video.frames - 1 : cur.keyframes.at(-1);
    timeLabel.textContent = `Frame ${frameNo} of ${last}`;
    scrub.setAttribute("aria-valuetext", timeLabel.textContent);
    drawLive(cur, f);
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
      timeLabel.textContent = `Frame ${f} of ${cur.video.frames - 1}`;
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

  /* ------------------------------------------------------------ select a scene */
  function select(i) {
    const wasPlaying = playing;
    setPlaying(false);
    cur = scenes[i];
    [...picker.children].forEach((b, j) => { b.setAttribute("aria-selected", String(j === i)); b.tabIndex = j === i ? 0 : -1; });
    const n = cur.video ? cur.video.frames : cur.keyframes.length;
    scrub.max = n - 1;
    k = cur.video ? 0 : Math.min(k, n - 1);
    root.querySelector(".scrub-ticks").replaceChildren(
      ...(cur.video ? [] : cur.keyframes.map((f) => el("span", { text: String(f) }))));
    drawStatic(cur);
    drawStrip(cur);
    buildScreens(cur);
    showFrame(k);

    const e = cur.errors, f = cur.factor;
    const better = f && parseFloat(f) >= 1;
    readout.innerHTML =
      `<strong>${cur.model}</strong>, scene ${cur.scene}. Mean position error ` +
      `<span class="r-open">${fmt(e.open)}</span> run as usual, ` +
      `<span class="r-reaim">${fmt(e.reaim)}</span> with re-aiming alone, ` +
      `<span class="r-ours">${fmt(e.ours)}</span> with RGC` +
      (better ? `: <span class="r-factor">${f}× lower</span>.` : `. Here feedback does not help.`);
    if (wasPlaying || !userTouched) setPlaying(wasPlaying);
  }

  select(0);
  setView("grid");
  // one moment of motion: start stepping through the frames once the player is on screen
  onFirstView(root, () => { if (!reduceMotion && !userTouched) setPlaying(true); });
  // pause when the player leaves the screen
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => { if (!es[0].isIntersecting && playing) setPlaying(false); }, { threshold: 0 }).observe(root);
  }
  // fetch the other scenes' frames after the page has loaded, so switching is instant
  window.addEventListener("load", () => scenes.forEach((s) => s.frames && Object.values(s.frames).flat().forEach((src) => { const im = new Image(); im.src = src; })));
})();
