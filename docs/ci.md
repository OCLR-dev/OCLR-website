# CI coverage and acceptance

CI keeps functional checks strict while varying the expensive combinations that
run for each change. The required context is still named **check**.

| Lane          | Always run                                                                                                              | Expanded coverage                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| verify        | Locked npm install, lint/types, all unit/integration, production build and production audit                             | Unchanged                                                                                                                        |
| e2e           | Every existing desktop/mobile functional spec, excluding only header-overlap                                            | New functional specs are included automatically                                                                                  |
| header-e2e    | Every appearance in English light/dark; all three languages on the default design; default language coverage in Firefox | Changed themes get all language/theme combinations; shared header/layout/styles, fonts and header assets get the complete matrix |
| remote-e2e    | All remote specs except the expensive full-site page/GET matrix, including real grants, revocation and read-only checks | New remote specs are included automatically                                                                                      |
| remote-matrix | Required for application/read-model/contracts, remote specs, migrations, and complete acceptance                        | Can be intentionally skipped for prose/assets or unrelated test/style changes                                                    |

The scope implementation is [scripts/ci-plan.ts](../scripts/ci-plan.ts). Unknown
paths, missing bases and diff failures select complete acceptance. Renames include
both the old and new paths. Files under src select complete remote coverage;
stylesheets use header-specific selection. JSON data/contracts, dependencies,
workflow/configuration and fixture changes outside recognized categories select
complete acceptance. Prose-only changes still run verify and all functional E2E.

Header cases are sharded individually across four independent PostgreSQL runners.
Each runner remains workers=1. No shared database is accessed concurrently by
destructive fixtures. The functional lane continues to shard by file. Its existing
Firefox/WebKit asset cases still run, even though its main projects are Chromium.

The representative header matrix has 50 project/case combinations instead of 162. It keeps 320px, 390px, and both sides of the 950/1100px navigation breakpoints,
plus 760px and desktop widths. Targeted theme expansion also preserves the
representative cases for all other designs. Full acceptance keeps the original
162 combinations and all 15 widths. Counts are coverage counts, not a measured
promise of CI runtime.

Keyboard/touch actions, focus, hit-testing, authorization, publication, revocation,
idempotency and data/privacy assertions are retained. Retries and timeouts are not
increased. Responsive measurements are always checked and attached as JSON;
ordinary functional CI omits the helper's six full-page evidence screenshots.
Explicit case screenshots remain, and failed tests automatically retain a
screenshot and trace. Local/full evidence generation remains available.

## Events and full acceptance

- Pull requests and pushes to main run automatic scope selection. Feature pushes
  do not duplicate the pull-request workflow.
- The nightly run starts at 17:30 UTC (01:30 Asia/Taipei) and selects full coverage.
- Manual CI offers suite=core or suite=full, defaulting to full. Manual and nightly
  runs have separate concurrency groups from ordinary pushes.
- check fails if any mandatory lane fails, is cancelled, or is unexpectedly
  skipped. The remote matrix can be skipped only when the successful plan allows
  it. A failed/missing plan never yields a passing check.
- full-check runs only for complete acceptance and requires check success.
  A core check or a skipped full-check does not establish release acceptance.

For release evidence, run the complete suite against the exact reviewed ref and
record its successful full-check:

```sh
gh workflow run ci.yml --repo OCLR-dev/OCLR-website --ref YOUR_REVIEW_BRANCH -f suite=full
```

GitHub workflow dispatch accepts a branch or tag ref. Point the authorized review
branch to the reviewed commit and verify the resulting run's head SHA. No
deployment is performed by CI.

## Maintainers and the main gate

The intended GitHub configuration is recorded in
[ci-main-protection.json](ci-main-protection.json); the issue records its actual
read-back state. Main requires the GitHub Actions check context, including for administrators.
Direct pushes without checks are no longer the normal maintainer path. Preserve
the existing no-PR workflow when requested by validating a feature branch first:

1. Fetch main and prepare a focused feature branch based on its current head.
2. Push the authorized feature branch, then dispatch CI for that branch:

   ```sh
   gh workflow run ci.yml --repo OCLR-dev/OCLR-website --ref YOUR_FEATURE_BRANCH -f suite=core
   ```

3. Confirm the run's head SHA equals the intended commit and its check succeeded.
   Fetch main again. If the base changed, integrate it safely and verify the new
   commit; never force-push or bypass branch protection.
4. Push the already checked commit to main with a normal fast-forward push.
   Synchronize the organizer's main checkout when safe, preserving other work.

Implementation and GitHub protection state are recorded on issue #364. Repository
access does not grant permission to change unrelated rules or deploy. If protection
cannot be configured, the issue must record the actual API limitation rather than
claiming this gate is active.

## Local verification

When comparing test inventories with --list, export TEST_DATABASE_URL exactly as
in CI: API cases registered only in database mode are otherwise absent.

Use the Node/npm/isolated test database setup in the development guide. Build
first, then run these commands sequentially against the same disposable database:

```sh
npm run test:e2e:core
OCLR_E2E_MATRIX=smoke npm run test:e2e:header
npm run test:e2e:remote:core
npm run test:e2e:remote -- tests/remote-e2e/full-site.spec.ts
```

The original npm run test:e2e and npm run test:e2e:remote commands retain complete
local coverage. The default header mode is full. Never launch shards in parallel
against the same database; use separate databases and loopback servers.
