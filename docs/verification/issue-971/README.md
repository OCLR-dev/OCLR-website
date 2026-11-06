# Issue 971 — PR 973 review follow-up

Date: 2026-11-07 (Asia/Taipei).

Merged upstream main `466a32c5` into the existing PR branch without rewriting
its history. The review fix addresses abandoned anonymous connections filling
the process's 50 connection slots.

Each successful local connection lookup records activity. At capacity, a new
connection discards the least recently used anonymous connection through the
normal disconnect path, clearing its public snapshots. Entries retained across
HMR without activity metadata are reclaimed first. Anonymous connections have
no expiry or idle timer.

Developer connections are never evicted for capacity. When all 50 entries are
Developer connections, new connections still receive HTTP 503. Reconnecting
with an existing connection ID reuses that slot. Backend expiry, revalidation,
401/403 revocation and sealed credential cleanup retain their existing rules.

The remote-session unit file now has 10 cases (previously 7). The three added
cases cover admission of anonymous and Developer access at anonymous capacity,
recent activity preservation, reclaimed cache cleanup, all-Developer capacity,
and replacement of an existing Developer connection. Existing expiry,
revocation and HMR cases remain. No browser or E2E case was added.

Verification used Node 24.22.2 and the existing npm lockfile:

- `npm ci` and `npm run check`: passed. The initial type check caught two
  missing callback annotations in the added unit tests; the corrected check passed.
- Focused remote-session unit file: 10 passed.
- Full `npm test`: 1,784 passed, one outdated anonymous-capacity assertion failed,
  807 skipped (no isolated test DB configured), 163.83 seconds. The existing
  integration case now fills the map with Developer connections before asserting
  HTTP 503. Its entire affected file passed on rerun: 9 tests, 851 ms.
- Full E2E: not run (too slow). No browser verification was needed for this
  process-memory capacity change.

- `npm run build`: passed.
- `npm audit --omit=dev`: zero vulnerabilities.
- `npm run read-api:generate` / `npm run read-api:check`: synchronized;
  59 contracts, 185 coverage rows and 8 tests passed. Generated files are unchanged.
- `git diff --check`: passed.

The full test attempt under the sandbox could not run local listeners and
subprocess fixtures; the full results above use permission for those isolated
fixtures. No production service, database, role or real credential was changed.
