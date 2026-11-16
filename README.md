# Taking the Road Not Taken

Static page for "Taking the Road Not Taken: Correcting Trajectory Drift in Frozen Video World Models". No build step, no external requests: fonts, figures and data are all in this folder.

## Deploy on GitHub Pages

1. Create a repository (for example `camera-feedback`) and push the contents of this folder to its `main` branch, with `index.html` at the top level.
2. In the repository go to Settings → Pages, choose "Deploy from a branch", branch `main`, folder `/ (root)`, and save.
3. After a minute the page is live at `https://<user>.github.io/<repo>/`.

`.nojekyll` is included so GitHub serves every file as is.

To put the page under a `docs/` folder of the code repository instead, copy this folder to `docs/` and pick `/docs` in step 2.

## Before you publish

- During CVPR review the page stays anonymous. Keep "Anonymous authors", keep the repository private or unlisted, and do not link it from the paper or social media until the review rules allow it.
- Once allowed, fill in the links at the top of `assets/js/common.js` (`LINKS`: paper, arXiv, code). Empty links show as "(soon)" and are not clickable.
- Replace the author line in `index.html` (`data-config="authors"`), the venue line, and the BibTeX entry.
- Optional: set `og:image` in `index.html` to an absolute URL so link previews show the figure.

## What is on the page

- **Rollout player** (top): seven scenes from the paper, selected with thumbnail tabs. Opens in a large wipe comparison with the recording inset; **All four views** shows the recording, World model, Re-aim and Re-aim + RGC together. Drag a path or use the arrow keys to scrub the trajectory, toggle paths in the legend, and choose **Fit paths** or **Focus plan**. Without videos it steps through frames 1, 120, 240, 360 and 480 of the paper's frame sheets. Figure traces have no timestamps, so marker timing is approximated by distance along each path; video entries use their measured per-frame camera positions.
- **Comparison controls**: compare World model with Re-aim + RGC, or Re-aim with Re-aim + RGC. The displayed scene reduction updates to match the selected baseline. **Full screen** expands the demo on supported browsers; Escape returns to the page.
- **Method overview**: three steps and an expandable paper figure.
- **Examples**: all nine frame sheets, filtered by model or the failure case. Initially shows four cards; **Show all examples** reveals the rest. Drag across a frame to compare World model with Re-aim + RGC, pick the frame, or open all frames.
- **Frame images**: supplied high-resolution JPEGs are preserved as originals. Responsive 160px and 640px previews keep thumbnails and smaller displays lightweight. Images retain their full field of view, with letterboxing where aspect ratios differ. The player loads frames as needed rather than downloading every scene on page load.
- **Simulation**: a 2D simulation in the browser (`assets/js/sim.js`) comparing World model, Re-aim and Re-aim + RGC.
- **Results chart** for all eight models, with selected benchmark mean reductions computed directly from the exported results, the full table behind "Show all numbers", and the error over time. Benchmark means are labelled separately from individual scene reductions.

## Adding the rollout videos

The page is ready for the full videos; they live on the machine that ran the evaluation, so they are added there:

1. Write a `videos.json` listing the scenes, each with its ViPE report and which scored arm is World model, Re-aim and Re-aim + RGC (format at the top of `paper/scripts/export_videos.py`).
2. Run `python paper/scripts/export_videos.py --page project_page --manifest videos.json --scorer <path to vipe_eval/score.py>`.
3. Copy `assets/video/` and `assets/js/videos.js` back into this folder.

Each scene becomes four H.264 videos (about 1 to 3 MB each at 288 px high) and its measured cameras. The player then plays them in sync and moves every camera along its path frame by frame, with the error per frame underneath. Scenes are added to `videos.js`, so they can be exported one at a time; a scene that is not one of the seven gets its own button.

GitHub Pages serves files up to 100 MB and sites up to about 1 GB, so a few dozen scenes are fine. For many more, host the videos elsewhere (for example a Hugging Face dataset) and point the `files` entries in `videos.js` there.

## Updating numbers and figures

Everything shown comes from the paper scripts. After the paper changes, run

```
python3 paper/scripts/export_project_page.py
```

It rewrites `assets/js/data.js` (player scenes, examples, results), the frames in `assets/frames/`, and the figure PNGs in `assets/img/`. Edit the text in `index.html` by hand.

To use the supplied high-resolution frames after exporting, run:

```sh
python3 scripts/import_high_res_frames.py /path/to/high-res-imgs.zip
```

This checks that the archive matches all existing frame filenames, copies the original JPEGs without re-encoding, and generates the previews and `assets/js/frames.js` manifest. It requires Pillow. Load `frames.js` before `common.js` so the player and gallery can select the appropriate image resolution.

After regenerating paper figure PNGs, run `python3 scripts/build_web_figures.py` to rebuild the SVG presentation copies. These preserve the PNGs as embedded images and replace only the legend labels with World model, Re-aim, and Re-aim + RGC. The website and figure viewer use these SVG copies.

## Preview locally

```
python3 -m http.server 8000
```

then open http://localhost:8000.

## Files

- `index.html`: the page
- `assets/css/style.css`: styles, including self-hosted fonts
- `assets/css/presentation.css`: presentation, typography, responsive page layout
- `assets/js/common.js`: links, shared helpers, copy button
- `assets/js/player.js`: rollout player (frames or videos)
- `assets/js/sim.js`: toy loop
- `assets/js/results.js`: results chart and tables
- `assets/js/examples.js`: examples
- `assets/js/presentation.js`: data-derived highlights, section navigation, figure viewer
- `assets/js/data.js`: generated from the paper (do not edit)
- `assets/js/frames.js`: generated frame dimensions and responsive image candidates
- `assets/js/videos.js`: generated by `export_videos.py` (empty until then)
- `assets/fonts/`: Schibsted Grotesk and Source Serif 4 (SIL Open Font License, licenses included)
- `assets/img/`: figures
- `assets/frames/`: frames of the player and the examples
- `scripts/import_high_res_frames.py`: import supplied JPEGs and generate responsive previews
- `scripts/build_web_figures.py`: rebuild the figure presentation labels without redrawing plotted data
