/* Shared helpers and page-wide behaviour. Loaded first; player.js, sim.js, gallery.js and results.js use these globals.
   Project page behaviour. Data comes from assets/js/data.js (generated from the paper by
   scripts/export_project_page.py). Edit the links here once the paper and code are public. */
const LINKS = {
  paper: "",        // e.g. "paper.pdf" or an OpenReview / CVF link
  arxiv: "",        // e.g. "https://arxiv.org/abs/XXXX.XXXXX"
  code: "",         // e.g. "https://github.com/<you>/<repo>"
};

const D = window.PAGE_DATA;
const V = window.PAGE_VIDEOS || {};
const SVG = "http://www.w3.org/2000/svg";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Match the downloaded image resolution to its displayed size and device pixel ratio.
const frameImages = window.PAGE_FRAME_IMAGES || {};
let frameSizingPending = false;
function updateFrameSizes() {
  if (frameSizingPending) return;
  frameSizingPending = true;
  requestAnimationFrame(() => {
    frameSizingPending = false;
    document.querySelectorAll("img[data-frame-image]").forEach((img) => {
      const width = Math.ceil(img.getBoundingClientRect().width);
      if (width > 0) img.sizes = width + "px";
    });
  });
}
function setFrameImage(img, src, fallbackWidth = 640) {
  const info = frameImages[src];
  if (info) {
    img.width = info.width;
    img.height = info.height;
    img.sizes = Math.ceil(img.getBoundingClientRect().width || fallbackWidth) + "px";
    img.srcset = info.srcset;
    img.dataset.frameImage = "";
    updateFrameSizes();
  } else {
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    delete img.dataset.frameImage;
  }
  img.src = src;
  return img;
}
window.addEventListener("resize", updateFrameSizes);
document.addEventListener("fullscreenchange", updateFrameSizes);

function el(tag, attrs = {}, parent) {
  const node = tag.startsWith("svg:") ? document.createElementNS(SVG, tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  if (parent) parent.appendChild(node);
  return node;
}
const fmt = (v) => (v >= 0.0995 ? v.toFixed(2) : v.toFixed(3));

/* ---------------------------------------------------------------- links */
document.querySelectorAll("[data-link]").forEach((a) => {
  const url = LINKS[a.dataset.link];
  if (url) a.href = url;
  else { a.setAttribute("aria-disabled", "true"); a.removeAttribute("href"); a.textContent += " (soon)"; }
});

function polyline(points, cls, extra = {}) {
  const d = "M" + points.map((p) => p[0] + " " + p[1]).join("L");
  return el("svg:path", { d, class: cls, ...extra });
}

/* run once when a node first scrolls into view (used to start one animation per section) */
function onFirstView(node, fn, threshold = 0.35) {
  if (!("IntersectionObserver" in window)) { fn(); return; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { threshold });
  io.observe(node);
}

/* ---------------------------------------------------------------- copy BibTeX */
document.querySelectorAll("[data-copy]").forEach((b) => {
  b.addEventListener("click", async () => {
    const text = document.querySelector(b.dataset.copy).textContent;
    try { await navigator.clipboard.writeText(text); b.textContent = "Copied"; }
    catch { b.textContent = "Select the text to copy"; }
    setTimeout(() => (b.textContent = "Copy BibTeX"), 1800);
  });
});
