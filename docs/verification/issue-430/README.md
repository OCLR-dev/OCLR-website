# #430 verification

All dates, names, identities and screenshots in this directory use synthetic
fixtures in a dedicated disposable PostgreSQL database. No live S11 configuration
or production service was changed.

Implementation coverage:
- Schema tests: fixed kinds, impossible calendar dates, reversed intervals,
  optional endpoints, legacy rows.
- Shared model tests: registration plus both phase types, literal names,
  duplicate suppression without data mutation, TBA, timezone formatting,
  start/end boundaries, gaps, overlaps, partial intervals and draft precedence.
- Storage integration: save/reload, unchanged registration, stale revisions,
  non-Admin rejection, invalid input and automatic audit.
- Browser regression: settings save/reload and both public overview sections,
  desktop/mobile, default/pastel/Swiss light and dark; screenshot evidence.
- Generated read OpenAPI remains synchronized.

Validation results and remaining limitations are recorded in the issue handoff.
New Chinese wording requires organizer review. Implementation and local test
evidence do not establish release acceptance or deployment.

## Local results (2026-10-29, Asia/Taipei)

Node.js 24.22.2; PostgreSQL 17 in an isolated cluster on loopback port 55443.
Separate databases were used for integration, broad browser and focused browser
checks.

- `npm ci`, `npm run check`, `npm run build`, `npm audit --omit=dev`
  passed (audit: zero vulnerabilities).
- `npm run i18n:extract` completed; the focused i18n/contract/timeline run
  passed 19 tests. A separate storage integration run passed 27 tests.
- Focused `competition-timeline.spec.ts`: 2 passed, desktop and mobile.
  This also checks default, cute-pastel and swiss-minimal in light/dark.
- A broad desktop/mobile E2E run was stopped by its explicit three-failure
  limit: 15 passed, 3 failed, 906 not run. The first failure was a trace-file
  collision caused by concurrent verification; its isolated rerun passed.
  The other two failures reproduced on the consolidated rerun:
  `admin-polish.spec.ts:292` selects both the saved notice and loading overlay
  with an unqualified status locator; `archive-artwork.spec.ts:100` counts
  eight failed image requests against an expected maximum of six.
  These concern general settings and archive cover behavior, and this patch
  does not change those implementations. Full E2E acceptance remains open.
- Initial full unit/integration verification identified generated extended-read
  contract drift; regenerated the DTO contracts and OpenAPI and reran the
  affected checks successfully. Final full-run totals appear below.

During verification, running a build over the browser test build caused
temporary client-manifest errors; the final build and focused browser run were
performed sequentially and passed. Synthetic screenshot fixtures now use unique
edition slugs so repeats preserve audit history without revision collisions.

## Screenshots

- [Desktop settings](settings-desktop.png), [mobile settings](settings-mobile.png)
- [Desktop overview](overview-desktop.png), [mobile overview](overview-mobile.png)
- [Desktop dark](overview-dark-desktop.png), [mobile dark](overview-dark-mobile.png)

These are synthetic English examples; tournament names are literal authored
content. New Simplified/Traditional Chinese interface translations are awaiting
organizer review.

Final `npm test`: **194 files passed; 1579 tests passed, 1 skipped**.
The final focused browser run passed both desktop and mobile (9.7 seconds).
CI and organizer acceptance are separate from these local results.
