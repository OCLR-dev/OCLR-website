# Competition service modules

This inventory records the service splits under #1013. Browser and API
entry points are described in [Service and Next.js boundaries](next-service-boundaries.md).

| Responsibility | Current entry points |
| --- | --- |
| Edition configuration and publication | [tournament-reads](../src/lib/tournament-reads.ts) serves saved configuration and staff workspaces. [tournaments](../src/lib/tournaments.ts) owns configuration and publication commands. [content](../src/lib/content.ts) provides edition lookups for callers. |
| Registration | [registration-reads](../src/lib/registration-reads.ts) serves availability and personal applications. [staff-registration-reads](../src/lib/staff-registration-reads.ts) serves staff lists, details and export. [registrations](../src/lib/registrations.ts) and [staff](../src/lib/staff.ts) own player and staff commands. |
| Appointments and rosters | [captain-reads](../src/lib/captain-reads.ts) and [team-reads](../src/lib/team-reads.ts) serve staff, personal and public queries. [captains](../src/lib/captains.ts) and [teams](../src/lib/teams.ts) own the commands. |
| Draft | [draft-reads](../src/lib/draft-reads.ts) serves staff, captain and public reads. [draft](../src/lib/draft.ts) owns transitions, picks and publication. [draft-setup](../src/lib/draft-setup.ts) checks structural locks. |
| Mappools | [mappool-reads](../src/lib/mappool-reads.ts) reads saved pools, [mappool-preview](../src/lib/mappool-preview.ts) handles protected beatmap lookups, and [mappools](../src/lib/mappools.ts) owns official pool changes. [mappool-workbench-reads](../src/lib/mappool-workbench-reads.ts) serves saved candidates and comments, [mappool-workbench-preview](../src/lib/mappool-workbench-preview.ts) handles candidate previews, and [mappool-workbench](../src/lib/mappool-workbench.ts) owns candidate and comment changes. |
| Schedule and results | [fixtures](../src/lib/fixtures.ts) owns official fixture changes. [schedule-reads](../src/lib/schedule-reads.ts) serves schedule workspaces, and [schedule](../src/lib/schedule.ts) handles requests and approvals. [result-review](../src/lib/result-review.ts) reads saved reviews, [result-import](../src/lib/result-import.ts) handles MP previews and imports, [results](../src/lib/results.ts) handles review and publication, and [public-competition](../src/lib/public-competition.ts) serves published competition data. |
| Referee | [referee-workspace](../src/lib/referee-workspace.ts) reads the assigned workspace. [referee](../src/lib/referee.ts) owns referee commands. [referee-irc-reads](../src/lib/referee-irc-reads.ts) serves IRC state and room bindings, [referee-irc](../src/lib/referee-irc.ts) owns browser commands, [referee-irc-relay](../src/lib/referee-irc-relay.ts) owns desktop relay, and [referee-mp](../src/lib/referee-mp.ts) coordinates multiplayer evidence. |
| Historical data | [historical-archive](../src/lib/historical-archive.ts) defines archive records and publication rules. [archive-relations](../src/lib/archive-relations.ts) and [archive-read](../src/lib/archive-read.ts) read typed sources and saved projections. [archive-relation-writes](../src/lib/archive-relation-writes.ts) synchronizes typed documents. [archive-statistics-reads](../src/lib/archive-statistics-reads.ts) reads statistics, and [archive-statistics](../src/lib/archive-statistics.ts) owns statistics commands. |

## Tournament configuration

Previously, reading a saved edition or the staff workspace loaded the
tournament commands and draft snapshot writer. The website and versioned API
now call [tournament-reads](../src/lib/tournament-reads.ts) directly. Public
reads still filter publication in the database and project historical data
through the public archive view. Staff reads retain edition authorization,
and transaction callers can pass their reader to the same saved edition query.

[tournaments](../src/lib/tournaments.ts) owns the write transaction. Updates
lock the edition and recheck capability and the expected configuration
revision before changing settings. A capacity edit refreshes team capacity,
setup version and draft snapshots in that same transaction as configuration
history and audit. Historical relation updates stay in the transaction.
The capacity test rejects the audit insert and confirms that all of those
capacity-related writes roll back. Retrying the update commits one revision
and advances both draft views.

## Registration

