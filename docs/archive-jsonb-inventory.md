# Historical JSONB read/write inventory (#929)

Scope: every saved historical archive and reviewed MP snapshot, including S1–S10.
Active-season settings/registrations/live results, account/profile/provider caches
and unrelated application JSONB retain their existing storage. This inventory
tracks stored JSONB; `jsonb_agg`/`jsonb_build_object` used to transport typed SQL
rows are computed query results, not additional saved JSONB documents.

## Normal historical paths

| Entry points                                                                       | Previous remaining JSONB use                                                            | Completed relational path                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readTournament`, `readTournaments`                                                | Full `configuration.archive` before relation reconstruction                             | `archiveEditionStates` pins an immutable typed document with edition/publication metadata; matching archives never leave the DB as source JSONB (#919)                                                                       |
| `publicArchiveStatistics` full season                                              | `archive_read_versions.public_statistics` and `archive_read_plays.payload`              | Seven `archive_rel_summary*` tables reconstruct the whitelisted public summary; existing native play columns restore every score field and optional-field presence                                                           |
| Fixture details / `publicArchivePlayerPlays`                                       | JSONB play payloads; generation check fetched full configuration                        | Native play selection and small `archiveReadIdentity`; detailed source/review data comes from complete typed MP documents                                                                                                    |
| Personal map / career analysis                                                     | Generation guard fetched archive JSONB despite SQL score aggregation                    | Existing SQL aggregate uses the lightweight identity and full generation/manifest/count checks; its mathematics is unchanged                                                                                                 |
| MRA/ranking reads and background source checks                                     | PostgreSQL hashed the entire historical configuration on every request                  | Transaction-maintained `historical_archive_sources.configuration_hash`; same hash as before, preserving valid MRA snapshot identities. Non-archive edition configuration follows the pre-existing path                       |
| `statisticsWorkspace`                                                              | Re-read the old payload-based projection after reconstructing complete source documents | Shared `readHistoricalStatistics` returns complete typed source snapshots, then applies the existing in-memory legacy-review compatibility adapter                                                                           |
| `tournamentCommand`                                                                | Locked/read full archive JSONB and loaded all JSONB revisions for every action          | Lock identity first, hydrate current archive from relations; select only prior rules for rule-version validation; pass the validated archive to transaction synchronization                                                  |
| Statistics import/review/publish/withdraw; roster exchange/substitute confirmation | JSONB mirror writes followed by reading those mirrors again to populate relations       | `persistHistoricalStatistics` writes the compatible mirror and native documents together from command values; unchanged snapshots retain literal legacy representation; all source rows are locked for release/roster checks |
| `syncArchiveRelations`                                                             | Unconditionally loaded full archive JSONB                                               | Use the matching typed document or the validated in-memory archive, with SQL mirror equality before binding source identity. Only stale/unavailable documents and explicit rebuilds need the retained source                 |
| `import-editions`, `backfill-statistics`                                           | Direct full JSONB reads/writes outside the shared storage path                          | Typed readers and the same transactional mirror/document writer; archive identity and current MP contents rechecked under locks after provider work                                                                          |
| Normalization / cache-backfill discovery                                           | Selected every full configuration to discover archive slugs                             | `historicalArchiveSlugs` returns only identities                                                                                                                                                                             |
| Historical exhibition pool import                                                  | Read full source configuration again merely to take a share lock                        | Lock the source identity, then use the existing typed historical pool resolver                                                                                                                                               |
| Referee/streaming/schedule/player-workspace historical eligibility                 | Read archive content to test whether it exists                                          | `editionOperationState` omits the archive and returns a scalar flag; `assertOperationalEdition` selects booleans only; existing permission/refusal behavior remains                                                          |

Every ready public read still checks publication, current edition/archive identity,
statistics manifest, projector/score policy, EZ multiplier and expected play count.
One missing, stale or incomplete generation cannot establish partial publication.
Summary documents are immutable and edition/generation-scoped. Page/API reads
never populate metadata, write cache generations, fetch providers or compute MRA.

## JSONB intentionally retained

| Storage/path                                                                                 | Purpose and access                                                                                              | Why it remains                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edition_state.configuration.archive`, `historical_statistics.draft/published`               | Compatible current mirrors, written only by existing authorized Admin/operator workflows                        | Preserved source evidence, older-release compatibility and safe fallback/rebuild source; no JSONB column or source record is dropped by this migration                                                                      |
| `edition_revisions`, `historical_statistics_revisions`, audit-event details                  | Version evidence, approved audit/backup/export and historical rule acknowledgments                              | Retain original saves, source-only evidence and publication transitions. The MP-history trigger still captures before/after changes transactionally; history is not a second business write model                           |
| `archiveEditionStates`, `readHistoricalStatistics` fallback; `OCLR_ARCHIVE_READ_MODEL=jsonb` | Missing/old/stale/incomplete typed data or explicit read rollback                                               | Preserve working queries and privacy boundaries while recovering/migrating. No request silently blesses or repairs a mismatched source                                                                                      |
| `verifyArchiveRelations`, `verifyArchiveReads`; forced normalization                         | Explicit operator, consistent read-only source comparison / reviewed rebuild                                    | Must read the original JSONB to verify typed values against independent evidence. Verification does not use a JSONB cache as its oracle                                                                                     |
| Legacy `archive_read_*` headers/payloads and `public_statistics`                             | Existing saved cache evidence and old internal `relationalArchive`/`relationalStatistics` compatibility helpers | Retained physically. Current tournament/statistics/workspace/analysis paths no longer call the payload-based helpers. Cache construction retains mirrors for older releases; native public reads do not select these fields |
| S2 `correct-s2-pool`                                                                         | Explicit, revision-checked operator correction already applied by organizer                                     | Needs original archive/snapshots for the narrowly authorized DT5/TB1 correction and exact before/after approval proof; it is not a page query or automatic cleanup                                                          |
| Admin backup, restore and audit                                                              | Existing separately authorized operational boundaries                                                           | A restorable backup/history must preserve source JSONB. This refactor does not change privileges, restore procedures or production services                                                                                 |

