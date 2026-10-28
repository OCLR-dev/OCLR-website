# S11 homepage visual studies

Branch: `codex/home-visual`; isolated worktree: `OCLR-home-visual/`.
Base: upstream/main `c34af9525764b7b74ee0c59841d47e7f68700f2e`.
Related issue: [#233](https://github.com/OCLR-dev/OCLR-website/issues/233).

## Review status

The first four proposals (`index.html`, `assets/wordmark-{a,b,c,d}.svg`) were rejected by the organizer for losing the supplied reference's composition and osu! identity. They remain as iteration history, not approved alternatives.

**Current shape draft: [`revision-05/index.html`](revision-05/index.html).**

R05 is a separate angular OCL / S11 study, preserving the exact R04 slider R, control points, connecting polygon and accuracy-bar/name placement. The upper-right 喝 reuses the exact R03 Noto Serif CJK Black glyph path. Main-letter interiors remain transparent. **R04 is preserved unchanged** at the organizer’s request. See [R05 sources and verification](revision-05/README.md).

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

Open `http://127.0.0.1:4178/revision-05/`. The local preview server has no database or credentials. Current outputs:

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

The follow-up weight adjustment thickens only OCL inside each original glyph bounding box. The cap height, glyph widths, TeX spacing and placement stay fixed; comparison with the preceding PNG confirms no changed pixels outside OCL.

`python design/home-visual/revision-04/compose.py` renders the final 1700×470 shape board and checks unique IDs and the absence of raster, text, filter or script nodes. The R screenshot geometry has measured-point, circular-arc and selected-outline checks recorded in its source document; the S11 tracing has an original-size contour comparison. Chrome loaded the composition and R comparison and exercised both view controls; the preview had no horizontal overflow at an observed 390 CSS-pixel viewport. The temporary viewport override was reset. The final calligraphic version was rendered and visually checked again. `node --check` and `git diff --check` pass.

These are standalone design artifacts. No application code, catalogs, configuration or R03 assets changed; application/DB tests and production builds were not run. Visual acceptance and homepage integration remain separate.

R04 display update: the current wordmark uses transparent outline interiors, including the existing weighted OCL silhouette and brush S11. The R control points and connecting polygon are visible directly in the composition. Vector luminance masks preserve the slider silhouette union without white cover shapes; the transparent SVG and white review board are separate exports.

## Layout B homepage integration

The organizer selected cover study B, clarified that existing homepage character/background must stay unchanged, and requested one marker in the 100 region of an outline-only timing bar. `revision-06/compose.py` builds `public/branding/oclr-s11-layout-b.svg` from preserved R05 geometry: horizontal OCLR, small S11 above O, Katu above R, transparent bar with one early-100 marker at 25% of its width. The homepage references that SVG and adds responsive sizing only; its background expression, artwork, entry links and data logic are unchanged. `npm run check` passed. The organizer authorized replacing the previous development server on port 3000. This worktree now serves that port using anonymous public remote reads. Upstream main `cfec957` was merged to match the deployed theme and artwork read contracts; Chrome verified the homepage with the new vector wordmark and existing character/background. The original checkout files remain unchanged.

### Right-aligned S11 refinement

At the organizer’s request, the R06 composition now places the small S11 to the right of OCLR on the same baseline (y=386), preserving its scale and existing paths. The SVG canvas widens to 1160 × 490; the homepage uses matching intrinsic dimensions and a smaller display width (50vw, capped at 48rem; 90% of the content column on mobile). `npm run check`, native SVG validation and `git diff --check` passed; librsvg rendering was inspected. The browser preview returned `REMOTE_FORBIDDEN`, so full-page desktop/mobile visual verification remains pending. No server configuration, data, deployment or remote publication changed.

Follow-up: enlarged S11 from 0.23 to 0.30 source scale (about 30%, baseline still y=386); widened the canvas to 1200 × 490 to avoid clipping. The homepage wordmark moves upward by 16–32 CSS pixels responsively, with entry links retaining their positions. SVG rendering, `npm run check` and `git diff --check` passed. Full-page browser verification remains limited by the previously observed remote preview rejection.

Acc-bar refinement: restored four internal boundary lines at the original R05 region positions (15%, 35%, 65%, 85%), giving five transparent outlined regions. The separate early-100 marker stays at 25% and extends beyond the bar; region dividers stay inside it. SVG structural assertions, librsvg visual inspection and `git diff --check` passed. Only the SVG asset and its generator/documentation changed; application tests were not rerun.

### Local preview navigation fix

The browser sent `Sec-Fetch-Site: cross-site` for a top-level document navigation to the correct loopback host. The blanket remote transport check rejected it before rendering. The proxy now accepts GET document navigations outside API/auth routes, while preserving exact-host validation and rejection of cross-site fetches, frames and writes. After reconnecting anonymous public reads (the first backend attempt timed out), Chrome loaded the homepage and latest SVG. Fourteen focused proxy/remote tests and `npm run check` passed; full DB/E2E suites were not run for this focused fix.

### Developer connection origin correction

The operator’s existing Developer token was bound to `http://localhost:3000`, while this preview had been launched with `APP_URL=http://127.0.0.1:3000`. The backend correctly returned `ORIGIN_NOT_ALLOWED`, but the frontend incorrectly collapsed every 403 into a scope/grant error. The preview now runs independently in the background with `APP_URL=http://localhost:3000` (still bound to loopback); use that exact address. The transport preserves an allowlist of origin/scope/grant denial codes and uses existing localized messages, while the connection page shows its configured local origin. Unknown backend messages are not relayed. The existing token connected successfully with all four requested scopes; no grants or credentials were created or changed. 24 focused remote/i18n tests and lint/type checks passed; the final existing-label addition also passed targeted ESLint/format checks. No full DB/E2E suite or deployment was performed.

## R07 layered banner studio

The organizer requested separate background/foreground/character plates with editable perspective. [layer-studio/index.html](layer-studio/index.html) now provides a standalone local composition page with ImageGen city, alpha Liru and alpha stone-step assets, the unchanged current outline SVG, and an independent right-to-left shade layer. Direct layer and canvas +/- buttons were added after organizer feedback. Existing source/homepage assets remain intact. See [asset provenance, prompts and operation notes](layer-studio/README.md). The current studio is served independently on loopback 4178; a separate browser review instance on 4179 uses isolated localStorage. No token or backend is needed.
