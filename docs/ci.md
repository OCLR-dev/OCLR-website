# CI coverage and acceptance

[CI workflow](../.github/workflows/ci.yml) selects a suite by event or manual input. Changed files and missing Git bases do not expand the suite.

## Events and scope

| Suite    | Trigger                                                         | Jobs                                                                                                                                                 |
| -------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checks` | Push to `main`, pull requests, default manual run               | Locked npm install, lint/types and generated checks, unit/integration tests, production audit, and production build                                  |
| `core`   | Nightly at 01:30 Asia/Taipei (17:30 UTC) or manual `suite=core` | `checks` plus Chromium desktop/mobile functional smoke in 2 shards and remote smoke                                                                  |
| `full`   | Manual `suite=full`                                             | `checks` plus functional tests in 8 shards, header/theme tests on Chromium desktop/mobile and Firefox, remote smoke, and the full-site remote matrix |

[Core functional coverage](../playwright.core.config.ts) samples health/public navigation, registration ownership, scoped roles, draft picks, reviewed results, and credential revocation. [Full functional coverage](../playwright.functional.config.ts) adds distinct historical and administration workflows. [Remote smoke](../playwright.remote-core.config.ts) covers connection isolation, authorization, read-only behavior, expiry, and revocation. Follow the [test design guide](development.md#choosing-and-maintaining-tests-869) and [#869 cleanup record](verification/issue-869/README.md) when changing coverage.

`check` requires the plan, verification and build to succeed, and each browser job to succeed or skip according to the selected suite. `full-check` requires a successful full run. New runs supersede older runs for the same ref and suite.

To request full acceptance on an authorized review ref:

```sh
gh workflow run ci.yml --repo OCLR-dev/OCLR-website --ref YOUR_REVIEW_BRANCH -f suite=full
```

Verify the exact head SHA, suite, and check conclusion in the run. Release and deployment acceptance require their own evidence.

## Runtime and evidence

Verify starts immediately and build waits for the suite plan. Browser jobs reuse the build artifact, which is packaged only when selected. Each browser runner uses its own isolated PostgreSQL with one Playwright worker. The pinned Playwright image matches the npm lockfile. CI preflights Chromium, plus Firefox for the header suite.

The ordinary CI target is under 20 minutes of execution on the critical path, with runner queue time reported separately. Browser jobs upload `test-results/ci-timings.json`, a job timing summary, and available failure traces/screenshots. The anonymous cookie checks permit only valid automatic locale and system theme preferences.

## Maintainers and merging

[Main protection](ci-main-protection.json) records the intended GitHub settings. CI is advisory for merging under the organizer's 2026-10-27 decision. Keep the other branch protections and follow the [contributor workflow](../AGENTS.md#contributor-setup-and-workflow). Report the exact commit and actual CI status, and fix failures. Maintainer acceptance, issue closure, and release acceptance remain separate decisions.

## Local verification

Use the [development setup](development.md#checks-and-hosting) for static checks, build, and isolated database tests.

Run `node scripts/check-production-audit.ts` to reproduce the production audit
gate. It prints the full `npm audit --omit=dev --json` report. The gate temporarily
accepts [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
only for the locked `next-intl@4.14.9` → `@parcel/watcher@2.6.0` →
`picomatch@4.0.7` path. The watcher is used by next-intl's optional message
extractor, which OCLR leaves disabled. OCLR extracts messages with its own
`npm run i18n:extract` command. npm had no fixed picomatch release when the
advisory failed [run 44229829469](https://github.com/OCLR-dev/OCLR-website/actions/runs/44229829469).
Any other finding fails the gate. Remove the exception and restore the plain
audit once the lockfile resolves the advisory. Review the exception before
changing that dependency chain or enabling the next-intl extractor.

Run Playwright locally only for explicit browser verification or browser-specific changes and reproductions. Export `TEST_DATABASE_URL` as described in the development guide, including for `--list`, migrate the isolated database, and build before running application browser suites. Playwright uses loopback port 3100 for the main application. Install Chromium with `npx playwright install chromium` (also Firefox for header coverage), or set `PLAYWRIGHT_CHANNEL=chrome` for Chromium tests using an installed Chrome.

```sh
npm run test:e2e:core
npm run test:e2e:remote:core
# Full browser coverage adds the commands below.
npm run test:e2e:functional
npm run test:e2e:header
npm run test:e2e:remote -- tests/remote-e2e/full-site.spec.ts
```

Run suites sequentially on one disposable database. Concurrent shards need separate databases, servers, and storage. The umbrella commands `npm run test:e2e` and `npm run test:e2e:remote` also remain available.
