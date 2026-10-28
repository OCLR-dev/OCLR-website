# S11 winter asset exports

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

Use Node 24 LTS, Python-free export, npm dependencies and the configured Playwright Chromium browser:

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
