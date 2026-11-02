# #696 — S6 reusable background

2026-11-02, based on main `2fbd816bb3c63640aa763b9153a68cf2d2384d0b`.

## Finding and change

S6 used `circuit-light.svg` / `circuit-dark.svg` for the heading background,
then added `music-spectrum.svg` separately through `::before`. The shared
`seasonArtwork` map supplied only the circuit files to profile components.
The requested URL was valid, but the timeline never received the spectrum.
This happened regardless of participation. S5, for comparison, already bundles
its facets and beta into one light/dark background pair.

S6 now uses `orbital-field-light.svg` / `orbital-field-dark.svg` in both its
heading CSS and `seasonArtwork`. These self-contained, transparent SVGs embed
the existing circuit geometry and original analysed spectrum. The spectrum is
centred within a 640 × 240 canvas so the shared `cover` treatment retains it.
The independent spectrum pseudo-element is removed. Existing heading washes,
text spacing, theme tokens and the tooltip's 40% artwork opacity remain in use.
The original tournament key visual remains separate from theme artwork.

See [asset sources and regeneration](../../../public/themes/orbital-pulse/README.md).

## Verification

Node.js 24.22.2, npm, existing lockfile. PostgreSQL 17 was provisioned solely for
this session, with separate disposable `oclr_696_test` and
`oclr_696_browser_test` databases. No local configuration or existing preview
database was read or modified.

- `npm ci`: passed.
- `npm run check`: passed (lint, generated route types, TypeScript).
- `npm test`: 264 files passed; 2,281 tests passed, 2 skipped.
- `npm run build`: passed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm run read-api:check`: 57 contracts and 181 coverage rows checked; 8 tests passed.
- S6 component browser regression: 8 passed, covering desktop/mobile ×
  light/dark × participated/not participated. Verified matching heading/tooltip
  URLs, HTTP 200 and SVG MIME type, image decoding, correct S6 title/date/status,
  proportional `cover`, opacity, viewport containment, S5/S7 switching and return,
  mouse/keyboard/touch interactions, preserved edition link and no page errors.
  All 8 Axe WCAG A/AA checks passed.
- Built application `orbital-appearance.spec.ts`: 4 passed across desktop/mobile.
  Includes three locales, inherited SSR theme, image decoding, complete 1920 × 1080
  original artwork, public appearance-menu restrictions, 320–1440px layouts,
  reduced motion, forced colours and Axe checks.
- Asset regression checks that both registered S6 backgrounds embed the original
  spectrum geometry and contain no scripts or external image references.
- `git diff --check` and changed-file formatting/lint checks: passed.

The component fixture renders the actual `PlayerTimeline`, shared CSS and
translations. Its synthetic participation and S5–S7 window (axis ending April 2022) keep the neighbouring nodes accessible for touch assertions; it is not a
real player or a saved production record. Initial harness failures from missing
document metadata/shared theme CSS and overlapping synthetic touch targets were
corrected before the passing run.

Full E2E and remote full matrices were not run. Historical S6 gallery capture
was updated for the new assets but not rerun; its old evidence is historical.
CI and organizer acceptance are recorded on [#696](https://github.com/OCLR-dev/OCLR-website/issues/696).
This evidence does not establish deployment.

## Representative screenshots

All four show the reported **not participated** state:

- [Desktop dark](desktop-dark.png)
- [Desktop light](desktop-light.png)
- [Mobile dark](mobile-dark.png)
- [Mobile light](mobile-light.png)
