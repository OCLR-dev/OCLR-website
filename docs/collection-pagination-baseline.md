# Saved collection pagination baseline (#1016)

The public tournament list, public edition player directory and private
Developer tournament list previously rebuilt the complete filtered collection
on every page. Each request also serialized and hashed that collection. The
tournament summaries made an extra pause query for every open registration
window, although the source row already carried the pause state.

All three routes still authenticate and apply the existing query and response
contracts on each request. After authorization, a page may reuse its projected
collection and SHA-256 for the exact same PostgreSQL primary snapshot. The
snapshot is checked inside the same read-only transaction used for projection.
A database write that changes snapshot visibility forces a reload. If its
projection remains identical, the previous collection version remains valid.
Changes in the visible projection produce the existing 409 restart response.
Standby connections bypass reuse.

The cache is process-local and isolated per pool and projection. Private
entries are also keyed by the authenticated subject. Limits are 12 entries
and 4 MiB of serialized weight per pool, with at most 15 seconds of reuse.
That weight is a size limit for admitted projections, not a heap estimate.
The cache expires earlier when a registration opens/closes or a saved profile
becomes stale. An unavailable projection is not admitted. These limits do
not delay publication changes or token revocation. Old and new servers compute
the same hash over the same ordered JSON data. No frontend upgrade is required.

## Reproduce

Use Node.js 24 and a freshly migrated PostgreSQL test database named
`oclr_collection_benchmark_test` in a disposable loopback cluster. Use a clean
worktree without Next.js environment files. For each run, use a fresh database.

```sh
: "${TEST_DATABASE_URL:?Set the isolated benchmark database URL}"
export DATABASE_URL="$TEST_DATABASE_URL"
npm run db:migrate
npm run --silent perf:collections > /tmp/oclr-collections.json
```

The runner invokes the real HTTP handler in process using synthetic requests.
It includes authentication, SQL, JSON serialization and response consumption,
with no network transport. It checks all rows were collected and versions stayed
consistent. It records wall and CPU time, SQL calls, connections, response bytes
and end-of-page process memory. It refuses outbound fetches. SQL totals include
transaction control and, on private pages, token and grant checks.

Local comparison on macOS arm64, Node 24.22.2 and PostgreSQL 17.11. The baseline
uses `4efe5f86` with the same measurement script copied into that checkout.

| Collection               | Rows / pages | SQL calls, before → after | Full traversal, before → after | Response bytes, both runs |
| ------------------------ | -----------: | ------------------------: | -----------------------------: | ------------------------: |
| Public edition directory |   1,000 / 20 |                  280 → 91 |                    346 → 56 ms |                   464,995 |
| Public tournament list   |       25 / 5 |                  145 → 21 |                     40 → 10 ms |                    13,565 |
| Private tournament list  |       33 / 7 |                  238 → 64 |                     75 → 22 ms |                    19,525 |

For the directory, the first page took about 33 ms in both runs and used
14 → 15 SQL calls. Later pages used 14 → 4 SQL calls and avoided rebuilding
and hashing the full directory. Each collection was projected and hashed once
during the after traversal, versus once per page before. Highest sampled
end-of-page heap during the directory traversal was about 112 → 76 MiB.
Individual timing and memory readings depend on runtime and garbage collection.
Unrelated database writes may cause conservative cache misses.
