# Historical JSONB completion verification (#929)

Date: 2026-11-06 (Asia/Taipei). Scope: the remaining saved historical
archive/statistics paths listed in the
[inventory](../../archive-jsonb-inventory.md), for all supported S1–S10.
Initial baseline: main `f6ebb7bc`; integrated main `ad7d568d` before the final
affected checks. No production connection, migration, provider request or service
operation was performed by this session.

## Source preservation and actual CLI upgrade rehearsal

Two separate, loopback-only PostgreSQL 17 databases with `test` in their names
were used. They contain synthetic fixtures only. The upgrade rehearsal used the
actual pre-0083 implementation (`bf8dc650`, equivalent to merged #920), migrated
through 0082, to save ten editions, twenty MP source records, ten valid public
score generations, and one ready background MRA/ranking generation.

The candidate code then ran the actual operator entry points, in order:

```sh
npm run db:migrate
npm run db:normalize-archives -- --apply --verify
npm run db:backfill-archive-reads -- --dry-run
npm run db:backfill-archive-reads -- --apply --verify
npm run db:backfill-archive-reads -- --dry-run --verify
```

Observed results:

- Normalization: ten seasons, fifty source documents, 14,780 verified typed rows,
  zero stale/obsolete documents, zero newly created source documents, and all ten
  `archiveReadReady: true`.
- Before the cache upgrade, all ten old generations correctly reported
  `publicReadReady: false` because they had no typed summary pointer.
- Apply and repeat verification: all ten `publicReadReady: true`; nineteen native
  public play rows per season. Every old generation was upgraded in place
  (`created: false`) and kept its original generation ID.
- Independently compared every pre-existing column of `edition_state`,
  `edition_revisions`, `historical_statistics`,
  `historical_statistics_revisions`, `archive_read_versions`,
  `archive_read_plays`, `archive_relation_documents`,
  `archive_relation_heads`, `historical_archive_sources`,
  `player_leaderboard_versions` and `player_leaderboard_rows`. All retained rows
  and values were identical. Additional immutable summary documents and new
  derived columns were the only additions.
- Every season's complete public statistics DTO was identical to the old
  implementation. Instrumented driver results returned zero source archive
  JSONB values and zero legacy header/summary/play payload values.
- The source checksum, ready MRA generation, calculation timestamp, and all
  ranking rows were unchanged. No background recalculation was necessary.

This is a local synthetic upgrade rehearsal. The organizer's previously supplied
S1–S10 production normalization evidence (552 documents / 388,102 rows, #919)
predates migration 0083 and does not establish that this candidate is deployed.

## Regression evidence

New integration coverage checks complete public summaries, fixture details,
workspace results, career/map analysis, and actual SQL driver fields for every
season. It also covers review/withdraw/republish, literal legacy published JSONB
preservation, summary corruption/missing pointers, missing native facts,
incorrect play-count metadata, idempotent repairs, and checksum compatibility.
Existing source, audit, permissions, roster/publication, mathematical, and
transaction/concurrency coverage is retained.

- Local full run before the final main integration: 289 files passed; one
  multi-stage migration test exceeded its original 15-second limit. Test totals:
  2,552 passed, two platform skips, one timeout. This run is **not** recorded as a
  full pass.
- The expanded pre-0077 → 0081 → 0082 → 0083 upgrade scenario now uses the same
  explicit 60-second budget as the other multi-stage migration tests. All
  preservation/upgrade assertions remain. No global timeout was changed and no
  test was removed or skipped to address the timeout.
- Final affected run after merging main: four files / 43 tests passed, including
  that migration, remaining-JSONB coverage, historical pool import and streaming.
  An earlier affected run also passed all six files / 64 tests after adapting old
  synthetic fixtures to the new metadata columns and native fact-count guard.
- Read API regeneration/check: 59 resources, 185 coverage rows, eight tests
  passed. The three generated runtime artifacts were byte-identical after
  regeneration; source/response contracts are unchanged.
- E2E: **not run (too slow)**, following the ordinary development/CI policy.
  No new browser workflow or interface wording was introduced by this change.

Final lint/types/relation-generation, production build, production dependency
audit and commit-specific CI results are recorded in the PR. CI status is
separate from deployment and organizer acceptance. The operator upgrade steps
and retained JSONB rollback paths are in the inventory; the provider-based
statistics import is not required for this migration.
