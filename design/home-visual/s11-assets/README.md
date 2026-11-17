## Logo synchronization — 2026-11-17

`public/branding/home-s11/oclr-layer.svg` is the source for the constellation
R geometry, continuous purple opacity shading and tail control point. Run:

```sh
python3 design/home-visual/s11-assets/sync-logo.py
python3 design/home-visual/s11-assets/sync-logo.py --check
PLAYWRIGHT_CHANNEL=chromium node design/home-visual/s11-assets/export.mjs --logo-only
```

The full exporter runs synchronization before reading its sources.
`--logo-only` skips the text-free website background to preserve its existing
encoding byte for byte. The banner
exporter also synchronizes the centered studio source before rendering.
`sync-logo.py` updates the full season logo, alternate layout, embedded winter
banner and active studio sources. Each embedded R gets local, uniquely named
filter/mask definitions. It preserves the surrounding artwork and placement.
Selected weight B uses a 27-unit inward outline (3× the original 9), with
109-unit inner track, 55.25-unit cap radius, 27.0621-unit highlight width and
18.7931-unit blur. The outer contour and control points remain fixed.

The header variants retain their separate light/dark OCL palettes and R outline
colors. Their R fill follows the same alpha-only shading, using the outline
color at 6% base opacity and a 40% blurred centreline highlight; backgrounds
remain visible through the track. Tail stars and control guides share the
canonical geometry.
Historical `revision-*` studies, the alternate swirl identity and favicons are
not export masters for this logo family.

The raster exports must be regenerated after SVG synchronization: updating a
vector source cannot change an already flattened WebP or PNG. Keep existing
URLs and dimensions so saved edition branding continues to resolve. The
website background contains no lettering; a logo-only refresh should leave
that output identical. The `--check` command detects stale vector copies
without writing files; it does not assert that raster exports are current.

# S11 tournament asset exports

## Current homepage artwork — 2026-11-03 (#754)

The organizer selected the current homepage's nebula and Chinese-outfit Liru
for the tournament background and key visual. `export-current-hero.mjs` renders
the checked-in `public/branding/home-hero/nebula-v2-2560.webp`,
`liru-cn-v3-1111.webp`, `ink-mist.webp` and the homepage's unchanged
`home-s11/oclr-layer.svg`, `season-layer.svg`, `katu-cropped.svg` layers.
It uses the homepage's dark left-side shading, 12% ink mist and logo colours,
with the character on the right and an artwork-only layout.

The existing branding URLs remain the delivery paths: the key visual is
1920×1080, its six `enhanced-{width}` variants remain 640, 960, 1280, 1920,
2560 and 3840 pixels wide at 16:9, and the text-free website background is
3840×1800. The `enhanced` filename is a compatibility name; these exports
flatten existing layers and interpolate their source resolution.
The square logo, standalone wordmarks, promotional banner and other seasons
are outside this refresh.

With Node 24 LTS and the existing npm dependencies, reproduce only these eight
outputs using a configured Playwright browser:

```sh
PLAYWRIGHT_CHANNEL=chrome node design/home-visual/s11-assets/export-current-hero.mjs
```

