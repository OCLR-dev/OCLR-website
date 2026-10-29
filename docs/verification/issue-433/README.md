# #433 local verification — 2026-10-29 (Asia/Taipei)

Base: main `60db020940f90f2549c85bb6dae4f38c04eb1e60`.
Isolated worktree, Node 24.22.2, Next.js 16.4.2, Playwright Chromium,
direct loopback HTTP `next start`, no database, no OAuth credentials, no Nginx.
No live-site diagnosis or deployment is claimed.

## Findings

[Before](before.json) and [after](after.json) contain final application response
headers, resource timing and CDP response events. The sample covers brand SVG,
S11 main visual, S7 archive, S5 texture, Quicksand font and real built CSS/JS.
Before public files used `public, max-age=0`; afterwards they use
`public, max-age=300, must-revalidate`. Hashed build resources retain one-year
immutable caching. The two builds have different build identifiers; their JS
sample URLs and cold resource-entry counts differ, so cold totals are not an
apples-to-apples application benchmark.

| Device / phase                     | Before resource entries / transfer bytes | After resource entries / transfer bytes |
| ---------------------------------- | ---------------------------------------- | --------------------------------------- |
| Desktop cold                       | 8 / 804491                               | 9 / 804790                              |
| Desktop normal revisit             | 8 / 1500                                 | 9 / 0                                   |
| Desktop normal reload              | 8 / 1500                                 | 9 / 0                                   |
| iPhone 13 emulation cold           | 8 / 804491                               | 9 / 804790                              |
| iPhone 13 emulation normal revisit | 8 / 1500                                 | 9 / 0                                   |
| iPhone 13 emulation normal reload  | 8 / 1500                                 | 9 / 0                                   |

Counts are Resource Timing entries for the selected assets, **not total page
requests or actual wire requests**. Zero transfer entries mean browser cache
reuse; an entry/status 200 alone does not establish a complete download.
Each scenario starts a fresh context; revisit leaves for about:blank then returns
to /login; reload uses ordinary page.reload(). Cache is enabled, no request
interception, no hard reload, no DevTools Disable cache. Selected assets absent
from /login are explicitly fetched in the browser to cover the representative
categories. This is a controlled asset probe, not a full tournament navigation
benchmark. Screenshots show the desktop/mobile page environment, not DevTools;
the JSON supplies the network evidence.

The baseline already avoided complete redownloads during revisit. The observed
improvement is removing five public-asset validation round trips (1500 Resource
Timing header bytes) within the freshness window, rather than saving another
804 KB per visit. After expiry, raw conditional GETs with each ETag and
Last-Modified return 304/zero body for all selected public and build assets.
The original baseline Node fetch conditional probes were excluded because that
client adds no-cache; they are not evidence of broken validators.

[Replacement probe](replacement.json): adding a comment to an isolated SVG then
requesting with the old ETag and explicit revalidation returned 200, a new ETag
and new bytes; original bytes were restored. This verifies validators, not an
elapsed five-minute browser expiry. [Development headers](development-headers.txt)
retain max-age=0 and development CSP, so the production rule does not affect HMR.

/login remains private/no-store, /api/v1/me returns 401/no-store, unconfigured
OAuth returns 503/no-store; private-looking .png and missing public .svg paths
return 404/private/no-store. Security headers and validators are preserved.
No third-party response header policy was modified.

## Checks and remaining acceptance

- `npm ci` completed using the existing lockfile.
- Node 24 `npm run check` passed; before/after `npm run build` passed.
- Node 24 `npm test`: 125 files / 982 tests passed; 56 files / 479 tests skipped.
  DB-dependent integration coverage is unavailable without TEST_DATABASE_URL.
- `npm run test:e2e -- tests/e2e/static-asset-cache.spec.ts --project=desktop --project=mobile`:
  2 passed against the production build (validators, cache policy, security and
  negative paths). Actual browser reuse probes are separately recorded above.
- `npm audit --omit=dev`: zero vulnerabilities.
- `git diff --check` passed.

Full desktop/mobile functional regression, real multi-account login/logout,
locale/appearance interaction matrices, live HTTPS/proxy headers, `nginx -t`,
actual expiry and old-tab deployment overlap have **not** been verified. Docker
is not running; no test DB was provisioned and no private configuration was read.
No Nginx binary is installed here. These are remaining acceptance items, not
passing checks. No CI result for this patch is claimed before it runs.

The existing release switch does not serve previous uncached chunks from the new
process. The [rollout notes](../../static-asset-caching.md) explain the required
old-chunk retention/staging check; this patch does not resolve or claim that gate.
Issue #433 must stay open until the remaining acceptance evidence is reviewed.

Reproduce asset probes from the repository root after a production build and
starting a separate server on 127.0.0.1:31433:
`node docs/verification/issue-433/measure.mjs after`.
Run the `before` probe on the base version in a separate isolated checkout;
do not overwrite a serving build. The measurement script writes evidence only.
