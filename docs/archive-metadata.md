# Structured historical metadata (#610)

Archive format 2 accepts optional `season: { startsAt, endsAt, timeZone, precision? }`.
Known instants require explicit UTC offsets, start must precede end when both
are known, and the zone must be recognized by Intl. One boundary can be null;
an entirely unknown window stays absent. `precision: day` identifies local-day
boundaries, not invented scheduled minutes. `capturedOn` remains the capture/import date;
it must never supply a missing season date or scheduled match time.

Standings may record `scope: group|final`, `placement: { start, end }`,
`tied`, `qualified`, `official` and `note`. `finalPlacements` accepts the same
metadata plus the existing team ID and source, with required placement and
optional `scope: final`. References, duplicate teams, ordered bounds and edition
team count are validated. A range is not automatically a tie. `official` means
an original official ranking; accepted reconstructions can retain `false`.
Existing scalar rank must agree with placement.start when both are supplied.

Matches may supply `round: { phase, index }` (qualifier/group/swiss/knockout/final),
`format: { bestOf }` (positive odd), `timeZone`, and
`adjudication: { kind, note, evidenceUrl }` (technical/forfeit/cancelled/not-played).
These describe evidence, not permission to approve results, invent player scores
or treat an unplayed match as played. Structured phase takes precedence in player
competition classification. Legacy stage classification remains for older data.
Draw-capable early formats use `format: { maxGames, winsRequired }`: S2 records
8/5 and S3/S4 record 10/6, rather than fabricating an odd best-of or a tiebreak.

Review approval may retain `approvedBy` and an HTTPS `evidenceUrl`. The existing
public projection strips the entire review, including these fields. Adding this
metadata does not release a pending match or alter statistics approval safeguards.

The placement reader uses only explicit final metadata and never parses Chinese
labels. Structured group rows cannot become final places; ranges do not collapse
to a scalar. The legacy scalar reader is retained for unannotated rows to avoid
changing existing published records on deployment. Old archives need an explicit
reviewed metadata update to resolve that historical ambiguity.

## S5 reproducible review package

Run `node --import tsx scripts/prepare-s5-metadata.ts` to regenerate
[the review package](imports/s5-metadata-review.json) from the checked-in approved
standings (publication revision 9), reviewed-import package and MP snapshot.
It covers 12 placement records, 34 matches and 332 raw games. It preserves accepted
joint 5th/7th places and the unsorted 9–12 range without parsing group labels.
It lists candidate pools and unknown/outside-roster UIDs for every game, leaving
all game reviews pending. This package is explicitly non-importable and never
connects to a database or modifies production.

The old MP snapshot lacks accuracy/combo/hit counts. Use the existing normalized
statistics importer to obtain full records, review warmups/replays/non-participants
and publish through edition Admin approval. Pool membership alone is insufficient
to choose scoring games. Unknown UIDs can be unresolved participants, so the report
never automatically excludes them. Confirm the current saved revision before
applying standings metadata; do not replace a live approved archive with the
checked-in pending-review import package.

## Current acceptance — 2026-11-01

S5's 12 coach identities, all UTC+8 dates and all 34 published statistics
fixtures are completed; see [the final deployment receipt](s5-coach-dates.md).
The earlier unresolved-coach/timezone descriptions are superseded.