The complete exporter below delegates its hero outputs to the same function,
so it also retains the current artwork. Both commands read only checked-in
assets and do not run the app or access a database. No new illustration is
generated. Sources and credits follow the
[current homepage asset ledger](../../../public/branding/README.md#layered-homepage-hero--2026-10-31-233):
Liru by **JerrYamada**, **CC BY 4.0**, AI-assisted with Grok and retouched;
the nebula and ink mist retain their recorded provenance.

## Original winter family — 2026-10-29

Organizer-requested asset-only follow-up to [PR #421](https://github.com/OCLR-dev/OCLR-website/pull/421), based on merged main `01263bb` (export branch starts at `9e10f72`). Reuses the approved winter nebula, corrected Liru, pastel OCL, constellation R, timing bar, independent 喝 and S11 layers. No new illustration is generated.

## Deliverables

Existing URLs and pixel dimensions are preserved so stored branding values and current components continue to work:

| Public path                                  | Dimensions                | Export                                                                       |
| -------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `/branding/oclr-s11-logo.svg`                | 1200×490 viewBox          | Complete transparent season logo, copied from the studio's `assets/logo.svg` |
| `/oclr-s11-classic-wordmark-soft.png`        | 2086×754                  | Transparent PNG of the winter season logo                                    |
| `/oclr-s11-classic-wordmark.png`             | 2087×754                  | Same winter logo, preserving this existing URL's canvas                      |
| `/oclr-s11-square-logo.webp`                 | 1200×1200                 | Winter wordmark on a quiet nebula field for existing square thumbnails       |
| `/oclr-s11-key-visual.webp`                  | 1920×1080                 | Character composition adapted to the existing 16:9 canvas                    |
| `/oclr-s11-key-visual-enhanced-{width}.webp` | 640×360 through 3840×2160 | Existing six responsive widths: 640, 960, 1280, 1920, 2560, 3840             |
| `/oclr-s11-website-background.webp`          | 3840×1800                 | The same scene without lettering, preserving the background canvas           |
| `/oclr-s11-banner.webp`                      | 3840×1280                 | Wide promotional export of the centered winter banner                        |

The existing `/branding/oclr-s11-winter-banner.svg` from #421 already supplies the centered overview banner and is unchanged. The promotional export widens its photographic backdrop while retaining the centered logo and frame proportions. The key visual preserves the homepage's layer placement, with the nebula covering the existing 16:9 canvas. It contains artwork only, without entry links or navigation.

All original studio files, prior generation outputs, alternate swirl wordmarks, global header/favicons and other seasons remain intact. The `enhanced` filenames are compatibility URLs, not a new enhancement claim. Large exports interpolate the existing 2048px nebula and 1024×1536 character; they do not recover native 4K detail. Vector lettering is rasterized at the export density.

## Reproduce

Use Node 24 LTS, Python 3, npm dependencies and the configured Playwright Chromium browser:

```sh
npm ci
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium node design/home-visual/s11-assets/export.mjs
```

Chromium renders the existing SVG filters, alpha and CSS perspective. Sharp produces the WebP delivery files and palette-compressed transparent PNGs. The script resolves paths relative to itself, reads only checked-in artwork, and writes only the deliverables above. It does not run the app, read environment files, contact a backend or modify studio browser saves.

## Sources and credits

- [Layer studio source/attribution](../layer-studio/README.md) and its retained prompts: nebula, foreground and corrected Liru are existing AI-assisted adaptations from #421.
- Liru original character design: **JerrYamada**, [character sheet](https://oclr.org/wiki/liru), **CC BY 4.0**. Preserve attribution when sharing the character visual.
- Promotional/overview banner photograph: **NASA, ESA, M. Robberto (STScI/ESA), Hubble Space Telescope Orion Treasury Project Team**, [Hubble's Sharpest View of the Orion Nebula](https://science.nasa.gov/asset/hubble/hubbles-sharpest-view-of-the-orion-nebula/). Uses the already cropped/compressed photo embedded in #421's SVG, retaining the SVG credit.
- Logo geometry and provenance remain in the studio sources and earlier design notes; no external font or asset is fetched by the export.

These are S11 season assets. They do not replace the global OCLR header identity or indicate tournament publication, release acceptance or deployment.

## Verification

Performed with Node 24.22.1: `npm ci`; exporter execution in Chromium; visual review of the logo, square thumbnail, character visual and wide banner; Sharp decoding of all 12 raster outputs at their existing dimensions; transparent PNG alpha range 0–255; SVG XML parsing and exact match to the studio logo; ESLint and Prettier for the exporter; `node --check`; `git diff --check`. The existing tournament-branding and homepage-registration unit files passed (12 tests).

The diff contains only assets, this export tool and documentation. Application code, CSS, locale catalogs, database/seed configuration and lockfiles are unchanged. The full application build, database suite and full E2E matrix were not rerun for this asset-only change; new PR CI and organizer review remain separate evidence.
