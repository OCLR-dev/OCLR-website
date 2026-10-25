# Issue #298 — rules on the edition homepage

Recorded on 2026-10-25. The branch was fast-forwarded to upstream main
`f5bdb92d84685579f00fc5467b9bf0941043952d` before final checks.

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
- Full `npm test`: 539 passed, 376 skipped, 54 failed. The same seven
  platform-dependent suites fail on this Windows host because of POSIX
  executable / file-symlink prerequisites: cleanup-releases, oclr-script,
  production-script, replay-parser, replay-storage, team-media and update-script.
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
only to loopback. Current identities and rules were synthetic; the historical
DTO reused the repository's existing public S8 rulebook and illustrations under
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