Previously, registration availability, personal applications and staff
queries loaded submission or review commands. The website and versioned
API now use [registration-reads](../src/lib/registration-reads.ts) and
[staff-registration-reads](../src/lib/staff-registration-reads.ts). Detail
and export queries resolve the configuration revision saved with the
application or attempt. Staff export keeps its authorization and
repeatable-read scope.

Submission runs provider eligibility checks before taking the edition lock.
The transaction rechecks configuration version, eligibility freshness and
registration availability before saving the application, attempt history and
audit. Review checks the application's timestamp under the edition and
registration locks, then commits the decision and audit together. An
integration test verifies that a failed review audit leaves the application
and its acknowledged configuration and eligibility intact. Retrying commits
one decision against the original application snapshot.

## Captain appointments and teams

Previously, reading an appointment, team or staff setup also loaded the
captain and team commands. The pages and versioned API now call
[captain-reads](../src/lib/captain-reads.ts) and
[team-reads](../src/lib/team-reads.ts) directly. Staff queries keep their
edition capability checks and repeatable-read scope. Public roster and coach
details still require published captain and team identities and a finalized,
published roster. The owner's team view reads the saved captain snapshot.

The command modules lock the edition and check the shared setup version.
Changes that affect the draft call the snapshot writer with the same
transaction that updates the setup and records the audit. The existing
captain publication test now verifies that an audit failure leaves the
appointment private and the setup version unchanged. Retrying publishes the
captain and records one audit. The team identity test retains rollback
coverage for the team, setup version and draft snapshots.

## Draft reads and snapshots

Previously, `tournaments.ts` imported the draft service to update snapshots
after a capacity change. That service imported `content.ts` for edition reads,
forming the static cycle
`tournaments.ts → draft.ts → content.ts → tournaments.ts`.
Captain and team commands also loaded the draft command module for the update.

Tournament, captain and team commands now call
[draft-snapshot](../src/lib/draft-snapshot.ts), which updates the draft version
and the captain and public snapshots on the caller's transaction. It reads
the same stored state through [draft-data](../src/lib/draft-data.ts) and
projects it through [draft-board](../src/lib/draft-board.ts). The board
projection accepts data and can run without a database connection.

Previously, loading the public board, captain board or staff workspace also
loaded the draft commands. [draft-reads](../src/lib/draft-reads.ts) now serves
those saved reads directly to the pages, broadcast and versioned API. Staff
reads keep their edition capability and repeatable-read scope. Captain reads
require an appointment; public reads check release, team visibility and pool
visibility in the existing snapshot scope. Staff setup and draft commands share
the eligible registration query in `draft-data.ts` and the roster filter in
`draft-board.ts`.

[draft](../src/lib/draft.ts) owns writes. It locks the edition and then the draft
session before reading the state used to validate the revision. Picks look up
the actor's request key and compare the saved request hash before validating a
new pick. A successful pick commits the pick, membership, version, both
snapshots and audit together. The existing publication test now rejects the
audit insert and verifies that both views and the stored draft state roll back.
Retrying with the same key then commits one pick and audit.

## Fixture reads

Previously, result import, result review and referee reconciliation imported
`fixtures.ts` to read an assigned fixture, its published rosters and scoring
context. That module also loaded fixture commands, round policy writes and
deletion logic.

[fixture-reads](../src/lib/fixture-reads.ts) now provides the staff workspace,
published official teams and the private review context. The staff pages,
read API, result service and referee reconciliation use these queries directly.
`fixtures.ts` owns fixture changes, referee assignments and their audit entries.
The command module also uses the shared queries when checking eligible officials,
published teams and the resulting staff workspace.

A review with a supplied reader uses that reader for the fixture, assignment,
round, pool and result queries. Result import, result commands and reconciliation
can therefore reuse the caller's transaction. A standalone review opens its own
repeatable-read transaction. The existing fixture test now verifies that the
review sees an uncommitted fixture update through the supplied transaction,
retains assignment checks, and reads the original value after rollback.

## Schedule negotiation

The participant and staff pages and the schedule API GET previously loaded
the rescheduling command. They now call
[schedule-reads](../src/lib/schedule-reads.ts), which uses a read-only
repeatable-read transaction. It retains the existing membership and staff
checks, personal availability scope, and direct browser session requirement.
POST loads the command after validating the request origin and reading the
bounded JSON body.

