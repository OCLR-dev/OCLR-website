# Issue #298 — rules on the edition homepage

Recorded on 2026-10-25. Final checks were repeated after merging upstream main
`41512cf5e7d6131743016aceb58d6684e58801e9`, including its #271–#272 saved-read changes.

Public current/historical navigation no longer lists a separate Rules page.
Registration acknowledgements link to their own edition's `#rules`. The old route
contains only a redirect bridge, a homepage canonical and `noindex` metadata.
Its browser-side fragment lookup preserves recognized chapters; unknown or
malformed fragments and the no-JavaScript refresh use the same edition's rules
section. It never selects a different edition. Existing `rules-N` homepage IDs
and historical `rule-*` IDs remain stable.

The current homepage now retains the rule version, eligibility limits,
publication/empty-state messages and directory privacy notice from the former
rules page. The chapter count includes the displayed eligibility section.
Historical source text and illustrations use the existing handbook. Public rule
anchors measure the shared header and reserve another 16px, including when
mobile preference controls wrap. Private archive previews and Admin editing
retain their existing paths.

## Local evidence

- `npm run check`: passed (ESLint and route types/TypeScript).
- `npm run build`: passed.
- `npm run i18n:extract` and `npm run test:i18n`: passed; no message/catalog changes.
- Rules-navigation/public-navigation unit checks: 41 passed.
- `npm audit --omit=dev`: zero production vulnerabilities.
- Full `npm test`: 546 passed, 379 skipped, 55 failed. Fifty-four failures in seven
  platform-dependent suites occur on this Windows host because of POSIX
  executable / file-symlink prerequisites: cleanup-releases, oclr-script,
  production-script, replay-parser, replay-storage, team-media and update-script.
  The additional read-api-dx contract-regeneration failure also reproduced on a
  clean, detached checkout of upstream `41512cf` with the same dependencies and
  host. It is not reported as passed. The 137-row route inventory check passed
  with filesystem path separators normalized for Windows.
- The isolated browser run passed **121 cases**, with no page errors or page
  horizontal overflow. The [JSON report](verification.json) records each case
  and measured rule-title/header positions. It covers 72 current/historical
  combinations across three baseline appearances, three locales, light/dark
  and 320/1440px; another 40 cover the other five registered appearances in
  English. Nine additional cases cover legacy routing, duplicate/Unicode
  headings, missing chapters, no rules, not-found responses and disabled
  JavaScript. Metadata and absence of duplicated rules HTML were checked too.

The browser run used the real Next development frontend in remote mode, an
anonymous local connection and a contract-validated HTTP fixture backend bound
only to loopback, including the 1.1.0 public-configuration resource. Current
identities and rules were synthetic; the historical fixture reused the
repository's existing public S8 rulebook and illustrations under
a synthetic edition identity. Screenshots hide the Next development indicator.
No database, real OAuth/provider credential, production data or service was used.

This host has no `TEST_DATABASE_URL`, and its Docker Linux engine is unavailable.
The database-backed desktop/mobile Playwright suite and integration tests were
therefore **not executed**. Existing browser regressions were updated for the
removed navigation and current/historical legacy chapter routes. The fixture
browser checks do not establish real database authorization or release
acceptance; those remain subject to CI and maintainer review.

## Screenshots

- [Current, desktop light](current-fixture-default-light-1440.png)
- [Current, 320px dark](current-fixture-cute-pastel-dark-320.png)
- [Historical, desktop light](history-fixture-default-light-1440.png)
- [Historical, 320px dark](history-fixture-cute-pastel-dark-320.png)
