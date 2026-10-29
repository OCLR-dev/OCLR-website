# Staff card width and Designer role (#487 / #488)

Recorded 2026-10-29 (Asia/Taipei). Synthetic local evidence, not a production
operation or deployment claim.

## Changes and order

1. #487 was submitted and merged as PR #489, commit
   `f71e9941436e91dc3467e52212b0b9c2b2b5b84f`. Both public staff lists and About
   cards keep two equal columns, including single/odd cards. Narrow cards stack
   their avatar and text internally.
2. #488 starts from that commit. Designer uses the `designer` role, an empty
   capability set, the existing scoped multi-role editor and explicit publication
   flow. Migration `0056_designer_role` adds one enum value; its snapshot changes
   only identifiers and enums. No existing grants or audit rows are rewritten.
   Read contracts/OpenAPI and three locale catalogs are synchronized.

## Verification

Node.js 24.22.2, `npm ci`, unchanged lockfile. A new disposable PostgreSQL 17
cluster on loopback port 55488 and database `oclr_488_test` were used; no existing
local configuration, demo data or production records were accessed.

- `npm run check`: lint and types passed.
- `npm test`: 193 files passed; 1,578 tests passed, 1 skipped.
- `npm run build`: passed.
- `npm run i18n:extract` and `npm run test:i18n`: synchronized, 4 checks passed.
  Extraction also discovered two previously uncatalogued media-storage messages;
  their Chinese translations were filled before the passing run.
- `npm audit --omit=dev`: zero vulnerabilities.
- Generated read-contract and OpenAPI consistency checks passed in the unit suite.
- Desktop/mobile targeted browser coverage: all 6 distinct cases passed across
  the initial and affected-only reruns. About cards cover 0/1/3/24 staff,
  320/390/768/1024/1440px, three locales and light/dark, checking half width,
  left alignment and overflow. Public Designer publication/hiding/revocation and
  staff role grant/edit/reload/conflict flows passed on both projects.
- Initial role-UI attempts exposed stale test assumptions about a `Saving…`
  button and an unscoped status query now also matching the loading overlay.
  Tests now assert the disabled Confirm button and the form's own status. The
  two affected browser cases passed after those selector-only corrections.
- Prettier and `git diff --check`: passed.

The full all-site/all-theme browser and remote matrices were not run. The fixed
ordinary GitHub CI lane remains unchanged; actual run status is recorded in the
PR/issue comments. These checks do not establish live migration or release
acceptance.

## Screenshots

All identities, images and grants in these screenshots are synthetic.

- [Staff cards, desktop dark](staff-desktop-dark.png)
- [Staff cards, mobile dark](staff-mobile-dark.png)
- [Published Designer, desktop light](designer-desktop-light.png)
- [Published Designer, mobile dark](designer-mobile-dark.png)

## Concurrent main integration

Before merging PR #491, main advanced through #486 and #430 to
`1f52a45738ae15e52aa896964394ddac9638cac9`. Translation catalogs were merged
without dropping either change and read contracts/OpenAPI were regenerated from
the combined source. The new main's media-storage translations take precedence.
Seven affected test files (contracts, i18n, timeline and staff authorization) were
rerun: 31 checks passed. The full-suite/build/browser results above were collected
before this unrelated main integration; no second full matrix is implied.
