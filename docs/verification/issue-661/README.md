# Commentator and Mapper staff roles (#661)

Implemented on `codex/staff-commentator-mapper`, based on main
`4d02cfa44ce717d6542466b1af0ad0a31af43bf9` (2026-11-01 Asia/Taipei).
The base commit's [CI run](https://github.com/OCLR-dev/OCLR-website/actions/runs/41294052986)
completed successfully; this is baseline evidence, not CI for the new change.

## Behavior

- Adds `commentator` (解说 / 解說 / Commentator) and `mapper`
  (作图 / 作圖 / Mapper) to existing global/edition staff assignments.
- Uses the existing multi-role editor, confirmation, default public visibility,
  hiding, revocation, scope checks, stale-write protection and transactional audit.
- Adds separate About groups and localized saved-role labels. Existing beatmap
  metadata labels and historical staff source records keep their existing meaning.
- Both roles have no operational or Developer read capabilities. Mappooler remains
  the separate role for mappool selection/management. Explicit additional roles
  continue to combine within their authorized scopes.
- Regenerates saved-read DTOs and OpenAPI so remote staff reads accept both roles.
- Migration `0068_commentator_mapper_roles` adds enum values only; it requires
  deployment/migration before either role can be assigned on a running backend.

## Verification

Node.js 24.22.2, npm with the existing lockfile (`npm ci`). Tests use only the
separate `oclr_661_test` and `oclr_661_browser_test` databases on a loopback
test PostgreSQL 17 instance.
The existing application checkout and local environment files are untouched.

- `npm run check`: passed.
- `npm run i18n:extract` and `npm run test:i18n`: passed (4 tests).
- `npm audit --omit=dev`: passed (0 vulnerabilities).
- `npm test`: passed (256 files, 2,163 tests passed, 2 skipped).
- `npm run build`: passed. The initial sandboxed build stalled; the same command
  completed with the process permissions needed by Next.js.
- `npm run test:e2e` for `public-staff`, `staff-role-set` and `staff-role-ui`,
  desktop/mobile: passed (16 tests, 1.7 minutes). Full-site browser regression
  was not run.
  Port 3100 was occupied by an existing process; temporary copies of these three
  specs, the provider fixture and a temporary config used port 31661 with matching
  origins and the existing test-database/provider guards. The existing process
  was left running. All five temporary files were removed afterward.
- Affected test-file ESLint, Prettier and `git diff --check`: passed.
- Visually inspected desktop/mobile Traditional Chinese dark staff forms and the
  mobile public Commentator section.

This feature branch has no per-commit CI run yet; its local results above do not
establish CI or release acceptance. Browser screenshots and command logs are
retained under `/private/tmp/oclr-661-browser-results` and
`/private/tmp/oclr-661-*.log` on the authoring machine.

The migration regression starts before migration 0068, preserves an existing
Designer grant/audit event, applies both new values, inserts grants and audits
for both roles, and checks repeat migration behavior. Staff integration coverage
checks both scopes, default publication, hiding, retained visibility, revocation,
permission isolation, scoped Admin denials and saved-read decoding. Browser
coverage exercises assignment/edit/reload, public visibility and revocation,
three locales, light/dark, existing public appearances and narrow layouts.

No deployment, production migration or real staff assignment is part of this work.
Issue acceptance and closure remain with the maintainer.