[schedule-data](../src/lib/schedule-data.ts) reads current fixture eligibility
using the caller's transaction. The command takes advisory lock `17301` and
the edition row lock before calling it. The command keeps fixture and request
version checks and actor-scoped request receipts. Approval writes the official
time, request decision, receipt and audit entries in one transaction.

The existing approval test now rejects the final audit insert and confirms the
GET and public fixture retain the original time, the request stays pending,
and the earlier audit and receipt are absent. The same request key then
commits once and replays successfully. Existing concurrency tests still cover
approval racing the fixture editor and referee start.

## Match results

Previously, loading a saved review also loaded the import provider and the
publication commands. [result-review](../src/lib/result-review.ts) now reads
the fixture context, source, revisions and dependency information in one
repeatable-read transaction. It uses [match-source](../src/lib/match-source.ts)
to compare stored sources. The comparison has no provider or database dependency.

[result-import](../src/lib/result-import.ts) owns the MP preview and import.
It fetches the source before opening the write transaction, then rechecks
authorization, fixture and result versions under the edition and fixture
locks. Fixture completion, saved source, games and audit use that transaction.
[results](../src/lib/results.ts) owns submission, approval, publication and
withdrawal. Approval and publication keep the proposal, game claims, pool
lock and result audit in one transaction. Both command modules use the same
[request receipts](../src/lib/result-command-receipts.ts) scoped to the fixture,
actor and request key, then read the saved review after commit.

The existing completion test covers rollback when import storage fails. The
publication test now injects an audit failure and verifies that the proposal,
public result, game claims and pool lock all roll back. Its existing concurrent
publication, exact replay and cache failure assertions still run.

## Referee workspace

Previously, reading a referee workspace loaded the commands and round policy
writes. [referee-workspace](../src/lib/referee-workspace.ts) now owns the saved
workspace, projection and shared assignment checks. The website, desktop
reader and remote API use this module directly. A standalone local read uses
a read-only repeatable-read transaction. IRC, MP, reconciliation and referee
commands pass their own reader to check the current state in their transaction.

[referee](../src/lib/referee.ts) owns referee mutations. It takes the existing
transaction advisory lock `17301`, then locks the edition and fixture rows.
It rechecks authorization and compares the saved request receipt before
checking the current revision and dependency fingerprint. The session update,
event and audit entry commit together. A desktop IRC confirmation passes its
own transaction into the command, so the relay sequence, command status and BP
event commit or roll back together. A synthetic test verifies that IRC waits on
the shared lock, retries the same confirmation after an audit failure and
records one selection when that confirmation is replayed.

## Referee IRC

The browser GET and the MP room lookup previously loaded browser commands and
desktop relay. They now use [referee-irc-reads](../src/lib/referee-irc-reads.ts).
Browser GET keeps its read-only repeatable-read transaction and assignment
check. The MP command reads the room using its existing transaction. GET
projects timed-out command status from saved data, while relay and browser
commands can persist expiry using the same rule.

Browser POST loads [referee-irc](../src/lib/referee-irc.ts) after checking origin
and parsing the bounded JSON body. It returns state from the command transaction
and retains the live assignment, request key and workspace revision checks.
The desktop endpoint calls [referee-irc-relay](../src/lib/referee-irc-relay.ts)
after checking its desktop credential and scope. Both commands take the same
advisory lock. Relay checks the assigned fixture, session and sequence, and
records confirmed BP evidence through the caller's transaction.

The existing expiry test now uses the actual browser GET and checks that it
returns the derived timeout while the stored status remains queued. Existing
tests still cover shared locking, rollback of relay and BP together, sequence
replay and the legacy desktop receipt.

## Mappools

Previously, loading the staff workspace or published pools also loaded the
osu! beatmap provider and historical import commands.
[mappool-reads](../src/lib/mappool-reads.ts) now serves the staff and public
projections directly to the website, streaming service and versioned read API.
Staff reads keep the edition and replay permissions. Public reads use saved
difficulty data and return only published pools from public editions.

[mappool-preview](../src/lib/mappool-preview.ts) requires edition permission
to manage pools before spending the osu! lookup budget. Batch preview checks
the pool version and both locks before fetching metadata.
[mappools](../src/lib/mappools.ts) owns the write transaction. After provider
lookup it takes the edition lock and rechecks permissions. Pool commands
then lock the pool row and recheck its version and lock flags. The write,
version increment and audit commit together.
A selection lock still allows explicit publication; a pool used by an approved
fixture also blocks publication changes.

