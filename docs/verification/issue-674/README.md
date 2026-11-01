# #674 — Compact mappool entry actions

The 2026-11-02 follow-up moves replay management into a compact modal:
see [replay dialog verification](replay-dialog.md). The screenshots below document
the original toolbar implementation.

Local verification on 2026-11-01 (Asia/Taipei), using Node.js 24.22.2.

The entry footer now groups edit, metadata refresh, confirmed removal and replay
disclosure as four icon buttons. Their 44px geometry and secondary styling reuse
the existing compact beatmap actions. Existing translated names remain available
through accessible labels and hover titles. Removal keeps its confirmation dialog;
unsaved sorting disables map edits and the inline form while replay reads remain
available. Locked and read-only workspaces retain the replay entry point.

## Verification

- `npm ci --no-fund --no-audit`: completed with the existing lockfile.
- `npm run check`: passed (ESLint and generated route types / TypeScript).
- `npm run build`: passed.
- `npm run test:components -- mappool-actions.spec.ts --workers=2`: 20 passed.
  The actual editor components use synthetic fixtures and intercepted HTTP.
  Coverage includes English, Simplified and Traditional Chinese, light/dark,
  desktop and 320px mobile, four buttons on one row, accessible names and titles,
  keyboard editing/focus return, versioned refresh/removal requests, confirmation,
  sorting guards and locked/read-only replay access. CSS theme declarations are
  compiled through the installed Tailwind PostCSS plugin for this fixture.
- `npm test`: 1093 passed, 513 skipped, 1 failed. The failure is
  `tests/unit/read-api-dx.test.ts`: the generated extended read contracts differ
  from their current source inputs. Those contract files were not changed by this
  UI task. The separate remote coverage generator check passed (140 rows).
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed.

The affected full-app E2E cases were listed successfully (10 desktop/mobile cases),
but not executed. No isolated `TEST_DATABASE_URL` was configured. Automatic review
rejected starting the database-backed E2E command with that configuration. An
attempt to create a separate disposable PostgreSQL cluster under
`/private/tmp/oclr-674-pg` failed during initialization because the host could not
allocate a shared-memory segment. Existing databases and services were not changed.
The DB-free component browser checks above are separate from backend authorization
or full application E2E acceptance.

## Visual evidence

All screenshots contain synthetic content. Reviewed the light desktop and dark
mobile captures; both place the four actions on one row.

- [Light desktop](desktop-light.webp)
- [Dark desktop](desktop-dark.webp)
- [Light mobile](mobile-light.webp)
- [Dark mobile](mobile-dark.webp)
- [Entry preview](actions-preview.png)

## Main integration

On 2026-11-01, the organizer explicitly requested merging into `main` and waived
E2E execution. The focused patch was transferred to
`codex/674-mappool-icon-actions`, based on current main `91209711`. The existing
working checkout and its unrelated edits were preserved. Newer main changes,
including candidate beatmap integration, ordering-note cleanup and the component
test host's additional fixtures, were retained.

The results above describe the initial working checkout. Non-browser verification
of the integrated patch is recorded below; E2E is omitted per the organizer's
explicit instruction. No deployment or production operation is included.

Integrated-patch verification:

- `npm ci --no-fund --no-audit`: completed with current main's lockfile.
- `npm run check`: passed (ESLint, generated route types and TypeScript).
- `npm test`: 1516 passed, 699 skipped, 0 failures (188 passing files, 72 skipped).
  Database-dependent coverage remains skipped without an isolated test database.
  The initial checkout's generated-contract failure does not occur on this base.
- `npm run build`: passed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed.
- E2E and component browser tests were not rerun, per the organizer's instruction.
  The 20 earlier component checks remain evidence for the initial implementation.

Immediately before pushing, main advanced to `ab57051d` with the schedule selection
update (#676 / #677). The unpublished commit was replayed onto that main. The only
conflict was in the component host's route selection; both schedule and mappool
fixtures were retained. The verification counts above precede that rebase; focused
lint, type checking and fixture compilation were repeated after resolution.
