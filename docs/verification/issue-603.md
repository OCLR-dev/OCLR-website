# #603 — One BO setting with linked BP/TB

2026-10-31, Asia/Taipei. Includes the pending #602 NF simplification.

- Competition rules have the sole editable BO input. Required map wins are
  read-only (`(BO + 1) / 2`). Referee rules no longer offer a second BO input;
  first-to TB scores are also derived and read-only.
- A BO change through `round_rules` acquires the referee advisory lock before
  edition/round work. It checks both round version and the displayed policy
  revision, then saves scoring and the resized existing BP policy atomically.
  Picks total `2 * (wins - 1)`; TB uses `wins - 1`. Bans and retained restrictions,
  command settings and replay limits survive. Newly added Picks alternate.
- Existing policy permission, pool-entry, active-selection and completed-history
  guards run even for an unchanged policy during a linked series update. Failures
  roll back the scoring change as well. No recorded event is rewritten, no
  approved snapshot is updated and no migration is required.
- A missing policy stays an unsaved draft; published S11 templates continue to
  follow the saved scoring series. Other scoring/ranking settings keep their
  existing explicit configuration and release workflow.

Node 24, npm and the existing lockfile. Local check passed. Available test run:
**1,297 passed, 629 skipped**. Focused series/i18n/generated-contract run: **10
passed**. Browser component run: **28 passed**, desktop/mobile, three locales,
light/dark, single BO, read-only wins/TB, synchronized reload and NF behavior.
An initial desktop page-load timeout passed unchanged in a targeted retry and
the complete browser rerun; no timeout or assertion was weakened. Browser HTTP
responses are synthetic. Formatting/diff checks passed; production dependency
audit reported **0 vulnerabilities**. Build and exact PR/main CI status are
recorded on the PR/issue after completion.

The fresh isolated PostgreSQL initialization failed at `shmget` because the host
exhausted shared-memory IDs. Existing databases/services/kernel settings were
not changed. DB-backed integration and full-site E2E were not run locally. Added
DB cases cover linked BO/Pick/TB save, stale policy revision, audit-failure
rollback and concurrent saves, with active/locked-history checks extended to the
new entry point. These await commit-specific CI evidence. The final concurrent
DB case was added after the available run above and remains unexecuted locally.
