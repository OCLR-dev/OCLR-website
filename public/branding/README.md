# OCLR identity

Selected official **OCLR** wordmark for **osu! Chinese League Rookie**, replacing the original flat wordmark.

- Artwork follows the organizer-selected pink/lavender geometric italic lettering: **O, C and L** share the same letter gradient and cap height; **R alone** has the more saturated pink-to-violet accent gradient.
- Preserve the four-point star above the R. **No orbital trails, slider arcs, planets, or separate ornaments**. The background stays fully transparent.
- The artwork was traced into self-contained vector outlines from the selected transparent reference image; it uses no text/font fallback or embedded bitmap. Small page header renditions remain crisp.
- `oclr-wordmark.svg` and `oclr-wordmark-dark.svg` are for **dark** surfaces. `oclr-wordmark-light.svg` uses darker OCL lettering for accessible contrast on **light** surfaces, while keeping the same vivid R/star.
- `src/components/oclr-logo.tsx` renders the same complete **OCLR** artwork, including the signature R and the star in its original position, with CSS theme-specific gradient stops. Display width: 132 px on desktop and 112 px below 400 px; preserve the **1465 × 430** viewBox ratio. Tournament wordmarks and favicon assets remain OCLR.
- The favicon is **the signature pink-to-violet R plus four-point star**, cropped and adapted from the exact vector outlines in `oclr-wordmark.svg`, replacing the old standalone O mark.
- `oclr-mark.svg`: scalable transparent R+star favicon. `oclr-mark-mono.svg`: monochrome silhouette for single-color contexts. `oclr-16.png`, `oclr-32.png`, `oclr-48.png`: matching raster browser icons; `oclr-180.png`: matching transparent Apple Touch Icon. All share the same R/star artwork and have no background.
- `src/app/layout.tsx` links SVG and PNG favicon variants and the Apple icon with a shared `v=3` URL cache-buster.
- This is independent community tournament branding, not osu!'s official logo. Do not add unlicensed osu! brand marks.

Previous wordmark versions are superseded by this design. No database or application behavior changes are needed.


## S11 local visual integration

`home-s11/` contains the approved homepage character composition: generated Liru/foreground/nebula layers and split colored vector logo. Source and attribution: `design/home-visual/layer-studio/README.md`.

`oclr-s11-winter-banner.svg` is the independent centered winter design for the S11 tournament information banner, exported by `design/home-visual/layer-studio/export-home-banner.py`. Its embedded Orion photograph credit is NASA, ESA, M. Robberto (STScI/ESA), and the Hubble Space Telescope Orion Treasury Project Team; source https://science.nasa.gov/asset/hubble/hubbles-sharpest-view-of-the-orion-nebula/ . Other seasons retain their existing artwork.

Local development preview: http://localhost:3000/ and http://localhost:3000/tournaments/s11 .


### Liru refinement

Homepage now uses `home-s11/liru-refined-v2.png`, preserving the seated pose while fixing the oversized looping hair and long neck. The built-in generation returned 1024×1536 despite requesting larger dimensions. `liru-refined-v2.svg` is a real traced vector (12,831 paths, no embedded raster); the corresponding `liru-refined-v2-vector-2048.png` is a 2048×3072 render, not additional native detail. SVG can scale its contours without raster interpolation, but automatic tracing visibly quantizes shading, so the corrected PNG remains the homepage default. Both are selectable in the layer studio. See `design/home-visual/layer-studio/liru-refinement-notes.md` and the adjacent prompt / tracing script.

The follow-up wallpaper-method pass switches the homepage to `home-s11/liru-smooth-final.svg`: color-layer Potrace with continuous Bezier outlines, cumulative masks to avoid seams, and SVGO optimization. The PNG and first tracing remain as comparisons; see the studio's `liru-refinement-notes.md` for reproduction and exact size report.

User review reverted the homepage and studio default to `liru-refined-v2.png` (corrected hair and neck). Vector variants remain backups, not the selected display asset.


PR #421 runtime-size follow-up: the homepage remains PNG-based, with palette-
compressed, alpha-preserving variants selected by native `picture` / `srcset`.
Full-resolution editing sources stay in `design/home-visual/layer-studio/assets/`.
The runtime banner embeds only a 2000×1000 crop of the original NASA photo.
See the studio README's runtime export commands for reproducible regeneration.


## Current S11 asset family — 2026-10-29

The follow-up to PR #421 replaces the existing S11 public image files with the
winter nebula / corrected Liru / constellation-R design. See
[`design/home-visual/s11-assets/README.md`](../../design/home-visual/s11-assets/README.md)
for the complete path list, source credits and reproducible export command.
`oclr-s11-logo.svg` is the complete transparent season wordmark; the global
OCLR identity above remains separate. Existing S11 square, key-visual, responsive,
background, promotional-banner and classic transparent-wordmark URLs remain valid.
The older swirl wordmark and the source studies remain historical alternatives.
