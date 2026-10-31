# #612 — Click-time BP recording, independent IRC commands

2026-10-31, Asia/Taipei. Branch `codex/immediate-bp-record`.

The pool action calls the existing `record_selection` API immediately. Only a
successful authoritative response updates the ledger/next step and prepares the
map command. IRC connectivity is not a prerequisite. The prepared command carries
an already-recorded label; new UI queue requests contain no deferred selection.
Later command confirmations/failures cannot add or retract a BP decision. The
legacy server selection/confirmation API remains compatible for existing clients.

An in-flight ref blocks burst clicks. Save failures do not prepare a new command;
unknown outcomes retain the same request key for an idempotent retry, including
command preparation after the retry succeeds. Simulation records on click and
simulated sending only updates command history. Its burst-click guard lasts
through the current microtask boundary. Server permission, dependency, version,
Ban/Pick/TB and result/history checks remain in the existing recording service.

## Evidence

- Node 24, npm with the existing lockfile. Check passed after updating the old
  desktop-launch test fixture to the renamed component label prop; the initial
  type/build failure was that stale test fixture. The corrected build passed.
  A final build verifies the simulation burst-click adjustment separately.
- Available full test run: **1,359 passed, 645 skipped**. Affected launch/i18n/DX
  rerun: **8 passed**. Dependency production audit: **0 vulnerabilities**.
- Actual browser component: **14 interaction cases passed** across desktop/mobile
  (offline Ban/Pick, pending/late receipts, conflict, response loss/same-key retry,
  burst clicks, simulation and read-only access). Additional **6 locale/theme
  cases passed**, including 320px, plus the affected retry and final burst cases.
  HTTP is synthetic; real components and their actual state handling are used.
- Database integration adds independent plain-command confirmation and command
  failure cases after direct recording. The existing full-site E2E expectation
  now requires the record before queuing and forbids a deferred selection intent.
  No isolated database is configured on this host: those DB/E2E cases were not run
  locally and await CI. No real IRC room operation was performed.
- Formatting/diff and catalog checks passed. CI uses the repository's ordinary
  checks scope; browser checks remain separate and no full matrix is claimed.

Exact commit/build/CI results are linked on #612 after completion. No deployment,
official-result publication or real tournament data change is claimed.
