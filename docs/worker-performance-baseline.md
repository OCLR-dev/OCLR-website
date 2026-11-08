# Synthetic provider and background worker baseline (#1015)

`perf:workers` complements the [API baseline](api-performance-baseline.md).
It runs the existing osu! client, difficulty sync and leaderboard worker in
a dedicated Node.js process. A separate loopback HTTP process serves fixed
synthetic responses. The benchmark redirects only the allowlisted osu! paths
and refuses every other fetch. It supplies synthetic credentials and uses
the application's real pacing, OAuth token reuse, retry and timeout.

## Reproduce

Use Node.js 24 and PostgreSQL 17. Create a fresh database named
`oclr_worker_benchmark_test` in a disposable PostgreSQL cluster listening on
`127.0.0.1`. The connection URL must include the port. Use a clean checkout
without Next.js environment files. The fixture seeds its own archive and
rejects a database already used for a benchmark. Create a fresh one per run.

```sh
npm ci
# Export TEST_DATABASE_URL for that dedicated loopback database.
: "${TEST_DATABASE_URL:?Set the isolated worker benchmark database URL}"
export DATABASE_URL="$TEST_DATABASE_URL"
npm run db:migrate
npm run --silent perf:workers > /tmp/oclr-worker-baseline.json
```

The command runs separately from ordinary CI. The report records the commit,
dirty state, Node and PostgreSQL versions, fixture sizes, and phase metrics.
It contains no URLs, request bodies, credentials or SQL text.

## Workloads

- **Provider client.** First lookup obtains an OAuth token. Five isolated
  calls each at 20 ms and 250 ms compare programmed network wait, with time
  between samples outside the measurement. Three concurrent calls expose
  pacing. A single 503, a 429 and an 11-second fixture delay exercise retry,
  rate limiting and the real client timeout. Each expected status and
  request sequence is checked. These are direct calls to the same provider
  client used by the application.
- **Difficulty sync.** Preview, refresh two published NM maps against the
  20 ms provider, then run again with fresh snapshots. The first run must
  save both and the second must make zero provider calls. This case measures
  base difficulty synchronization.
- **Leaderboard.** Seed one historical edition with synthetic match evidence
  and backfill typed relations before sampling. Measure first generation,
  five unchanged-source checks and five forced rebuilds. A ready saved
  generation is required and reports rated maps per second for builds.
  This complements the [earlier snapshot vs. request comparison](verification/issue-917/README.md).

For each phase, `wallMs` measures the full operation and `cpuMs` measures
the benchmark Node process. RSS and heap are end-of-phase samples. Event loop
delay uses 10 ms sampling. A short phase may return no sample. PostgreSQL
metrics count driver calls and connection acquisitions and include time waiting
for their callbacks or promises.

Each provider entry records elapsed time to response headers and the offset
when fetch started. A null status identifies a fetch aborted before headers.
The full operation includes pacing, parsing, retries and database work. Parallel
fetch durations can overlap. These timings measure behavior under local injected
delays. They exclude real network and TLS costs, and they do not measure a
production timer schedule.

## Initial local reference

Node 24.22.2 and PostgreSQL 17.11 on macOS arm64. One archived edition,
61 rated games, 12 players and two distinct NM beatmaps. Ranges below span
the samples within a run and are comparison points for this fixture.

| Phase                                     |          Wall time | Driver work and provider behavior                             |
| ----------------------------------------- | -----------------: | ------------------------------------------------------------- |
| Cold OAuth plus first lookup              |             1.14 s | Two HTTP calls, about 63 ms to headers in total               |
| Warm isolated lookup, 20 / 250 ms fixture | 24–32 / 256–260 ms | One call per sample, no OAuth refresh                         |
| Three concurrent 20 ms lookups            |             2.23 s | Three successful calls, roughly 1.1 s apart                   |
| Retry one 503                             |             1.56 s | A 503 followed by a successful retry                          |
| 429 / stalled upstream                    |    26 ms / 10.01 s | One call each, with the stall mapped to client 502            |
| Difficulty sync / fresh recheck           |     1.13 s / 11 ms | Two saved maps, 6 driver calls / 4 driver calls and zero HTTP |
| Leaderboard first generation              |              92 ms | 31 driver calls, zero HTTP                                    |
| Leaderboard forced rebuild                |           54–66 ms | 31 driver calls each, about 925–1,120 rated maps/s            |
| Leaderboard unchanged-source check        |         1.4–2.1 ms | 6 driver calls each, zero generations created                 |

Check outcome, fixture size, and SQL/provider call counts before comparing
wall times. Difficulty sync with a fast provider is dominated by request
pacing in this fixture. An unchanged leaderboard source returns before the
rebuild. Review increases in either worker's driver work or provider calls
even when a small timing difference is within run-to-run variation.
