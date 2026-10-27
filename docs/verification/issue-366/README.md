# #366 — early historical statistics support

S1–S6 (OCLR β is `s5`) now use the same exact season support predicate as S7–S10. Public legacy/menu navigation, staff links, archive match details and database statistics reads share it. The public and staff remote resources delegate to the same saved services; no contract or migration is added.

Opening an entry does not import MP data or release statistics. Existing edition publication, scoped Referee/Admin permissions, immutable released snapshots, optimistic versions and transactional audit remain unchanged. Original series results, rankings and unresolved source notes are untouched. Unsupported historical seasons remain unavailable; live-event statistics navigation remains available.

## Verification scope

Only synthetic identities/archives/providers and a newly created isolated PostgreSQL test database were used. No production data, roles, credentials, imports or deployment were accessed.

- Unit coverage exercises legacy and menu links/selected states across all ten supported seasons and rejects unsupported archives.
- Parameterized database coverage exercises S1–S6 import, review, Admin publication, partial/missing-MP coverage, private editions, cross-edition rejection, stale versions, audit and unchanged archive results. Saved remote resource dispatch matches database reads and never fetches the provider on a read.
- Remote transport coverage uses a loopback mock backend with no local database: S1–S6 public/workspace resources, required private scope and subject mismatch rejection.
- Browser coverage exercises desktop/mobile, all three locales and both themes for S1–S6 empty coverage and scoped navigation; published statistics use the existing S1–S10 import/review/release/filter workflow. Existing adjudication and bench exclusion workflows are retained.

Local results and remaining limits are recorded on the issue after verification. Deployment and live statistical review remain organizer actions; #365 retains S2-specific source work.

## Local results — 2026-10-27

- `npm ci`, final `npm run check`, production build and `git diff --check` passed. `npm audit --omit=dev`: zero vulnerabilities. No interface text was added; existing translations were reused.
- Full unit/integration batch: 162 files, 1366 tests passed, one existing platform skip, one newly added remote test failed because its synthetic token lacked `tournaments:private:read`. The mock was given that scope only in this test mode; application permission checks were unchanged. The subsequently added navigation test initially assumed HTML attribute order; that assertion was corrected. Final combined affected verification: **4 files / 53 tests passed**, including all six database parameterizations and real loopback remote transport.
- Browser verification: all **8 distinct desktop/mobile statistics workflows** passed across the initial and affected reruns. The first desktop navigation run attempted the hidden mobile toggle; it was corrected to use desktop links. Final expanded navigation/publication rerun: **4/4 passed**; after scrolling to the top for stable full-page evidence, the two navigation cases passed again. S1–S6 were checked in all three locales and both themes; S1–S10 released data and the existing three appearances, filters, adjudication and bench safeguards were exercised. Axe checks passed and no document horizontal overflow was detected.
- Inspected [desktop dark](desktop-empty-dark.png) and [mobile light](mobile-empty-light.png) screenshots. These are synthetic empty-coverage examples, not production acceptance.
- Browser tests used port 31666 because 3100 belonged to another preview. A temporary copy of the synthetic provider retained its exact loopback-origin, matching isolated DB and synthetic-secret guards at that port; temporary test files were removed afterward. No other preview process was stopped.
- The full site/remote browser matrix was not rerun locally; CI and organizer deployment acceptance remain separate. No production statistics were imported or published.
