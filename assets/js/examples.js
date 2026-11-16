/* Examples: every frame sheet of the paper as a card. Drag across the frame to compare the released model with ours;
   the recording at the planned pose sits in the corner. "All frames" opens the full sheet: 4 runs x 5 frames.
   Data: PAGE_DATA.examples. */
(function () {
  const root = document.getElementById("examples");
  if (!root) return;
  const grid = root.querySelector(".ex-grid");
  const ROWS = [
    { key: "target", label: "Recording" },
    { key: "open", label: "Released model" },
    { key: "reaim", label: "Re-aim alone" },
    { key: "ours", label: "Re-aim + RGC" },
  ];

  D.examples.forEach((x, n) => {
    const last = x.keyframes.length - 1;
    const card = el("article", { class: "ex-card" + (x.worse ? " ex-worse" : "") }, grid);
    const head = el("header", { class: "ex-head" }, card);
    const identity = el("div", {}, head);
    el("h3", { text: x.model }, identity);
    el("span", { class: "ex-scene", text: `Scene ${x.scene}` }, identity);
    el("span", { class: "ex-factor", text: x.worse ? "Feedback fails here" : `${x.factor}× lower camera error` }, head);

    // the wipe
    const media = el("div", { class: "wipe-media ex-wipe" }, card);
    const img = (row, f, cls) => el("img", { src: x.frames[row][f], class: cls, alt: "", loading: "lazy", decoding: "async", width: 640, height: 370 }, media);
    const under = img("open", last, "w-under");
    const over = img("ours", last, "w-over");
    el("span", { class: "wipe-line", "aria-hidden": "true" }, media);
    el("span", { class: "tag tag-open w-tag-l", text: "Released model" }, media);
    el("span", { class: "tag tag-ours w-tag-r", text: "Re-aim + RGC" }, media);
    const inset = el("figure", { class: "inset" }, media);
    const rec = el("img", { src: x.frames.target[last], alt: "", loading: "lazy", decoding: "async" }, inset);
    el("figcaption", { class: "tag tag-target", text: "Recording" }, inset);
    const range = el("input", { class: "wipe-range", type: "range", min: 0, max: 100, value: 50, "aria-label": `${x.model}: move the divide between the released model and ours` }, media);
    range.addEventListener("input", () => media.style.setProperty("--cut", range.value + "%"));

    // frame chips
    const bar = el("div", { class: "ex-bar" }, card);
    const chips = el("div", { class: "ex-frames", role: "radiogroup", "aria-label": `${x.model}: frame` }, bar);
    el("span", { class: "ex-frames-label", text: "Frame" }, chips);
    const show = (f) => {
      under.src = x.frames.open[f]; over.src = x.frames.ours[f]; rec.src = x.frames.target[f];
      const label = `${x.model}, frame ${x.keyframes[f]}`;
      under.alt = `${label}: released model`; over.alt = `${label}: with our feedback`; rec.alt = `${label}: recording at the planned pose`;
      chips.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-checked", String(i === f)));
    };
    x.keyframes.forEach((fr, i) => {
      const b = el("button", { type: "button", role: "radio", class: "ex-chip", text: String(fr) }, chips);
      b.addEventListener("click", () => show(i));
    });
    show(last);

    // the full sheet
    const more = el("button", { type: "button", class: "ex-more", "aria-expanded": "false", text: "All frames" }, bar);
    const strip = el("div", { class: "ex-strip", hidden: "", id: `ex-strip-${n}` }, card);
    more.setAttribute("aria-controls", strip.id);
    more.addEventListener("click", () => {
      const open = strip.hidden;
      if (open && !strip.childElementCount) {
        const head = el("div", { class: "ex-row ex-row-head" }, strip);
        el("span", {}, head);
        x.keyframes.forEach((f) => el("span", { text: String(f) }, head));
        for (const r of ROWS) {
          const row = el("div", { class: `ex-row ex-row-${r.key}` }, strip);
          el("span", { class: "ex-row-label", text: r.label }, row);
          x.frames[r.key].forEach((src, i) => el("img", { src, alt: `${x.model}, frame ${x.keyframes[i]}: ${r.label.toLowerCase()}`, loading: "lazy", decoding: "async" }, row));
        }
      }
      strip.hidden = !open;
      more.setAttribute("aria-expanded", String(open));
      more.textContent = open ? "Fewer frames" : "All frames";
    });

    const e = x.errors;
    el("p", { class: "ex-nums", html: `Scene ${x.scene}. Mean position error <span class="r-open">${fmt(e.open)}</span> run as usual, <span class="r-reaim">${fmt(e.reaim)}</span> with re-aiming alone, <span class="r-ours">${fmt(e.ours)}</span> with RGC.` + (x.worse ? " The RGC run follows the plan until about frame 330, then runs past its end and loses the scene." : "") }, card);
  });

  const filters = root.querySelector(".gallery-filters");
  const moreButton = root.querySelector(".gallery-more");
  const count = root.querySelector(".gallery-count");
  const cards = [...grid.children];
  let activeModel = "all", expanded = false;
  const choices = [{ key: "all", label: "All models" }, ...[...new Set(D.examples.map((x) => x.model))].map((model) => ({ key: model, label: model })), { key: "failure", label: "Failure case" }];
  function updateGallery() {
    const matching = D.examples.map((x, i) => ({ x, i })).filter(({ x }) => activeModel === "all" || (activeModel === "failure" ? x.worse : x.model === activeModel));
    const shown = activeModel === "all" && !expanded ? matching.slice(0, 4) : matching;
    const visible = new Set(shown.map(({ i }) => i));
    cards.forEach((card, i) => { card.hidden = !visible.has(i); });
    filters.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.model === activeModel)));
    count.textContent = `${shown.length} of ${matching.length} scenes`;
    moreButton.hidden = activeModel !== "all" || matching.length <= 4;
    moreButton.setAttribute("aria-expanded", String(expanded));
    moreButton.textContent = expanded ? "Show fewer examples ↑" : `Show all ${matching.length} examples ↗`;
  }
  choices.forEach(({ key, label }) => {
    const button = el("button", { type: "button", class: "gallery-filter", "data-model": key, text: label }, filters);
    button.addEventListener("click", () => { activeModel = key; updateGallery(); });
  });
  moreButton.addEventListener("click", () => {
    expanded = !expanded;
    updateGallery();
    if (!expanded) root.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" });
  });
  updateGallery();
})();