The organizer accepted the [remaining-season review](issue-610-remaining-review.md)
and confirmed S6 has no reset, with UTC+8 actual competition windows and unknown
dates retained. The [confirmation record](https://github.com/OCLR-dev/OCLR-website/issues/610#issuecomment-6555006692)
does not establish that these new metadata records have been saved or deployed.
The [offline proposal](imports/remaining-metadata-review.json) covers ten seasons,
326 source schedule rows and 110 reconstructed/previously accepted placements.
All ten statistics source keys remain unchanged. Complete local Admin download
bodies stay outside the repository; only public competition facts and input
hashes are retained. [S10's four existing published reviews](imports/s10-exception-review.json)
preserve selected IDs, exclusions and decisions pending a normal native review.

New code adds staff reason/evidence controls, typed-round and explicit-placement
consumption, removes free-text interval parsing, and exposes optional public
`seasonWindow`. Reconstructed records use the existing translated “Derived
placement” label; a place band does not create a precise finish or award a podium
position unless an exact place or explicit tied-third decision supports it.
S2's final date and unsupported historical identities/metadata remain unknown.
The organizer also accepted the new Chinese staff labels on 2026-11-01.
Deployment, native application and public readback remain separate gates. No missing dates, UIDs, score decisions
or historical reviewers are fabricated. The structured snapshot implementation
is described below.

This implements the metadata and statistics program portion of #610. The issue must remain open until
reviewed data is applied and the public season/match/player acceptance checks pass.

## Initial verification — 2026-10-31 (99fd5814)

Node 24.22.2 and `npm ci` were used in an isolated checkout based on main
`3e92a17c`. The full DB-free test run passed 1,371 tests, with 646 skipped
(including unavailable database integration coverage); the final focused archive,
player and read-contract run passed 45 tests. `npm run read-api:generate`, the
contract drift check, `npm run build`, `git diff --check` and the production
dependency audit (zero vulnerabilities) passed. A first restricted-environment
full run hit deployment/listener/lock failures; the normal-permission rerun above
passed. No isolated test database was configured, so database integration and
full desktop/mobile application E2E were not performed. These results do not
establish production import, publication, organizer acceptance or CI success.

## Structured statistics review snapshots

`statistics-snapshot.ts` owns the runtime schema shared by storage reads, command
validation and publication/public-read checks. New reviews persist an optional
`adjudication: { kind: "technical", note?, evidenceUrl? }` or `null`, rather than a
boolean. Only the existing technical exception is supported; this cannot award
player scores or turn forfeits/unplayed matches into player appearances. Every
MP source in an adjudicated fixture must retain its explicit decision, and all
existing roster, complete-history, game eligibility and selected-count checks
still run. Edition Admin authority is checked both before and inside the locked
transaction. Optimistic versions and transactional audit are preserved.

`excludedGames` lists every unselected source game exactly once, with one of
`warmup`, `aborted`, `superseded-replay`, `post-match`, `outside-pool`, `other` or
`unknown`. Selected, duplicate and nonexistent IDs are rejected. Reason labels
are reviewer claims, never inferred from map identity, score or lobby membership.
For legacy callers that send only selected IDs, the server retains existing
reasons for still-excluded games and records new omissions as `unknown`.

The server stamps `reviewedBy` (authenticated osu! ID) and `reviewedAt` on each
successful review; clients cannot submit them. Optional snapshot `evidenceUrl`
and adjudication evidence must use HTTPS without credentials. Omitted evidence
is preserved on an existing draft; explicit `evidenceUrl: null` clears it.
Evidence is not required when unknown. These fields and the complete decision
are retained in the automatic review audit. Reviewer/evidence data is available
only in the existing authorized staff workspace; public match projections expose
only the enum exclusion reason and the existing technical notice, with raw score
facts and privacy filtering unchanged.

Storage remains JSONB. No SQL migration or bulk data rewrite is needed: a read
adapter converts legacy `technicalAdjudication: true` to `{ kind: "technical" }`
and fills missing excluded-game reasons with `unknown`, in memory. It never
invents a past reviewer, timestamp, note or evidence URL and never writes during
a GET. A subsequent normal review/publish writes the canonical representation.
Legacy request flags are still accepted for the existing manager; contradictory
structured/legacy decisions are rejected. Existing controls preserve richer
adjudication notes and exclusion reasons when saving through the old payload.
Published data remains separate from draft edits.

The saved-read contract is now additive v1.14.0 after integrating main’s independent 1.13.0 profile artwork changes. New staff metadata, public
`placingRange` and match `excludedReason` fields are optional on the wire so older
backends remain readable. Player cards show explicit placement intervals as
intervals (for example `9–12`); those intervals do not become precise best/worst
finish values. Unknown placement still renders `—`. No new Chinese wording or
historical data has been approved by this implementation.

## Follow-up verification — 2026-10-31

The complete DB-free suite passed 1,385 tests, with 648 skipped. After correcting
one missing field in the new synthetic test fixture and including reviewer
provenance in unpublished-change detection, the six affected unit test files
passed all 43 tests. Final `npm run check`, `npm run build` and
`npm run read-api:check` passed; generated contracts are synchronized. Production
dependency audit reported zero vulnerabilities; documentation links and
`git diff --check` passed. No locale catalogs or authored Chinese messages changed.

Two new real-PostgreSQL integration cases cover structured writes, server-owned
provenance, version conflicts, automatic audit, old-client resaves, private
publication boundaries and legacy JSON reads without write-back. They were not
executed here: this session's isolated initdb failed because the host's SysV
shared-memory IDs were exhausted, including with an attempted mmap configuration;
Docker's daemon was also unavailable. No existing database or service was reused
or altered. DB-free tests separately verify exception authorization before the
transaction and after taking the edition lock, reject forged reviewer fields,
and exercise snapshot migration, invalid exclusions, source eligibility and
public evidence filtering. Actual DB transaction coverage remains for CI or an
isolated test environment. Full desktop/mobile browser acceptance and production
data review/import/publication remain outstanding.

## PostgreSQL integration acceptance — 2026-10-31

The previous local database limitation is resolved for #610. Tested application
commit `dcf76ffa4cc53e1afac5f425c3f382c3d4d93684` against a newly initialized,
UTF-8 PostgreSQL 17.11 cluster, with Node 24.22.2. All migrations completed, and
**7 integration files / 64 tests passed, zero failed or skipped** in 10.95 seconds.
See [the per-test result record](verification/issue-610-postgres/result.json).

Coverage includes `archive-statistics`, `historical-archive`, `player-history`,
`players`, `read-api`, `archive-player-exchange` and `directory-statistics`.
Both previously unexecuted #610 transaction cases passed: structured decisions
with server-owned provenance, audited versions and private evidence; and legacy
published JSON reads without rewriting or fabricating review evidence. The
suite also checks edition permissions, stale versions, original source facts,
review/publish/withdraw boundaries, published snapshot preservation, roster
revalidation and public/remote read projections. Provider HTTP calls remain
mocked by the existing synthetic fixtures; the database transactions are real.

The host had 32 allocated System V shared-memory IDs, equal to its SHMMNI limit.
Only one orphan was removed after two checks confirmed owner/creator `emik`,
56 bytes, zero attachments, last attached PID zero and creator PID 15254 absent.
That object (SHMID 983044) had never been attached. No attached IPC object,
system limit, existing database directory or existing service was changed.
PostgreSQL requires a small System V allocation even with mmap; see the
[PostgreSQL kernel-resource documentation](https://www.postgresql.org/docs/17/kernel-resources.html).

The new cluster used only `/private/tmp/oclr610-pg/data`, loopback port 56610,
role `oclr610_test` and database `oclr_610_test`. `DATABASE_URL` and
`TEST_DATABASE_URL` explicitly selected that same disposable target; the isolated
checkout had no `.env.local`. No existing preview or production database was
connected to. After the run, this session stopped only its own cluster and
confirmed its IPC was released; the three pre-existing PostgreSQL server
processes retained their original PIDs. Temporary synthetic files/logs remain
under `/private/tmp/oclr610-pg/` for inspection; no test server is left running.

This closes the selected #610 local PostgreSQL verification gap. It does not
claim full-site browser acceptance, CI success, production import/publication,
or resolution of missing official historical evidence. The prior DB-free and
build results remain separately recorded above; only documentation/evidence
changes were needed after this integration run.
