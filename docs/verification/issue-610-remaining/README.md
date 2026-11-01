# #610 remaining-season preparation verification — 2026-11-01

The organizer accepted the reconstructed placement policy, retained conditional
rows, UTC+8 actual competition dates, S6 no-reset conclusion and new Chinese
staff labels. [Acceptance record](https://github.com/OCLR-dev/OCLR-website/issues/610#issuecomment-6555006692);
[review and wording table](../../issue-610-remaining-review.md).

The first sections record program/preparation checks; the final section records
the completed native production application and public readback separately.
Source base: main `a451747f48c10db8012cc7435995dd2eb65500ca`;
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
The organizer explicitly accepted the three additional Chinese selector labels
on 2026-11-01, recorded in [the issue](https://github.com/OCLR-dev/OCLR-website/issues/610#issuecomment-6555466690).

The original feature SHA `0d70bac3` and merged `e9e61494` both completed CI
successfully: [feature run](https://github.com/OCLR-dev/OCLR-website/actions/runs/41286485258),
[merge run](https://github.com/OCLR-dev/OCLR-website/actions/runs/41286516619).
Those passes do not establish deployment or the later editor follow-up's CI.
The follow-up feature `dacaeba0` and merged `eaea425e` subsequently completed CI
successfully: [feature run](https://github.com/OCLR-dev/OCLR-website/actions/runs/41287838236),
[merge run](https://github.com/OCLR-dev/OCLR-website/actions/runs/41287867191).

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

## Production application and public readback

The organizer reported deployment of PR #655. Unauthenticated `/api/health`
returned `eaea425e1d910479d378990837b18e206a4ac652`, including the final
readback on 2026-11-01. This is the deployed program; newer unrelated main
commits are not described as deployed. The organizer performed deployment.

All production writes used the existing authenticated native Admin UI. Before
each import the freshly downloaded whole edition/revision matched the prepared
base. One edition at a time was temporarily unpublished, validated, saved as a
draft, opened in private preview and read back. Each saved archive exactly
matched its approved import, with other edition fields preserved, before it was
republished. Three milestones per edition were entered through the native
settings form and saved with `precision: "day"`. Native minute controls save
end-of-day as 23:59; the UTC+8 calendar dates match the approved windows. The
archive season windows retain their exact approved boundaries.

| Season | Final revision | Covered / eligible fixtures | Published plays |
| ------ | -------------: | --------------------------: | --------------: |
| S1     |             40 |                       19/40 |             654 |
| S2     |             16 |                       18/29 |             793 |
| S3     |             13 |                       13/30 |             720 |
| S4     |             18 |                       17/33 |             882 |
| S5     |             34 |                       34/34 |           1,716 |
| S6     |             46 |                        0/34 |               0 |
| S7     |             15 |                       21/21 |           1,384 |
| S8     |              9 |                       38/38 |           2,834 |
| S9     |              9 |                       22/22 |           1,704 |
| S10    |             10 |                       30/30 |           2,113 |

All ten final editions are published. Unauthenticated tournament API results
match their final revisions, season windows and three saved phase milestones.
All 110 final placement rows match the accepted review; a playing-roster
representative for every team was independently read from the public
participation API and matches its exact range, `official` and `tied` values.
Native public player cards were checked for all ten seasons, with additional
5–6 band checks in S4/S8/S10. They display the accepted derived placement;
those bands do not create a third-place badge. The existing unit checks cover
the explicit “—” fallback and typed metadata without free-text rank parsing.

All **12,800** previously published plays match their pre-application raw facts
and canonical hashes, and all ten statistics source keys remain identical.
Games, distinct players and zero counts also match. S5 retains 251 games,
72 players, 1,716 plays and 217 real zero scores. The table's denominator is
the eligible fixture count: S1 and S2 respectively have only 38 and 23 MP URLs,
while their eligible fixture counts are 40 and 29; both values are unchanged.
This application does not import missing early-season statistics.

S9 and S10 each retain all six conditional source rows with an explicit
`not-played` adjudication, null score and no MP URLs. S10 match-3/18/26/30
were saved and approved/published with the existing 39 selected games and
309 public plays. The five excluded games now have explicit aborted,
superseded-replay or post-match reasons and MP evidence. Raw games, player
scores, nonparticipant exclusions and roster decisions remain unchanged.
Match-26 retains its existing technical adjudication: official 7:6, selected
raw-game wins 8:5, underlying cause not established. Its explanation does not
invent player technical points. All four public detail reads have no rating
issues; the selected/excluded game IDs match the accepted plan. Current server
review stamps are recorded without publishing reviewer identities.

S6's June 27 final/no-reset confirmation is saved. S2's final date and season
end remain null; S3's two conflicting final formats, unresolved identities,
unsupported map titles and unavailable MP sources remain explicit unknowns as
accepted. No historical reviewer, scheduled instant or player score was inferred.

Firefox's JSON viewer Save reused an earlier response for one repeated URL;
the S7 verification initially encountered revision 13 instead of the saved
revision 15. A distinct read-only checkpoint URL returned the current result,
which matched the native publication page and unauthenticated public API.
Subsequent snapshots used distinct URLs. No duplicate production write was
performed to compensate for the stale download.

The [sanitized production receipt](post-deployment.json) records revisions,
dates, hashes, public placement/card checks and S10 review receipts. Whole Admin
responses and full import files remain local. No production DB access, runtime
credential access, direct write request or agent-run deployment was used.

The receipt branch starts from main `df42d6e4`. After that fast-forward,
`read-api:generate` produced no drift and `read-api:check` passed (57 contracts,
176 coverage rows, eight tests). The placement display/metadata checks passed
four tests. Receipt totals, final edition comparisons, local documentation
links, private-field review, Prettier and `git diff --check` passed. This final
commit changes documentation only; no new application build or E2E was run.
