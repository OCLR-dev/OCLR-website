# CI coverage and acceptance

Push/PR CI runs checks and a production build without E2E. It runs automatically and
reports real failures, but passing CI is not required for merging. The organizer
requested this default on 2026-10-31 (#608), superseding the 2026-10-27
per-commit core browser policy. Nightly CI still runs core E2E.

| Lane          | Push/PR and manual checks                                              | Explicit manual full CI                                                                       |
| ------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| verify        | Locked npm install, lint/types, all unit/integration, production audit | Same                                                                                          |
| build         | Production build; no browser artifact upload                           | Production build, packaged/shared with browser jobs                                           |
| e2e           | Skipped (nightly/manual core: 2 Chromium desktop/mobile shards)        | Every functional spec except header-overlap, 8 isolated shards                                |
| header-e2e    | Skipped                                                                | Real-session workspace navigation on Chromium desktop/mobile and Firefox, one isolated runner |
| remote-e2e    | Skipped (nightly/manual core: remote permission smoke)                 | Remote permission smoke plus an inherited season                                              |
| remote-matrix | Skipped                                                                | Full-site saved-read page/GET matrix                                                          |

The functional core allowlist is defined in
[playwright.core.config.ts](../playwright.core.config.ts): health, public,
registration, roles, draft, results, read-api and developer-api. It covers basic
navigation, anonymous/privacy boundaries, registration ownership, scoped roles,
authoritative draft picks, reviewed result publication, read-only credentials and
revocation. Full adds distinct historical and secondary administration workflows
and necessary browser regressions. Unit/integration checks cover business rules
across the app. Remote core checks exercise a default and an inherited season
without repeating the business journey for every appearance. Connection isolation,
read-only enforcement, revocation and expiry assertions run in both modes.

Full regression retains distinct business workflows in
[playwright.functional.config.ts](../playwright.functional.config.ts); core is a
smaller explicit allowlist. #869 removes repeated style/copy matrices from full
as well as duplicate journeys. New E2E cases need an independent business outcome
and a reason for browser/server verification. A successful core run does not
establish full regression acceptance.

Presentation is sampled in DB-free component tests, and translations/ICU are
checked centrally. Shared style or wording changes do not automatically add an
E2E, and full/nightly is not a holding area for duplicates. Keep focused browser
regressions for real interaction, focus, loading and rendering faults. Record
removed cases and their surviving coverage, together with comparable before/after
counts and timings; see [test design](development.md#choosing-and-maintaining-tests-869)
and the [cleanup record](verification/issue-869/README.md). The checks/core/full
event policy below remains independent of this reduction in test content.

## Events and scope

- Pushes to main and pull requests select `checks`: lint/types, all
  unit/integration tests, production audit and build; all browser jobs skip.
- The nightly 17:30 UTC (01:30 Asia/Taipei) schedule selects `core`, including
  core functional and remote E2E. Manual CI defaults to `suite=checks`;
  `suite=core` opts into core browsers, `suite=full` opts into all browser lanes.
- File changes and missing Git bases never expand coverage automatically.
- The aggregate check requires plan, verify and build success. Browser jobs must
  succeed when selected and be skipped otherwise. Failures/cancellation cannot
  be reported as a pass. `full-check` requires a successful complete full run.
- New runs replace older runs of the same suite on the same ref. Scheduled core
  and manual full use groups separate from per-commit checks.

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

Verify starts immediately; build waits only for the short coverage plan. Browser
lanes wait for plan and the shared build artifact (packaged/uploaded only when
E2E is selected), while the aggregate check waits for every selected lane.
A checks-only pass does not establish browser or release acceptance. Each runner owns a separate isolated PostgreSQL service and remains workers=1; never
run destructive fixtures concurrently against one database.

Browser jobs use the official Playwright Noble image pinned to the locked
package version and manifest digest, with preinstalled browsers and dependencies.
Browser commands use HOME=/root to match the container user's home ownership.
Functional and remote lanes preflight Chromium; header coverage also requires
Firefox. The preflight checks both executables and actual
launch. Version mismatch or launch errors fail early.

Playwright stores test-results/ci-timings.json and a job summary with elapsed
execution and per-spec/project durations. Result artifacts are uploaded on success
and failure without recompressing PNG/ZIP evidence. Timings contain paths,
durations and status counts, without test titles or result bodies. Each business
workflow checks its current project viewport. Shared responsive boundaries are
sampled once in component tests, rather than resizing and capturing six full-page
screenshots after every workflow. Failure screenshots and traces remain.
Retries and timeouts are unchanged.

Anonymous cookie checks allow only known automatic preferences: valid oclr-locale
and light/dark oclr-system-theme. Session, tracking, unknown cookies and malformed
preference values still fail those checks.

## Maintainers and merging

The intended GitHub configuration is recorded in
[ci-main-protection.json](ci-main-protection.json). Main has no required status
checks, per the organizer's 2026-10-27 decision. Other protections, including
restrictions on force pushes/deletion, remain unchanged.

For organizer-requested changes in maintainer-authorized sessions, push a feature
branch, open a PR to `main` and merge it by default. Follow task-specific review
or publishing instructions and respect branch protections. After merging,
fast-forward the organizer's local `main` when safe and preserve unrelated work.
Report the exact commit and CI status, and fix failures. Pending or failed CI
alone does not block an otherwise authorized merge. Review acceptance, issue
closure and release acceptance need their own evidence.

## Local verification

Do not run these browser suites for routine development or agent verification:
they are slow and belong to nightly/core CI or an explicitly requested browser
check. Run them only when the change under test is browser behavior or a
browser-only bug must be reproduced, and report them as not run otherwise.

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