The mappool integration suite now simulates a selection lock committed during
osu! lookup. The import returns a conflict and leaves the entries, version and
audit intact. Explicit publication then exposes only the previously saved maps.
Existing tests still cover stale previews, completed-fixture locks, rollback
and visibility of draft pools and private editions.

## Candidate workbench

The workbench page and both versioned workbench read resources previously
loaded the beatmap provider and workbench commands. They now share
[mappool-workbench-reads](../src/lib/mappool-workbench-reads.ts) with the
browser GET handlers. Candidate and comment reads retain the edition and
Developer read checks. Remote reads still check the authenticated subject.

POST loads the requested preview or command after checking origin and
parsing the bounded request. Candidate preview checks the live edition
capability and archive status before calling osu!. Candidate writes recheck
the capability under the edition lock after any provider lookup.
The existing skillset and comment versions, round assignment checks,
candidate deduplication and comment request identity stay in the command.
Writes and audit entries share its transaction.

The versioned API integration test now fails if a saved read loads either
the beatmap provider or the workbench command module. Existing tests still
cover stale and competing edits, audit rollback, request replay and deletion.

## Historical statistics

Previously, the public archive, player map statistics and leaderboard worker
loaded the MP provider and publication commands when reading saved data.
[archive-statistics-reads](../src/lib/archive-statistics-reads.ts) now serves
the workspace, public statistics and player projections. Public queries keep
their read-only repeatable-read scope and release checks.
[archive-statistics-data](../src/lib/archive-statistics-data.ts) loads the
saved edition and parses saved sources using the supplied transaction when
called from a command.

[archive-statistics](../src/lib/archive-statistics.ts) imports, reviews,
publishes and withdraws statistics. It fetches MP data before locking the
edition and statistics rows. Inside the transaction it checks the archive
fingerprint, permissions and source versions. Source updates, audit and
relational projections commit together. The publication test now verifies
that an audit failure preserves the reviewed versions and public projection.
It then retries with the same expected versions and releases the saved games.

## Historical archive storage

Edition reads, statistics pages and the leaderboard worker previously reached
document synchronization and backfill through the archive read modules. They
now depend on read entry points and shared storage queries. Typed document
validation and retained JSONB fallback still use the supplied read snapshot.
The callers continue to enforce publication and permission checks.

Edition and statistics commands pass their transaction to
[archive-relation-writes](../src/lib/archive-relation-writes.ts) after locking
the edition. Source mirrors, digests and document heads are updated within
that transaction. The write helpers also retain the existing statistics row
locks for callers that can encounter legacy MP updates.

The normalization and projection backfill scripts call
[archive-relation-maintenance](../src/lib/archive-relation-maintenance.ts) and
[archive-read-maintenance](../src/lib/archive-read-maintenance.ts), respectively.
Previews use a read-only repeatable-read transaction. Apply locks the edition
under read committed. When projection backfill also synchronizes sources,
both stages use the same transaction. Existing tests cover preview, concurrent
apply, verification and fallback. The failed projection test also checks that
document heads and immutable documents roll back with the generation.

## Transactions and read scopes

- Draft and setup commands own their transactions and take the edition row
  lock before writing. Transitions and picks also lock the session row before
  loading the state used for their version checks. Helpers that read or update command
  state receive the caller's transaction explicitly. Snapshot revisions,
  configuration or roster changes, and audit rows commit together.
- [readOnlyData](../src/db/index.ts) owns a repeatable-read, read-only
  transaction with a five-second statement timeout. It puts the transaction
  in AsyncLocalStorage, so `db()` resolves to the same snapshot inside the
  callback. Nested `readOnlyData` calls reuse it. A `db().transaction()` inside
  that scope uses a savepoint on the same connection. Run nested
  transaction-using reads serially and keep commands outside the read scope.
- The existing draft and recovery integration tests cover idempotency,
  concurrent conflicts, release, and recovery. The team identity test now
  rejects the audit insert on an isolated database and checks that the team,
  setup version and draft snapshots roll back together. A pure board test
  covers the separate captain, public and pool visibility decisions.
