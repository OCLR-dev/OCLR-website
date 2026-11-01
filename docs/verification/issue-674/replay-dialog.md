# #674 — Compact replay dialog follow-up

2026-11-02 (Asia/Taipei), based on main `0731f81b`, Node.js 24.22.2.

The organizer requested removing the replay-identity explanation, reducing the
list/upload area's size and opening it in a separate window from the replay icon.
The existing native-dialog pattern now presents the replay list and upload form
in a bounded modal. Map rows retain their original height. The list count and
reload icon share a compact toolbar; upload help uses an existing translated
8 MiB prompt without a note box. Wider screens place file and description fields
beside each other; narrow screens stack them. Empty lists no longer render an
empty list container or blank error paragraph.

The dialog uses the shared appearance materials, existing translated labels,
native modal focus containment, Close and Escape, and restores focus to the replay
icon. Uploading/deleting blocks dismissal until completion or explicit upload
cancellation. Delete confirmation remains a separate native dialog above the replay
window and returns focus to its reload control. The selection lock, Showcase
deadline, read/write grants, validation, versioned requests, progress, cancellation,
retry and download behavior retain their existing implementations.

## Verification

- `npm ci --no-fund --no-audit`: completed with the existing lockfile.
- `npm run check`: passed (ESLint and TypeScript).
- `npm test`: 1527 passed, 705 skipped, 0 failures; 190 files passed, 72 skipped.
  No isolated `TEST_DATABASE_URL` was supplied; database-dependent tests skipped.
- `npm run build`: passed.
- `npm run i18n:extract`: passed; existing catalogs did not change.
- `npm run test:i18n`: 4 passed.
- `npm run read-api:check`: 57 contracts / 181 coverage rows checked, 8 tests passed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed.

E2E and component browser suites were not run, per the organizer's instruction
and the current ordinary-development policy. Their cases were updated for dialog
opening, row geometry, close/focus return and the separate delete confirmation.
No browser screenshots or real upload/delete checks are claimed for this follow-up.
The previous screenshots in this directory document the earlier icon-toolbar
implementation, before this dialog change. No production operation is included.
