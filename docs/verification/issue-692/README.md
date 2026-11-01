# #692 — Replay management without a time window

2026-11-02 (Asia/Taipei), based on main `846643c7`, Node.js 24.22.2.

The organizer replaced #185's replay-window policy: authorized staff may upload or
delete replays at any time in operational editions. The upload-window section,
Showcase controls and `replay_window` write command have been removed. The client
and server no longer require selection locking or compare the current time with
`showcaseAt`, including within upload/delete transactions. The stage tab underline
remains the sole divider above the round toolbar.

Edition-scoped grants, grant rechecks, Developer/remote read-only behavior, archive
protection, checksum/ruleset validation, parser/storage limits, versions, idempotent
receipts and transactional audit retain their existing enforcement. Existing
selection locks and completed-fixture locks still protect map structure. Saved
legacy fields/audits and the v1 read contracts are retained; no migration or data
rewrite is required. The old selection-lock error was shortened in all three
catalogs to remove its obsolete Showcase wording.

## Verification

- `npm run check`: passed (ESLint and TypeScript).
- `npm test`: 1538 passed, 706 skipped, 0 failures; 191 passing files, 72 skipped.
- New replay-policy tests: 11 passed. They call the actual replay services and
  authorization functions with an in-memory DB adapter and mocked parser/storage.
  Cases cover unlocked/expired/legacy/completed pools, read-only grants, edition
  scope, revocation before writing, archive protection, content/identity rejection,
  stale versions and idempotent retries. They do not verify PostgreSQL locking.
- `npm run build`: passed.
- `npm run i18n:extract` and `npm run test:i18n`: passed; 4 localization tests.
- `npm run read-api:generate`: passed; generated artifacts did not change.
- `npm run read-api:check`: 57 contracts / 181 rows checked, 8 tests passed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed.

No isolated `TEST_DATABASE_URL` was configured. SQL integration cases were updated
for immediate/expired-deadline writes, legacy structural locks and retirement of
the old command, but skipped locally. E2E/component browser suites were updated
where needed and not run, per the organizer's instruction. No live upload/delete,
browser visual acceptance or deployment is claimed.

At the starting main SHA, [scheduled CI 41351288275](https://github.com/OCLR-dev/OCLR-website/actions/runs/41351288275)
had passing verify/build jobs and failing desktop/mobile `referee.spec.ts` cases.
Those are separate from replay-policy verification; no E2E rerun was dispatched.
Current-commit CI results are recorded on the issue/PR.

Before publication, the unpublished commit was replayed without conflicts onto
main `4f431ffa` (incoming practice, calendar and player-workspace updates).
`npm run check`, read-API generation/checks (57 contracts, 181 rows, 8 tests) and
`test:i18n` (4 tests) passed again; generated read artifacts remained unchanged.
The complete test/build counts above precede that rebase; the whole suite and
browser suites were not repeated.
