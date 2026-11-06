# Organizer-reported historical backfill verification

Date: 2026-11-06 (Asia/Taipei). The organizer supplied the production operator
command output after the #939 upgrade. This is organizer-performed evidence,
independently checked by the agent from the pasted output. No production
connection, secret, raw archive or private MP contents were supplied or accessed.
The output does not include a release SHA; it is not an exact-release health check.

## Observed results

| Command                                           | Observed result                                                                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db:normalize-archives -- --apply --verify`       | S1–S10: 552 documents, 388,102 verified source rows; `current == documents`, zero stale/obsolete, zero created, all ten `archiveReadReady: true`                |
| `db:backfill-archive-reads -- --dry-run`          | Ten saved seasons discovered; all initially `publicReadReady: false`                                                                                            |
| `db:backfill-archive-reads -- --apply --verify`   | Ten derived generations created, all `publicReadReady: true`; 14,414 public plays verified against saved source                                                 |
| `db:backfill-archive-reads -- --dry-run --verify` | All ten ready and verified; every generation ID matches apply; every source hash and projected row count matches preview; every public play count matches apply |

Every season is present exactly once in every command's results. Repeat preview
reports `created: false` throughout. The initial `created: true` values identify
new derived statistical generations; they do not identify new source documents.
Source JSONB and previous derived generations remain retained by the migration
and backfill design. These runs require no MP/provider re-import or result release.

The new generation IDs are not the same scenario as the local rehearsal's
upgrade-in-place: the local rehearsal deliberately began with valid matching old
caches. Production prepared ten new derived generations and then verified their
stable identity on repeat. Both are supported outcomes.

## CI follow-up

The #939 PR CI at `5ab81ede` passed build and check. Its full test run reported
2,557 passed / one failed (2,558 total). The sole failure was an existing
simultaneous-booking test treating equal-time fixture return order as fixture
identity. #941 fixes the test to resolve each fixture by ID, retaining all three
role cases and all reassignment/time-change/cancellation assertions. No runtime
schedule or archive logic changes are needed for that test correction.

The merge commit `fec9c9ea` has the same Git tree as `5ab81ede`. Its own CI was
cancelled after the subsequent main update; it is not recorded as passed. Final
#941 CI evidence is recorded in its PR. E2E: not run (too slow), under ordinary
development policy. Database backfill verification and CI acceptance remain
separate evidence.

The subsequent main `210ffde5` run passed build/check and reported 2,562 passed /
one failed (2,563 total). Its only failure was the new S11 theme being inserted
as legacy site-setting data even though the database correctly forbids that
value. #943 repairs that fixture: the ten historically storable themes keep
their legacy checks; newly registered themes verify application and database
rejection without inventing legacy rows. Both CI test repairs are in PR #942,
with no runtime/schema change. The site-settings case count remains 26.
