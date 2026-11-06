# Historical JSONB correction and relational reads (#899, #900, #902, #905, #911, #913, #919)

JSONB remains the authoritative saved evidence. Corrected current data and old
evidence are different versions: S2 GS never had DT5 or TB1. They must be removed
from the current saved archive, not hidden by a presentation filter. S2 Final
DT5/TB1 and every other season/pool are unaffected. The captured public inventory
in `docs/imports/early-season-mappools.json` remains evidence of the old save.
New Admin archive imports correct those two slots at the write boundary.

The [remaining JSONB read/write inventory](archive-jsonb-inventory.md) records the
completion of native public summaries/facts, lightweight generation checks and
transactional mirror/document writes (#929). It lists the JSONB kept for evidence,
compatibility, audits and explicit recovery, and the migration 0083/backfill steps.

## Operator shell and diagnostics

On the managed Rocky host, systemd loads `/etc/oclr/runtime.env` for the service.
An interactive root shell does not inherit that service configuration. The npm
operator commands load ordinary Next.js environment files, and do not load the
external systemd EnvironmentFile automatically. Open the application-user shell
and export the existing configuration before running the commands below:

```sh
sudo -u oclr -H bash
cd /opt/oclr/current
set -a
. /etc/oclr/runtime.env
set +a
export NODE_ENV=production
npm run db:normalize-archives -- --dry-run
```

Keep that shell open for subsequent S2/backfill operations; after `exit`, repeat
the environment setup before another command. Do not source the runtime file as
root, print it, or paste connection URLs into arguments/chat. The setup above
does not change the environment file, migrate a database, restart a service or
apply data changes. Use the normal deployment workflow for missing migrations.

Normalization errors include a safe diagnostic code, phase and validated season
where available. `DATABASE_URL_MISSING` requires the shell setup above;
`42P01`/`42703` indicates missing schema, `42501` indicates database privileges,
and `28P01` indicates authentication. Network failures have an allowlisted code
such as `ECONNREFUSED`. `DATA_VALIDATION` identifies saved-source validation;
review that season privately. Error messages never include driver SQL, parameters,
source values or connection strings. The process exits nonzero and does not
continue to later seasons; earlier season transactions may already have committed.

## S2 operator correction

Use the reviewed release and an explicitly configured operator database. This is
an operator data operation, not an automatic page read or a public web endpoint.
No provider credentials, MP refresh, role grants or new result approval are used.

```sh
npm run db:correct-s2-pool -- --dry-run
npm run db:correct-s2-pool -- --apply --expected-revision=N
```

The default is a read-only preview. Substitute the actual revision from that
preview for `N`. Applying locks S2, checks the revision and requires a completed
archive without registration. It preserves the old configuration revision,
creates a new revision, removes only the two GS slots and records an automatic
`archive_pool_correction` audit event. A repeat at the current revision is a no-op.

The archive fingerprint includes pool slots, so simply deleting rows would make
released statistics stale. Before updating the fingerprint association, this
operation compares every current draft/released selected-score projection at the
edition's configured EZ multiplier and revalidates every currently released
fixture against both archives, including its complete MP set. Any change or
invalid release aborts the whole transaction. Recorded picks/bans and their
fixture coverage must also remain unchanged; a ban referencing a removed slot
requires review instead of silently becoming unknown. Stale snapshots stay stale. Raw MP
sources, game selections, exclusions, adjudications and publication timestamps
are not rewritten. Statistics versions advance only for changed associations.

Deploy/activate the renderer without the old display filter together with this
correction; until the operator applies it, old JSONB intentionally remains visible
as saved. Do not mistake merging code or a local synthetic test for correcting
the production database. Verify the raw saved GS has neither slot, Final retains
its own slots, and released plays, review choices and coverage are unchanged.

## Relational rollout

The following implementation stages retain the same public/private projections,
publication checks and saved read API contracts. Derived tables must be
reconstructible from preserved JSONB, with explicit source and projector versions;
unknown values and source ordering must survive reconstruction. No historical
person becomes an account, a registration or a staff grant.

### Implemented stages

Migration `0077_historical_relational_reads.sql` is additive. It first retains
all existing MP statistics in `historical_statistics_revisions`; a transactional
trigger then captures before/after JSONB on every subsequent insert, update or
withdrawal/deletion, even between read-model backfills. Revision rows reject
UPDATE/DELETE. A content hash deduplicates identical records without losing
same-version corrections. This does not grant any new authority to publish.

The migration creates a version manifest plus typed relations for teams, people/participation, draft picks,
fixtures/rounds, fixture MP links, pools/maps, standings/final placements,
draft/published MP snapshots, games, individual source scores, review decisions
and validated public score facts. UID, team, phase, slot, map, scores, accuracy,
combo, hit counts, mods, timestamps and placement fields can be queried directly.
Small JSONB payloads retain exact optional fields, provenance and source details
needed to roundtrip the existing contracts. They are not a second writable master.

Unknown identities have nullable UIDs and no account/role foreign key. Source
scores use their source position as identity, so unknown/duplicate UIDs and actual
zeroes survive even when those records are ineligible for publication. Raw game
team colors remain separate from reviewed player-team attribution. Original
scores and EZ-adjusted scores remain separate; existing integer rounding,
relative-score denominators, raw team winners and coverage rules are reused.

Migration `0078_historical_source_manifests.sql` adds a small digest sidecar for
each saved MP row. Its initial backfill does not update source rows or create
additional historical revisions. An AFTER INSERT/UPDATE trigger updates the
digest in the source transaction, including legacy edits that do not increase
the source version. Source deletion removes only the sidecar; immutable JSONB
history remains. The source table gains no columns and its JSONB is unchanged.

Projector v2 stores a public summary with explicitly selected fields, source
manifest hash, score-policy version and EZ multiplier. A matching public
statistics read verifies archive/configuration identity and these small digests,
then reads validated public plays without loading draft/published MP JSONB.
Missing metadata, old generations, changed policy and any source edit use the
existing snapshot validation path, reading complete relations when available or
preserved JSONB otherwise. Source and digest reads share the same database
snapshot. Backfill locks source rows while building its generation so a concurrent
legacy update cannot associate old facts with a newer digest.

Local player-map analysis selects complete games associated with the player's
roster teams or teams observed in counted appearances. All participants remain
available for ranking, field averages, team-size classification and raw-score
winners; games where the player sat out remain in the team-map denominator.
Team/game indexes support this scope. Unrelated games can be omitted without
changing the analysis. Detailed fixture
reports load MP sources only for the requested fixture. Remote clients continue
to use the same saved-read resources and response fields.

### High-frequency player-map aggregation (#911)

Migration `0080_archive_analysis_indexes.sql` adds a typed map title to existing
validated score facts, populated from their retained payloads. It adds two partial
covering indexes for counted scores (`raw_score >= 2000`): generation/UID/game/team
and generation/team/game. The existing generation/game index retrieves all
participants in the player's games. Original JSONB, payloads, generations and
immutable revisions are retained; no source result or publication is changed.
The migration updates derived rows and builds indexes transactionally, so allow
for its write locks in the normal reviewed deployment window.

The profile's historical map analysis now uses SQL competition ranks, game means,
team totals, explicit winners and distinct team-game counts. Only personal map
rows and the team-map denominator are returned. Bench games count toward team
participation without transferring their individual scores. Ranking/means use
every counted participant; duplicate UIDs retain their best competition rank.
Raw scores establish team winners unless the existing projection resolved a
winner. Source-ordered floating-point sums, the score threshold and ties match
the existing model. Final personal-map sorting, categories, mods and career
summary arithmetic share the existing TypeScript implementation.

This uses the same public-generation guard as other cached statistics reads in
one read-only repeatable snapshot. Unpublished editions, changed archives,
configuration, source digests, score policy or EZ multiplier cannot use stale
facts. Missing generations fall back to the existing validated complete-relations
or JSONB pipeline. Live approved results and remote read contracts are unchanged.

Existing matching projector-v2 generations gain this SQL path after migration.
Complete normalization alone does not prepare the optional validated score cache.
On the intended operator host, with the reviewed release, approved configuration
and a restorable backup, preview and populate it using the existing commands:

```sh
npm run db:backfill-archive-reads -- --dry-run
npm run db:backfill-archive-reads -- --apply
```

Both discover all saved historical archives; optional slug arguments restrict the
scope. Normal application writes still synchronize complete relations and
invalidate stale score generations; rerun this optional backfill for updated
stable archives. `OCLR_ARCHIVE_READ_MODEL=jsonb` retains the existing read rollback.
No backfill occurs during public requests. See the [#911 verification record](verification/issue-911/README.md)
for exact equivalence, migration preservation and synthetic query-plan evidence.

The pure projector roundtrips the archive and each source snapshot before a
version is saved. Object-key ordering is ignored only for JSONB content hashes;
array order and missing-versus-null fields remain significant. Existing
`statisticsArchiveKey`, source fingerprints and result approvals are preserved by
read-model backfill. Each generation identifies the edition revision, full saved
statistics manifest, projector version and score policy/EZ multiplier.

### Complete relations for every historical season (#905)

The player-profile follow-up (#913) batches complete relation reads: the public
season catalogue reads current document pointers for all visible seasons once,
then uses one `UNION ALL`/`jsonb_agg` query to transport their typed entity rows.
A fully normalized catalogue needed three queries at that stage regardless of the season count,
instead of one query per entity per season. Single-archive and MP snapshot reads
also batch their entity tables. Each document is decoded and hash-checked against
its own current source; stale or incomplete seasons fall back independently.
These JSON query results are transport values, not new saved JSONB or a process
cache. Publication and source changes are rechecked on subsequent reads. The
profile retains all its season panels and immediate switching. No additional
migration or backfill is required for this follow-up. See the [#913 investigation](verification/issue-913/README.md).

### Direct archive reads after migration (#919)

Migration `0082_archive_relational_cutover.sql` adds the small
`historical_archive_sources` digest sidecar and a nullable source digest on each
archive current head. It initializes source identities without updating source
configurations, timestamps, versions, approvals or JSONB history. A configuration
trigger maintains the digest transactionally, including legacy archive edits that
do not increase the edition revision. Non-archive changes preserve the identity.
Removing an archive removes only its digest; immutable documents/history remain.

Once an existing head has been verified and its digest populated, a tournament
read compares the small source/head identities and pins the immutable document
in the same statement that selects edition/publication metadata. That statement
omits `configuration.archive` from the returned configuration. One batched typed
query reconstructs every selected archive and checks its canonical content hash.
Ready catalogue and individual-season reads need **two queries**, and transfer
no source archive JSONB. Requests do not calculate source JSONB hashes or write
migration metadata. The remaining tournament settings/rules retain their existing
configuration storage and contracts, including active-season registration data.

Missing source metadata, old heads/codecs and source changes select the preserved
JSONB directly. An incomplete typed document causes a full source-row reload,
including the current publication flag, rather than mixing configuration revisions.
Other seasons keep their valid relation path. Public sanitization, private source
appendices, source ordering and every existing API response shape are unchanged.
Normal authorized archive/statistics writes keep JSONB and complete relations
synchronized in the same transaction. This is a read cutover for historical data;
the preserved JSONB remains saved evidence and the compatibility/rebuild source.

After the reviewed migration/deployment and normal restorable backup, use the
operator shell described above:

```sh
npm run db:normalize-archives -- --dry-run
npm run db:normalize-archives -- --apply --verify
npm run db:normalize-archives -- --dry-run --verify
```

Every historical season must report `current == documents`, `stale: 0`,
`obsolete: 0`, `archiveReadReady: true` and successful `verified` counts. The total
`archiveReadReady` is the number of ready seasons and must equal `seasons`.
Immediately after migration, existing typed documents can be current while
`archiveReadReady` is false: the normal apply verifies their source association
and fills head metadata without rebuilding unchanged documents (`created: 0`).
Full `--verify` checks stored typed values, beyond manifest readiness. Do not use
`--rebuild` for the normal upgrade. It remains available for repairing incomplete
derived documents while retaining prior versions. Missing source metadata can be
repaired by the same apply without changing source JSONB.

`OCLR_ARCHIVE_READ_MODEL=jsonb` still selects the original source reader and
retains all derived evidence. No rollback requires dropping tables or deleting
JSONB. No production migration or cutover is implied by local tests or a merge.

Migration `0079_complete_archive_relations.sql` adds 31 typed domain relations
and immutable document versions with mutable current pointers. This covers every
field of the historical archive and statistics schemas: teams/identities, picks,
standings/placements, fixtures and match-review games, maps/difficulty variants,
season dates, source facts, qualifiers and individual qualifier scores, replacement
rosters, review tables, MP participants/events/games/scores/provider fields, and
all saved review decisions. Nested scalar attributes become typed columns;
repeated objects have child tables and composite foreign keys. Scalar lists use
native PostgreSQL arrays. Arbitrary provider keys and difficulty values have typed
key/value rows. These relations introduce no JSONB columns or payload blobs.

`archive_relation_documents` identifies the edition, MP/review kind where
applicable, codec version and full content hash. Every child belongs to that
document and its parent row; current pointers also enforce the edition/document
key scope. Source positions, optional-field presence and explicit null markers
preserve unknowns, empty lists, real zeroes and source ordering. Document versions
and their rows reject UPDATE/DELETE. Moving/removing a pointer never removes old
typed evidence, source JSONB or immutable source history.

The schema and layout are generated from the existing strict Zod schemas:

```sh
npm run archive:relations:generate
npm run db:generate -- --name=reviewed_schema_change
npm run archive:relations:check
```

The generated [schema](../src/db/archive-relational-schema.ts) and
[layout](../src/lib/archive-relational-layout.json) are committed. `npm run check`
detects schema drift; the codec rejects unknown fields instead of silently
discarding evidence. Reconstruction uses parent indexes in memory, so large MP
score collections are not repeatedly scanned for each game.
Increment `ARCHIVE_RELATION_CODEC` when changing interpretation/encoding; older
documents remain saved and fall back until normalized under the new codec.

Tournament archive saves, roster corrections, S2 correction, statistics
import/review/publication/withdrawal and operator import tools synchronize typed
documents in the same source transaction. Only changed documents are encoded;
an unchanged published snapshot reuses its existing document when a draft changes.
A typed insert failure rolls back source writes, pointers, revisions and audit
writes together. This does not publish data, create accounts or change permission
checks. Raw JSONB remains saved and is still available for verification/rollback.

Readers prefer matching complete relations and retain the existing public
sanitizers and analysis algorithms. Scoped fixture reads select only that
fixture's document identities and MP data. A legacy/direct SQL source change
invalidates the digest association, so incomplete or stale typed data falls back
to the preserved JSONB. The v2 validated public-score cache remains a faster
optional layer; a stale cache can be recomputed from complete typed snapshots.
Remote resource parameters and response schemas remain unchanged.

### Saved-only backfill and rollout

After applying the migration, first preview/correct S2 as above. Then:

```sh
npm run db:normalize-archives -- --dry-run
npm run db:normalize-archives -- --apply --verify
npm run db:normalize-archives -- --verify
# Optional: refresh the validated public-score cache as well.
npm run db:backfill-archive-reads -- s2 --dry-run
npm run db:backfill-archive-reads -- s2 --apply
npm run db:backfill-archive-reads -- --dry-run
npm run db:backfill-archive-reads -- --apply
```

Omitting slugs selects saved historical editions only. No provider request runs.
A preview takes a read-only consistent snapshot and reports counts/hashes without
private source content. Apply locks one edition at a time and inserts its whole
generation in one transaction. Normal reruns are idempotent, including concurrent
backfills. Use `--apply --rebuild` to create a fresh generation for unchanged
sources if repairing derived data; previous generations and original JSONB remain.
An interruption never activates a partly inserted generation.

After upgrading from projector v1, run the same preview/apply commands to build
v2 generations. Existing v1 generations stay saved and fall back to JSONB until
rebuilt. Applying migration 0078 alone does not activate the faster reader.

Tournament reads reconstruct the same archive shape before the existing public
sanitizer runs. The statistics workspace can read reconstructed private snapshots;
public statistics can query indexed validated score facts by fixture, UID, team,
stage or beatmap. Existing algorithms, UI and read API schemas remain in place.
Source-only appendices and raw MP/event/review data are never public just because
a derived generation exists. Remote frontend mode still uses its backend contract
and performs no local DB access.

A cache generation is used only when its source identity and projector version
match. New drafts, refreshed sources, changes to the EZ policy, publication and
withdrawal invalidate the score cache; the existing validated published-snapshot
pipeline can read the transactionally synchronized complete relations immediately.
Business writes do not duplicate an entire season. Re-run the optional score
backfill when an updated stable archive should use the faster cache again.
Existing seasons require the complete-relations apply above after migration;
before that, or after an unsupported legacy write, JSONB remains the fallback.

The normalization command discovers every saved archive, including S1–S3, without
a season allowlist; it also supports future valid historical editions. Output
contains counts only: expected/current/stale documents, obsolete pointers, created
versions and verification row counts. `--verify` compares all saved typed values
with preserved JSONB in a read-only consistent snapshot and fails for stale or
incomplete data. A normal apply is idempotent; `--apply --rebuild` creates fresh
document versions while retaining all previous evidence. Each season commits
independently. No live-season business JSONB is converted by this historical tool.

For a read-path rollback, set `OCLR_ARCHIVE_READ_MODEL=jsonb` and restart the
application with that exported environment. This changes only the reader: it does
not restore the erroneous S2 slots, delete JSONB, drop derived tables or alter any
approval/publication state. Do not down-migrate a serving database.

### Verification and limits

Local checks use synthetic records in a separately initialized loopback-only
`oclr_archive_test` PostgreSQL instance. Tests compare pre/post-backfill tournament
and public projections, the staff workspace, player/history/competition records,
map performance and public match statistics. They exercise private appendices,
concurrent idempotency, stale-source fallback and withdrawal. Package roundtrips
cover all eight maintained S4–S10 import files, including both S6 packages.
The [#902 verification record](verification/issue-902/README.md) also covers
transactional digest maintenance, a 0077-to-0078 upgrade, scoped SQL and exact
analysis equivalence against the forced-JSONB reader.
The [#905 verification record](verification/issue-905/README.md) covers complete
typed documents, all-season discovery, a populated 0078 upgrade, transactional
incremental writes and source/relational equality for every saved field.

Actual production correction/backfill, deployment and performance improvement are
not established by these tests. Current JSONB must be inspected through the
operator preview on the intended host, then applied at its actual revision. No
production credentials or database are needed for development verification.
