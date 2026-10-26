# S11 homepage visual studies

Branch: `codex/home-visual`; isolated worktree: `OCLR-home-visual/`.
Base: upstream/main `c34af9525764b7b74ee0c59841d47e7f68700f2e`.
Related issue: [#233](https://github.com/OCLR-dev/OCLR-website/issues/233).

## Review status

The first four proposals (`index.html`, `assets/wordmark-{a,b,c,d}.svg`) were rejected by the organizer for losing the supplied reference's composition and osu! identity. They remain as iteration history, not approved alternatives.

**Current shape draft: [`revision-04/index.html`](revision-04/index.html).**

R04 follows the organizer's new direction: literal LaTeX `\mathcal{OCL}` in Computer Modern calligraphic capitals; an R reconstructed from the supplied osu! editor screenshot's six control points, two circular arcs and shortened final line; the existing brush S11 on the right; and a horizontal accuracy bar between OCLR and the full English name. The artwork is a single-color shape proof with a restrained colored accuracy bar. The review page includes a same-coordinate R reference comparison. [Shape sources](revision-04/sources/SHAPE-SOURCES.md) record the reproducible inputs and screenshot reconstruction limits.

**R03 is preserved unchanged at the organizer's request: [`revision-03/index.html`](revision-03/index.html).**

R03 follows the organizer’s five-point revision: remove O’s disconnected left stub and all dot textures; use the actual classic osu! Legacy 激 contours (credited separately under CC BY-NC 4.0); make C taller with a repeat arrow; fill L with a ten-note numbered stream; draw R as one continuous slider from bottom-left to top to bowl to lower-right; replace the S11 separator with a symmetric yellow/green/blue hit-error bar. The review page includes an opt-in direction animation for C (out-and-back) and R (one traversal). The downloaded SVG stays static.

Previous R02: This revision rebuilds the tall/short letter structure, segmented hit-circle O, curved-slider C, tall split L, circular-bowl/diagonal-leg R, judgement badges 激/喝, and suspended S11 plate. The cursor trail follows the follow-point sequence to a distinct cursor head. The restrained regular dots and hatch bands are deterministic vector patterns.

`revision-02/oclr-s11-rhythm.svg` is the standalone native SVG wordmark: no `<image>`, `<text>`, external fonts, filters, scripts, or bitmap tracing. All lettering is outlined. The **homepage composition** SVG additionally embeds the raster mascot and background for portability; it is not an all-vector illustration.

This is a visual discussion prototype, not a new site appearance or a change to the production homepage. The header/entry controls in the artwork are layout illustrations. No live tournament state, registration dates, user account or authorization is represented. No deployment, business writes, main-branch update or claim of visual acceptance.

## Preview

From the worktree root:

```sh
python -m http.server 4178 --bind 127.0.0.1 --directory design/home-visual
```

Open `http://127.0.0.1:4178/revision-04/`. The local preview server has no database or credentials. Current outputs:

- `revision-04/oclr-s11-shapes.svg`: transparent native-vector horizontal wordmark.
- `revision-04/shape-board.png`: 1700 × 470 shape proof on white.
- `revision-04/r-geometry-review.svg`: same-coordinate R control-point comparison.
- `revision-04/sources/`: supplied references, font source, geometry and tracing provenance.

Preserved R03 outputs:

- `revision-03/oclr-s11-rhythm.svg`: editable transparent wordmark.
- `revision-03/wordmark-board.png`: 1600 × 850 wordmark review image.
- `revision-03/homepage.png`: 1600 × 900 compositional preview.
- `revision-02/reference.png`: organizer-supplied original reference, retained for local review.
- `revision-03/sources/`: pinned classic skin source, tracing script and attribution/license.

## Sources and attribution

- Organizer's attached visual reference supplies the compositional direction.
- [Liru by JerrYamada](https://oclr.org/wiki/liru), official v1.2.1 reference sheet, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `assets/liru-clean.png` is an AI-assisted adaptation using the built-in image generation tool, not a newly approved character sheet. Original appearance features are retained for review. `assets/liru-prompt.txt` records the exact prompt.
- `assets/sunset-clean.png` was made with the built-in image generation tool from the repository's `public/oclr-s11-website-background.webp`, removing the character/foreground and reducing detail. `assets/sunset-prompt.txt` records the exact prompt. The background is still generated artwork, not hand-retouched final production art.
- 激/喝 glyph outlines in R02 derive from Noto Serif CJK Black, under SIL OFL; see `revision-02/FONT-LICENSE.txt`. The rest of the wordmark geometry is authored directly.
- [osu! judgement definitions](https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu%21) confirm the Geki/激 and Katu/喝 references. This is a graphic composition, not a playable beatmap or a game-state diagram.
- Design guidance: [Refactoring UI](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md), hierarchy, typography, layout, color, and depth references.
- SVG implementation: [MDN paths](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch/Paths) and [clipping](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch/Clipping_and_masking).

## Verification and limits

- Separate worktree created after fetching upstream and origin main. Original checkout not edited or switched.
- `npm ci --no-audit --no-fund` completed using Node 24.15.0 and the existing lockfile.
- The initial four desktop/mobile compositions rendered with librsvg; preview controls were exercised in Chrome. Review found and corrected repeated DOM layer IDs and missing C/D mobile motif distinctions.
- R02 SVG XML and unique IDs checked; native-vector-only restrictions above checked. R02 board and homepage composed/rendered with librsvg and visually reviewed.
- Read-only peer review compared R02 to the reference. The disconnected cursor trail it identified was corrected to follow the point sequence.
- `node --check design/home-visual/review.js` and `git diff --check` passed.
- Application code, routes, catalogs and runtime configuration are unchanged. No application/DB suite or production build was run for these standalone visual prototypes. R02 responsive integration and organizer visual approval remain outstanding.

## R03 verification

`python design/home-visual/revision-03/draw-wordmark.py` regenerates the wordmark, 1600×850 board and homepage context. XML, unique IDs and no embedded raster/text/filter/script assertions pass. `node --check design/home-visual/revision-03/review.js` passes. Native SVG and PNG were inspected at full size; C/R endpoints are clear of the hit-error bar. No application code or configuration changes.

The Geki source is pinned to official ppy/osu-resources commit `b86b30a9c1109f612fead25c269f8ad6cae4a1c1`; its separate [provenance and license](revision-03/sources/GEKI-SOURCE.md) are retained.

R03 browser verification: Chrome loaded the native SVG and 1600×900 homepage composition; mode switching and opt-in C/R motion start/stop were exercised. Markers changed position along the paths; the C animation uses `0;1;0` key points and the R marker inherits the same translation as the letter. Peer review identified slight separator/endpoint overlap, corrected by lifting C’s tail and the complete R group.

## R04 verification

The final OCL source is literal `\mathcal{OCL}`, generated with LaTeX and dvisvgm as Computer Modern mathematical calligraphic capitals. The organizer's latest font clarification is reflected in the SVG and source. The earlier R03 files are unchanged.

`python design/home-visual/revision-04/compose.py` renders the final 1700×470 shape board and checks unique IDs and the absence of raster, text, filter or script nodes. The R screenshot geometry has measured-point, circular-arc and selected-outline checks recorded in its source document; the S11 tracing has an original-size contour comparison. Chrome loaded the composition and R comparison and exercised both view controls; the preview had no horizontal overflow at an observed 390 CSS-pixel viewport. The temporary viewport override was reset. The final calligraphic version was rendered and visually checked again. `node --check` and `git diff --check` pass.

These are standalone design artifacts. No application code, catalogs, configuration or R03 assets changed; application/DB tests and production builds were not run. Visual acceptance and homepage integration remain separate.
