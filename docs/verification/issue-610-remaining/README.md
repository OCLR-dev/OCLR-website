# #610 remaining-season preparation verification — 2026-11-01

The organizer accepted the reconstructed placement policy, retained conditional
rows, UTC+8 actual competition dates, S6 no-reset conclusion and new Chinese
staff labels. [Acceptance record](https://github.com/OCLR-dev/OCLR-website/issues/610#issuecomment-6555006692);
[review and wording table](../../issue-610-remaining-review.md).

This records program/preparation checks, not deployment or production data
application. The issue stays open until native Admin application and public
readback. Source base: main `a451747f48c10db8012cc7435995dd2eb65500ca`;
branch `codex/610-remaining-archive-review`. Actual commit and CI are recorded
in the PR/issue handoff.

## Local checks

- Node 24.22.2; `npm ci`, final `npm run check` and `npm run build` passed.
  The first restricted-permission Turbopack build stopped making progress and
  was terminated after verifying its process cwd. Normal-permission builds
  completed; no unrelated preview or production process was stopped.
- Full `npm test`: **2,146 passed, 2 failed, 2 skipped**. Both failures were
  test-environment role capabilities in `admin-backup` and `deployment`, not
  assertions against the changed program. After configuring the isolated
  harness, `admin-backup` passed; PostgreSQL 17 requires the cluster owner for
  the deployment test's fixture-role/database creation, and that rerun passed.
  This is not described as a green initial full run.
- Final affected unit/read/i18n batch: **10 files, 71 tests passed**; the
  additional playing-roster/coach/banded-podium service tests passed **2/2**.
  They cover typed rounds independent of misleading labels, explicit final
  bounds, capped BO8/BO10, unknown boundaries/day precision, unchanged source
  keys and raw facts, failed-closed elimination paths, source-linked room dates,
  retained review fields and staff read-only rendering.
- `npm run read-api:generate` and the final `npm run read-api:check` passed:
  56 generated contracts, 174 coverage rows and eight contract/DX tests.
  Generated runtime contracts/OpenAPI are committed with the source changes.
- `npm audit --omit=dev`: zero vulnerabilities. The first sandboxed registry
  request had a DNS failure; the normal-permission registry request succeeded.
- JSON/source counts, source-key equality, formatting and `git diff --check`
  passed. E2E/Playwright was not run (too slow under the ordinary-work rule).

Database checks used only the dedicated `/private/tmp/oclr610-pg/data` cluster,
loopback port 56610 and `oclr_610_test`. The fixture role's temporary CREATEROLE
was restored to its original disabled state. The cluster was stopped after
testing. No existing preview/production database, credentials or services were
used.

## Reproduction and application guards

### Native milestone editor follow-up

Branch `codex/610-milestone-precision-editor`, based on merged `e9e61494`, adds
the native precision selector and retains its value in the save payload. Its
two serializer tests verify null boundaries, unchanged instants, legacy payload
compatibility and removal of local row IDs. Related serializer/timeline/i18n
checks passed 10 tests; final `npm run check`, `npm run build`, read-contract
check (eight tests), formatting and diff checks passed. No schema or dependency
change required a new DB rehearsal. E2E was not run under the ordinary-work rule.
The three additional Chinese selector labels are separately submitted for review.

The original feature SHA `0d70bac3` and merged `e9e61494` both completed CI
successfully: [feature run](https://github.com/OCLR-dev/OCLR-website/actions/runs/41286485258),
[merge run](https://github.com/OCLR-dev/OCLR-website/actions/runs/41286516619).
Those passes do not establish deployment or the later editor follow-up's CI.

### Data preparation

`node --import tsx scripts/prepare-remaining-archive-metadata.ts INPUT_DIR OUTPUT_REVIEW_JSON`
reads explicit local Admin downloads named `s1.json` through `s10.json`. A third
absolute output-directory argument prepares full native-import files locally;
that directory must be outside the repository. The tool never contacts services
or writes to a database. Whole Admin bodies and complete import files are not
committed.

[The review package](../../imports/remaining-metadata-review.json) includes the
ten actual input revisions/hashes, 110 placements, 326 source schedule rows,
phase/date metadata and source references. All ten statistics keys remain equal
before/after. [The public baseline](baseline.json) records exact coverage,
game/player/score/zero counts and canonical score-fact hashes for post-application
comparison. S1–S4 statistics are partial and S6 has zero published plays; the
proposal does not claim to import their missing statistics.

Before a native write, download the current saved edition again and compare
the revision and complete edition/archive to the prepared base. Preserve any
intervening edits and regenerate/review the difference rather than overwrite
them. Apply via the existing Admin UI and restore publication, then compare
actual saved metadata and every public score fact with the baseline.

[S10's four review plans](../../imports/s10-exception-review.json) retain all
selected games, raw scores and existing decisions. After deployment, use the
new native reason/evidence controls, save each current-version review and
approve/publish normally. Server-side actor/time stamps must be current; no
historical reviewer is invented. S2's final date remains null, S3's two
conflicting final BO formats stay unspecified, and unsupported identities/map
titles stay unknown.
