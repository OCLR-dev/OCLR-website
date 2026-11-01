# Mobile header dropdown — #641

Organizer-selected dropdown implementation, 2026-11-01 (Asia/Taipei).
Phone widths through 760px show the logo, account action and menu toggle.
Appearance, color mode and language appear below public navigation links.
The earlier five-action phone layout is superseded by this implementation.

- [Closed, light](mobile-closed-light.png)
- [Open, light](mobile-open-light.png)
- [Open, dark](mobile-open-dark.png)

These are browser screenshots of the actual client Header and application CSS
from the integration branch based on main `27cc915b`, using the DB-free component host, synthetic account
data and minimal Next router contexts. They are not production screenshots or
authenticated application acceptance. The header uses existing translated
messages; no new catalog entries were introduced.

## Integrated-main verification

Integration branch: `codex/641-mobile-dropdown`, based on main `27cc915b`.
The nullable Host parser and its runtime assertions were already repaired on
main by `21b789b7` (#511). Integrating that existing fix resolves the old
checkout's `tests/unit/site-origin.test.ts:36` build error; no duplicate parser
change or weakened assertion is included in this patch.

- Node 24.22.2, fresh `npm ci`: `npm run check` (lint/types) and production
  build passed.
- Full unit/integration invocation: 1,466 passed, 669 skipped (252 files,
  181 passed and 71 skipped). Database-dependent checks were skipped because no
  isolated test database was configured; this is not DB-backed acceptance.
- Six component browser tests passed again in desktop/mobile Chromium projects.
  They cover all 19 appearances in both modes, rotating three locales and
  anonymous/player/staff identities at 320, 390 and 760px; scrollable choices,
  nested Escape, backdrop, focus exit, navigation dismissal, preference cookies,
  remote account navigation and desktop controls are exercised.
- `read-api:generate` produced no differences; `read-api:check` passed (56 read
  contracts, 174 coverage rows and eight tests).
- i18n extraction introduced no catalog differences; four i18n tests passed.
  Production dependency audit reported zero vulnerabilities. Formatting and
  `git diff --check` passed.
- The earlier dirty-checkout failures (three unit tests and the nullable Host
  type error) are superseded by these integrated-main results.

## Earlier visual checks

Before integration, WebKit passed 114 phone cases (19 appearances × two modes
× three widths), including nested Escape behavior. Desktop geometry matched
in 57 comparisons (19 appearances × 768/950/1440px) against the pre-change
Header from `6756ea33`, using the same stylesheet set. Those checks establish
that implementation checkpoint only. The images above were refreshed against
the integrated Header, retaining the latest upstream navigation labels.

Full authenticated/DB-backed E2E and Firefox were not run for this revision.
Existing appearance/language E2E flows now open the phone panel and check scroll
reachability; their full execution remains pending. No deployment, role grant
or real credential use was performed. The original user checkout's unrelated
edits were preserved; only the already-approved upstream Host parser was also
synchronized there to fix its reported type error.