There are no remaining planned normal historical archive/MP payload reads in this
scope after migration and both backfills. The retained JSONB paths above are part
of the compatibility, evidence and recovery requirements. Changes to unrelated
live-season settings/registrations/results remain outside the agreed scope.

## Upgrade and verification

Migration **0083** adds seven typed summary tables, summary pointers/play counts,
native optional-field markers and a configuration digest. It updates only new
derived metadata; source JSONB, existing payload/header JSONB, versions, timestamps,
approvals and historical snapshots are retained. New fields allow old writers to
continue safely: incomplete native metadata uses the existing source path until
the reviewed backfills complete. The MRA hash algorithm/policy does not change.

After the normal backed-up deployment/migration, load/export the approved operator
environment as `oclr` as described in [the operator shell guide](archive-relational-queries.md#operator-shell-and-diagnostics), then:

```sh
npm run db:normalize-archives -- --apply --verify
npm run db:backfill-archive-reads -- --dry-run
npm run db:backfill-archive-reads -- --apply --verify
npm run db:backfill-archive-reads -- --dry-run --verify
```

For the supported S1–S10 statistics, each current cache should report
`publicReadReady: true` and successful `verified` facts; normalization still checks
all source documents with `archiveReadReady: true` and zero stale/obsolete. An
unchanged valid old score generation gains the typed summary without replacing
its ID or JSONB; incomplete facts require a new generation while retaining old
evidence. `--rebuild` remains an explicit repair option. No provider import is
needed: **do not use `db:backfill-statistics` for this relational migration**.

`--verify` independently compares the complete native public DTO/score facts with
the retained source. It fails closed on an incomplete summary or score set. The
configured JSONB read rollback remains available without dropping data/tables.
Production operations are separate from local verification and PR acceptance.

Integration coverage compares all ten seasons' public summaries, fixture reports,
workspace, career and map analysis, observes actual returned source/payload fields,
and covers old cache upgrades, source/mirror preservation, missing/corrupt native
data, configuration checksum compatibility, review/publish/withdraw and existing
permission/transaction/concurrency regressions. Commit-specific checks and CI are
recorded in the PR.

See the [local upgrade and regression evidence](verification/issue-929/README.md)
for the pre-0083 CLI rehearsal and the precise limits of local verification.
