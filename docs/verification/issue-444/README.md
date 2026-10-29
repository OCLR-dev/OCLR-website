# Fixture editor conflict recovery (#444)

Base: `c9aea22` (upstream main). Local verification on 2026-10-28,
using synthetic data and dedicated loopback PostgreSQL test databases.

Before opening the PR, synced upstream `0ed5101` and retained both upstream
and #444 translation additions. `npm run check` and `npm run test:i18n`
(4 tests) passed again after that sync. The broader results below were recorded
for implementation commit `094a850`; that implementation is unchanged.

## Behavior

- An open editor keeps its original fixture snapshot and unsaved fields.
  Refreshed workspace props are compared by fixture ID, version and referee
  assignment revision; they never silently rebase a draft onto a new version.
- When the snapshot changes, all editor mutations are disabled, including
  publication, deletion and any open confirmation. Focus moves to a warning
  explaining that the draft remains visible and loading will discard it.
- **Load latest fixture version** explicitly replaces the snapshot and remounts
  the entire mutation area. Fields, publication state, expected version,
  assignment revision and old confirmation/error state are replaced together.
- A missing fixture disables the retained draft with an unavailable notice.
  Loss of management access disables mutations or removes the editor when the
  authorized page refreshes. Server authorization and concurrency checks remain
  unchanged.

## Passing checks

- `npm ci` with Node.js 24.19.0 and the existing npm lockfile.
- `npm run check` (ESLint, Next.js route types and TypeScript).
- `npm run build` (production build).
- `npm run i18n:extract`; filled both Chinese catalogs.
- `npx vitest run tests/integration/fixtures.test.ts tests/integration/fixture-delete.test.ts tests/unit/i18n.test.ts`:
  **27 passed**. Includes the existing authoritative stale-version checks.
- `npm run test:e2e -- tests/e2e/fixture-conflicts.spec.ts tests/e2e/fixtures.spec.ts --project=desktop --project=mobile`:
  **14 passed**, including the existing fixture/referee workflows.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- `git diff --check`.

The new browser cases cover two separate administrator sessions, a save rejected
with 409 at version N after another operator edits and publishes, preservation
of the old draft, explicit reload, and a successful subsequent save using the
latest version and server fields. They also cover publication conflicts,
assignment-only deletion conflicts (same fixture version), concurrent deletion,
and revoked edition Admin access. Light/dark screenshots and editor overflow
assertions run on desktop and mobile; the warning receives focus after refresh.

Saved visual evidence: [mobile light](mobile-light.png) and
[mobile dark](mobile-dark.png).

## Full-suite limits

`npm test` completed: **169 files passed, 16 failed; 1,409 tests passed,
72 failed, 3 skipped**. Failures include Windows-incompatible `/bin/sh` and
symlink assumptions, synthetic Replay compression, durable-media path checks,
archive/import subprocesses, read-API generation and existing request-body test
mocks (missing `assertCapability`). These modules are outside this patch;
the full suite is not reported as passing.

The complete site-wide browser matrix was not run. No hosted/production data,
deployment, current CI result or maintainer acceptance is claimed. The new
Simplified/Traditional Chinese recovery wording awaits organizer review.
