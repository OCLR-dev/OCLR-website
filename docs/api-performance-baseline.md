# Local API performance baseline (#1015)

Use the benchmark to distinguish request latency from database work before
changing a query, moving work into a worker, or splitting an application process.
It exercises the actual built Next.js routes using HTTP and synthetic PostgreSQL
fixtures. It runs separately from regular CI and installs no production probes.

## Run

Use Node.js 24, the existing npm lockfile and a clean worktree without Next.js
environment files. Create a fresh PostgreSQL database named
`oclr_api_benchmark_test` in a disposable loopback cluster. The runner checks
the exact database name, rejects connection URL overrides and refuses a database
that already contains test users or an edition other than the migration-provided
S11. Use a separate test database for `npm test`.

```sh
npm ci
# Set TEST_DATABASE_URL to the isolated 127.0.0.1 database above.
: "${TEST_DATABASE_URL:?Set the isolated benchmark database URL}"
export DATABASE_URL="$TEST_DATABASE_URL"
npm run db:migrate
npm run build
npm run --silent perf:api > /tmp/oclr-api-baseline.json
```

The runner owns port 31615 on 127.0.0.1 and starts a new server for each mode.
The fixture contains 240 additional accepted players, one assigned referee
fixture and 12 separate player sessions. It initializes a saved availability
record per writer before taking any measurements. Public directory (100 per
page), public player-list SSR, private availability workspace, IRC referee poll,
and versioned availability updates all use the normal route and permission
checks. The benchmark blocks outbound fetch in the worker and fails if any
scenario attempts it. It uses stored/synthetic data and does not measure live
provider latency or background job throughput. The existing worker baseline is
in [#917 verification](verification/issue-917/README.md).

Each mode records one first hit per route, then 30 serial and 72 concurrent
requests per route (12 lanes with six requests each). A first hit for a later
route can reuse a database pool, shared modules and filesystem cache. For an
order check, repeat on a fresh database with `npm run --silent perf:api --
--profile-first`. Run on an idle machine and compare runs with identical
versions and fixture sizes. The report includes HEAD, dirty state, runtime,
platform, PostgreSQL version and workload. Build the application from the same
source before comparing results.

## Read the report

- `httpMs` measures loopback HTTP through response consumption. `handlerMs`
  measures the server handler through response close. `responseBytes` counts
  decoded response bytes, not compressed wire bytes.
- The profiled mode links each HTTP sample to server metrics by a random
  request ID. SQL totals count driver calls (including transaction statements)
  and include driver, server and round trip time. Connection acquisition
  includes connection establishment or pool wait. Concurrent query times can
  overlap. Do not subtract summed driver times from wall time to infer CPU.
- CPU, RSS, heap and event-loop delay belong to the server process per phase.
  Memory is an end-of-phase sample, not a peak. Event-loop sampling uses a
  10 ms interval and a short phase may return no samples.
- Control mode omits per-request driver and handler instrumentation. Both
  modes use the same CPU and event-loop sampling. Compare warm p50/p95 and
  phase CPU across several alternating runs to estimate added probe cost.
  One short run is useful for diagnosing a large difference, with modest
  changes subject to noise and cache order.
- Diagnostic failure records contain request IDs, statuses and numeric
  timings. Status zero means the request failed to complete. There are no
  credential, query text, query parameter, URL, or response body fields.
- Keep public-read and private/write budgets separate. Check statuses, provider
  attempts and query counts first. Evaluate latency budgets using comparable
  runs on a fixed host. Collect measurements with a realistic concurrent
  workload before making claims about production capacity.

The probe uses Node.js [performance measurement APIs](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html).

## Initial local results

Two runs from the #1015 worktree based on `7af27dbf`, with the mode order
reversed for the second run, completed all 2,060 requests with HTTP 200 and no
outbound fetch attempts. Host: macOS arm64, Node 24.22.2, PostgreSQL 17.11.
Other local verification was running, so use these ranges as a starting point
for investigation.

| Route                  | Control HTTP p95, 12 lanes | Profiled HTTP p95, 12 lanes | Profiled SQL calls p95 |
| ---------------------- | -------------------------: | --------------------------: | ---------------------: |
| Public directory       |                  96–100 ms |                      104 ms |                     18 |
| Public player-list SSR |                 272–294 ms |                  285–304 ms |                  23–26 |
| Private workspace      |                   25–30 ms |                    31–37 ms |                     10 |
| Referee poll           |                   52–62 ms |                    56–59 ms |                     24 |
| Availability update    |                   55–69 ms |                    55–73 ms |                     14 |

SSR acquired a pool client 12 times per request at p95 in both runs, compared
with one for the directory API. Its summed acquisition time at p95 was
160–192 ms, with possible overlap between acquisitions. Start by tracing which
SSR lookups acquire their own client under concurrent load. The directory
consistently made 18 driver calls. Evaluate its full-collection work separately
under [#1016](https://github.com/OCLR-dev/OCLR-website/issues/1016). The private
workspace and write paths provide comparison baselines for future changes.

The profiled-minus-control HTTP p95 difference across routes and both runs
ranged from about −15 to +31 ms. The sign changed for several routes when the
order was reversed. Keep detailed profiling confined to this runner and repeat
on an idle machine before estimating a fixed probe cost.

Use zero HTTP failures and zero outbound fetch attempts as hard checks for this
fixture. Use the query-count upper bounds and control p95 ranges above as
provisional review thresholds on the same machine and workload. When a change
exceeds either, repeat the benchmark with both mode orders and investigate a
persistent change. Latency thresholds here are local comparison points.

See the [synthetic provider and worker baseline](worker-performance-baseline.md) for
local provider wait, difficulty synchronization and leaderboard generation.

## Player directory SSR follow-up

A separate driver trace on the synthetic anonymous player page grouped each
statement by pool checkout, counting only work through response close. All
103 traced responses made 11 acquisitions:

| Work before response close                                                                                      | Acquisitions |
| --------------------------------------------------------------------------------------------------------------- | -----------: |
| Site default                                                                                                    |            1 |
| Edition state for the layout, historical check, directory context, directory edition list and appearance scopes |            5 |
| Published draft checks for the layout and the directory Tiers                                                   |            2 |
| Public roster transaction, public name evidence and saved profile cache                                         |            3 |

The original #1015 report also counted an acquisition from `after()`.
The sampler holds a reference to each sample until reporting, so work that
starts after response close can update its driver counters. The latency
measurement ends when the HTTP client consumes the response.

The page now shares the layout's request-scoped edition read. The directory
reuses its edition record and one read-only transaction for the roster,
public name evidence, saved statistics, introductions and Tier evidence.
Archive projections for name evidence are loaded only when a published
archive alias needs verification. Draft data joins the edition's pool
visibility with the released snapshot and can read its turn sequence and
revision in the same statement. The profile refresh checks its throttle
before reloading the published roster. An admitted refresh still reloads
current publication and registration data before contacting the provider.

The first before/after pair used the unchanged `perf:api` runner, Node.js
24.22.2 and PostgreSQL 17.11, with a fresh database for each build. Both
runs returned HTTP 200 for all 1,030 requests. The after run overlapped
the integration suite, so compare the SQL and checkout counts directly
and treat the latency result as a preliminary observation.

| Player-page SSR metric                   | Before (`c37d4dc1`) |    After |
| ---------------------------------------- | ------------------: | -------: |
| Pool acquisitions p95, serial / 12 lanes |             12 / 12 |    5 / 5 |
| Driver calls p95, serial / 12 lanes      |             26 / 25 |  20 / 21 |
| Control HTTP p95, serial                 |             34.6 ms |  36.3 ms |
| Control HTTP p95, 12 lanes               |            266.1 ms | 300.6 ms |
| Decoded response bytes p95, 12 lanes     |             372,649 |  372,649 |

The 12-lane directory API also used fewer driver calls at p95, from 18
to 13, while retaining one acquisition. The SSR acquisition savings
do not establish a latency improvement. The unmodified measurement
still includes some post-response driver work.
