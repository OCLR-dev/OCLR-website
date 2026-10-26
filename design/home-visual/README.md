# S11 homepage visual studies

Branch: `codex/home-visual`; isolated worktree: `OCLR-home-visual/`.
Base: upstream/main `c34af9525764b7b74ee0c59841d47e7f68700f2e`.
Related issue: [#233](https://github.com/OCLR-dev/OCLR-website/issues/233).

## Review status

The first four proposals (`index.html`, `assets/wordmark-{a,b,c,d}.svg`) were rejected by the organizer for losing the supplied reference's composition and osu! identity. They remain as iteration history, not approved alternatives.

**Current draft: [`revision-02/index.html`](revision-02/index.html).** This revision rebuilds the tall/short letter structure, segmented hit-circle O, curved-slider C, tall split L, circular-bowl/diagonal-leg R, judgement badges 激/喝, and suspended S11 plate. The cursor trail follows the follow-point sequence to a distinct cursor head. The restrained regular dots and hatch bands are deterministic vector patterns.

`revision-02/oclr-s11-rhythm.svg` is the standalone native SVG wordmark: no `<image>`, `<text>`, external fonts, filters, scripts, or bitmap tracing. All lettering is outlined. The **homepage composition** SVG additionally embeds the raster mascot and background for portability; it is not an all-vector illustration.

This is a visual discussion prototype, not a new site appearance or a change to the production homepage. The header/entry controls in the artwork are layout illustrations. No live tournament state, registration dates, user account or authorization is represented. No deployment, business writes, main-branch update or claim of visual acceptance.

## Preview

From the worktree root:

```sh
python -m http.server 4178 --bind 127.0.0.1 --directory design/home-visual
```

Open `http://127.0.0.1:4178/revision-02/`. The local preview server has no database or credentials. Current outputs:

- `revision-02/oclr-s11-rhythm.svg`: editable transparent wordmark.
- `revision-02/wordmark-board.png`: 1600 × 850 wordmark review image.
- `revision-02/homepage.png`: 1600 × 900 compositional preview.
- `revision-02/reference.png`: organizer-supplied reference, retained for this local review.

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
