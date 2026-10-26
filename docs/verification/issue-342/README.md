# Historical placement filters — #342

Verified locally on 2026-10-25 (America/Los_Angeles), based on upstream main
`c34af9525764b7b74ee0c59841d47e7f68700f2e`.

## Change

Team and individual placement calculations use every saved play in the selected
round/map scope. Team selection filters the resulting rows. Search and column
sorting still apply after calculation. Map columns retain that same scope so
unplayed maps remain unrecorded (`—`). Existing best-attempt, team-total,
average-score and ordinal tie behavior are retained.

This changes the client component and its pure model only; no schema, API
contract, import, provider refresh, business write or published data is changed.

## Verification

- `npm ci --no-audit --no-fund`: completed with the existing lockfile.
- `npm run check`: passed (ESLint and TypeScript).
- `npx vitest run tests/unit/event-statistics-model.test.ts tests/unit/event-preview.test.ts`:
  12 passed, including seven new placement regression cases. Two teams and four
  players cover team/individual filtering, round/map scope, repeated appearances,
  missing appearances, recorded zero scores and unknown/empty selections.
- `npm run build`: passed with database/OAuth/media environment values empty.
- `npm audit --omit=dev`: zero vulnerabilities.
- Chrome against the local remote-mode frontend, reading `https://oclr.org`
  anonymously: 1440px desktop and 320px mobile, each in light/dark mode. All four
  combinations passed team and individual placements, two team selections,
  all/Group A/single-map scopes, search and column sorting. All compared cells
  (excluding the visible row counter) match their unfiltered baseline. No page
  errors or document-level horizontal overflow. The PostgreSQL connection trap
  recorded no attempted local connections. Public data needs no developer token.

The reported S10 example stays identical before/after selecting 三角初音:

| Field                                     | All teams     | Selected team |
| ----------------------------------------- | ------------- | ------------- |
| Average placement                         | 2.906         | 2.906         |
| Average score                             | 2,088,389     | 2,088,389     |
| Group A · NM5 · 5015365 placement / score | 3 / 2,543,092 | 3 / 2,543,092 |
| Group A · HD2 · 3764198 placement / score | 3 / 1,743,410 | 3 / 1,743,410 |

See [browser results](browser-results.json) and
[desktop light](desktop-light.png), [desktop dark](desktop-dark.png),
[mobile light](mobile-light.png), [mobile dark](mobile-dark.png).

## Limits

Full `npm test` was attempted: 653 passed, 59 failed, 425 skipped; 12 files failed,
88 passed and 52 skipped. One failing suite could not initialize. Failures include
POSIX shell commands unavailable on Windows, restricted symlink/filesystem
operations, Python replay/source tooling and generated-file/hash checks affected
by checkout line endings. The generated JSON files are unchanged from the base
commit after CRLF normalization; their checkers compare bytes. These failures were
not changed as part of this frontend fix. PostgreSQL-dependent tests were skipped
because no isolated `TEST_DATABASE_URL` was supplied.

The full database-backed Playwright workflow was not run. The browser checks
above exercise the changed page with saved public data; they do not establish
backend mutation, deployment, CI or maintainer acceptance. No new interface
messages were introduced. No deployment was performed.
