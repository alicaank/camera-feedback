/* Presentation enhancements. Numbers and decorative paths use the exported paper data. */
(function () {
  const art = document.querySelector(".hero-path-art");
  if (art && D.player.length) {
    for (const run of ["plan", "open", "ours"]) {
      art.appendChild(polyline(D.player[0].paths[run], `hero-art-${run}`));
    }
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
    image.alt = link.querySelector("img").alt;
    dialog.querySelector(".figure-original").href = link.href;
    dialog.showModal();
  }));
  dialog.querySelector(".figure-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
})();
