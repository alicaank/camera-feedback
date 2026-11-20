/* Presentation enhancements. Numbers and decorative paths use the exported paper data. */
(function () {
  const sceneIndex = D.player.findIndex(scene => scene.key === "matrixgame" && scene.scene === "9bc29652");
  const coverScene = D.player[sceneIndex];
  const coverImage = document.getElementById("cover-frame");
  const coverButtons = document.querySelectorAll("[data-cover-run]");
  if (coverScene) {
    function showCover(button) {
      const run = button.dataset.coverRun;
      setFrameImage(coverImage, coverScene.frames[run].at(-1));
      coverImage.alt = button.textContent + " view of the staircase scene at frame 480";
      coverButtons.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    }
    coverButtons.forEach(button => button.addEventListener("click", () => showCover(button)));
    showCover(document.querySelector('[data-cover-run="ours"]'));
    document.querySelector(".cover-demo").addEventListener("click", () => {
      document.querySelectorAll("#watch .pick")[sceneIndex].click();
    });
  }
  document.querySelectorAll("[data-model-count]").forEach((node) => { node.textContent = D.results.length; });

  const highlights = document.querySelector(".benchmark-highlights");
  for (const model of ["SANA-WM", "HY-WorldPlay", "Lyra-2"]) {
    const result = D.results.find((row) => row.model === model);
    if (!result?.arms.full || !highlights) continue;
    const ratio = result.arms.open.pos / result.arms.full.pos;
    const item = el("div", { class: "benchmark-highlight" }, highlights);
    el("span", { class: "benchmark-model", text: result.model }, item);
    el("strong", { text: `${ratio.toFixed(1)}×` }, item);
    el("span", { text: "lower mean position error" }, item);
    el("small", { text: `${fmt(result.arms.open.pos)} → ${fmt(result.arms.full.pos)} scene units` }, item);
    const bars = el("div", { class: "benchmark-comparison", "aria-hidden": "true" }, item);
    for (const [label, value] of [["World model", result.arms.open.pos], ["Re-Aim + RGC", result.arms.full.pos]]) {
      const bar = el("div", { class: "benchmark-bar" }, bars);
      el("span", { text: label }, bar);
      const track = el("div", { class: "benchmark-bar-track" }, bar);
      el("div", { class: "benchmark-bar-fill", style: `--bar-width:${100 * value / Math.max(result.arms.open.pos, result.arms.full.pos)}%` }, track);
    }
  }

  const sectionLinks = [...document.querySelectorAll(".section-links a")];
  const progress = document.querySelector(".reading-progress");
  let pending = false;
  function updateNavigation() {
    pending = false;
    const offset = document.querySelector(".site-nav").offsetHeight + 130;
    const active = sectionLinks.filter((a) => document.querySelector(a.hash)?.getBoundingClientRect().top <= offset).at(-1);
    sectionLinks.forEach((a) => {
      if (a === active) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
    const doc = document.documentElement;
    progress.style.width = `${100 * doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight)}%`;
  }
  function scheduleNavigation() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(updateNavigation);
  }
  window.addEventListener("scroll", scheduleNavigation, { passive: true });
  window.addEventListener("resize", scheduleNavigation);
  updateNavigation();

  const dialog = document.querySelector(".figure-dialog");
  const image = dialog.querySelector(".figure-dialog-image");
  document.querySelectorAll("a.zoom").forEach((link) => link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof dialog.showModal !== "function") return;
    event.preventDefault();
    image.src = link.href;
    image.alt = link.dataset.alt || link.querySelector("img").alt;
    dialog.querySelector(".figure-original").href = link.href;
    dialog.showModal();
  }));
  dialog.querySelector(".figure-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

  const demo = document.querySelector(".demo-panel");
  const fullscreen = demo.querySelector(".demo-fullscreen");
  if (document.fullscreenEnabled && typeof demo.requestFullscreen === "function") {
    fullscreen.hidden = false;
    fullscreen.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement === demo) await document.exitFullscreen();
        else await demo.requestFullscreen();
      } catch {
        fullscreen.hidden = !document.fullscreenElement;
      }
    });
    document.addEventListener("fullscreenchange", () => {
      const expanded = document.fullscreenElement === demo;
      fullscreen.setAttribute("aria-pressed", String(expanded));
      fullscreen.querySelector("span").textContent = expanded ? "Exit full screen" : "Full screen";
      fullscreen.title = expanded ? "Exit full screen (Esc)" : "Expand the demo";
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.fullscreenElement === demo) {
        event.preventDefault();
        document.exitFullscreen().catch(() => {});
      }
    });
  }
})();
