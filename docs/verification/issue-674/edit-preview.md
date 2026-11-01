# #674 — Hide the repeated edit-form preview

2026-11-02 (Asia/Taipei), based on main `bd4c7a77`, Node.js 24.22.2.

Existing-map edit forms no longer display the duplicate beatmap preview, its
explanatory notes or the Refresh preview button. Successful background lookups
render no container, avoiding an empty grid row. The lookup, Save readiness,
metadata fingerprint, cancellation and lookup-error retry retain their existing
behavior. New-map forms continue to show their preview.

Verification:

- `npm run check`: passed (ESLint and TypeScript).
- `npm test`: 1527 passed, 705 skipped, 0 failures; 190 files passed, 72 skipped.
  No isolated test database was supplied; database-dependent coverage skipped.
- `npm run build`: passed.
- `npm run read-api:check`: 57 contracts and 181 coverage rows checked; 8 passed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Focused lint and TypeScript passed after finalizing the browser regression case.
- `git diff --check`: passed.

E2E and component browser suites were not run, per the organizer's instruction.
The added component case covers a pending lookup disabling Save, hidden preview
details after success, and the version/fingerprint on Save. It uses a controlled
lookup response and has not been executed in a browser during this follow-up.
No deployment or live UI acceptance is claimed.
