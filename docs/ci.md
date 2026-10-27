# CI coverage and acceptance

Ordinary CI checks a fixed set of core workflows. It runs automatically and
reports real failures, but passing CI is not required for merging. The organizer
requested this smaller default on 2026-10-27 after run 40466629592.

| Lane          | Ordinary core CI                                                       | Explicit manual full CI                                                         |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| verify        | Locked npm install, lint/types, all unit/integration, production audit | Same                                                                            |
| build         | Production build, shared by browser jobs; parallel with verify         | Same                                                                            |
| e2e           | Core allowlist, Chromium desktop/mobile, 2 isolated shards             | Every functional spec except header-overlap, 8 isolated shards                  |
| header-e2e    | Skipped                                                                | Full language/appearance/light/dark/width and Firefox matrix, 4 isolated shards |
| remote-e2e    | Remote connection, credentials, read-only and interaction specs        | Same, plus all appearances                                                      |
| remote-matrix | Skipped                                                                | Full-site saved-read page/GET matrix                                            |

The functional core allowlist is defined in
[playwright.core.config.ts](../playwright.core.config.ts): health, public,
registration, roles, draft, results, read-api and developer-api. It covers basic
navigation, anonymous/privacy boundaries, registration ownership, scoped roles,
authoritative draft picks, reviewed result publication, read-only credentials and
revocation. Theme/branding/appearance matrices, archive permutations, extensive
accessibility/layout sweeps and secondary administration screens belong to full
regression. Unit/integration checks still cover business rules across the app. Remote core
checks sample the default appearance; only full coverage iterates every
appearance (OCLR_REMOTE_E2E_FULL=true on the remote lane). Connection isolation,
read-only enforcement, revocation and expiry assertions run in both modes.

All full regression specs remain available. The new
[playwright.functional.config.ts](../playwright.functional.config.ts) retains the
previous broad functional inventory; core is deliberately a smaller allowlist.
New browser specs join full automatically and enter core only by an explicit
allowlist decision. Full coverage is not claimed by a successful core run.

## Events and scope

- Pushes to main, pull requests and the nightly 17:30 UTC (01:30 Asia/Taipei) run
  the same fixed core suite.
- Manual CI defaults to suite=core. Only workflow_dispatch with suite=full selects
  full regression and produces full-check.
- Source changes, CSS, assets, dependencies, workflows, migrations, unknown paths,
  missing Git bases and shallow checkouts never promote ordinary CI to full.
  Planning does not fetch history or classify changed files.
- The aggregate check requires plan, verify, build, core/full functional E2E and
  remote-e2e success. Full-only lanes must be skipped in core and successful in
  full. Failures/cancellation cannot be reported as a pass. full-check requires a
  successful complete run.
- New core runs replace older core runs on the same ref across push, schedule
  and manual triggers, avoiding duplicate work. Manual full uses a separate group.

Run complete acceptance explicitly against the reviewed branch or tag:

```sh
gh workflow run ci.yml --repo OCLR-dev/OCLR-website --ref YOUR_REVIEW_BRANCH -f suite=full
```

Verify the resulting run's exact head SHA and successful full-check before using
it as complete release evidence. CI does not deploy.

## Runtime and evidence

The target for ordinary execution is under 20 minutes on the critical path,
including build, container/setup, testing and upload. Runner queue time is reported
separately. A pending/failed run does not establish that the target was met.

Build and verify start independently. Browser lanes wait for plan and the shared
build artifact, while the aggregate check waits for every selected lane. Each
runner owns a separate isolated PostgreSQL service and remains workers=1; never
run destructive fixtures concurrently against one database.

Browser jobs use the official Playwright Noble image pinned to the locked
package version and manifest digest, with preinstalled browsers and dependencies.
Browser commands use HOME=/root to match the container user's home ownership.
Core and remote lanes preflight Chromium only; full functional/header coverage
preflights all three engines. The preflight checks both executables and actual
launch. Version mismatch or launch errors fail early.

Playwright stores test-results/ci-timings.json and a job summary with elapsed
execution and per-spec/project durations. Result artifacts are uploaded on success
and failure without recompressing PNG/ZIP evidence. Timings contain paths,
durations and status counts, without test titles or result bodies. Responsive
measurements remain checked; ordinary functional CI omits the helper's six
full-page evidence screenshots. Explicit screenshots and failure traces remain.
Retries and timeouts are unchanged.

Anonymous cookie checks allow only known automatic preferences: valid oclr-locale
and light/dark oclr-system-theme. Session, tracking, unknown cookies and malformed
preference values still fail those checks.

## Maintainers and merging

The intended GitHub configuration is recorded in
[ci-main-protection.json](ci-main-protection.json). Main has no required status
checks, per the organizer's 2026-10-27 decision. Other protections, including
restrictions on force pushes/deletion, remain unchanged.

Follow the existing authorization/review scope, report the exact commit and real
CI status, and fix failures. Pending or failed CI alone does not block an otherwise
authorized merge. For an authorized main update, fetch main, integrate a changed
base safely and use a normal fast-forward push. Synchronize the organizer's main
checkout when safe and preserve unrelated work. Do not open a PR unless requested.
Review acceptance, issue closure and release acceptance need their own evidence.

## Local verification

Use Node/npm and the isolated test database setup in the development guide. Set
TEST_DATABASE_URL even for --list: database-only cases are otherwise absent. Build
first, then run suites sequentially against a disposable database:

```sh
npm run test:e2e:core
npm run test:e2e:remote:core
# Complete browser acceptance, when requested:
npm run test:e2e:functional
npm run test:e2e:header
npm run test:e2e:remote -- tests/remote-e2e/full-site.spec.ts
```

The original npm run test:e2e and npm run test:e2e:remote commands retain complete
local coverage. Header mode defaults to full. Never launch shards in parallel
against one database; use separate databases and loopback servers.
