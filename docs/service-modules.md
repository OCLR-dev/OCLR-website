# Competition service modules

This inventory records the first service split under #1013. Browser and API
entry points are described in [Service and Next.js boundaries](next-service-boundaries.md).

| Responsibility | Current entry points |
| --- | --- |
| Edition configuration and publication | [tournaments](../src/lib/tournaments.ts) owns configuration commands and reads. [content](../src/lib/content.ts) provides edition lookups for callers. |
| Registration, appointments and rosters | [registrations](../src/lib/registrations.ts), [staff](../src/lib/staff.ts), [captains](../src/lib/captains.ts) and [teams](../src/lib/teams.ts) own their writes, version checks and audits. |
| Draft | [draft](../src/lib/draft.ts) owns state transitions, staff/captain access, picks, idempotency and public reads. [draft-setup](../src/lib/draft-setup.ts) checks structural locks. |
| Mappools | [mappools](../src/lib/mappools.ts) owns official pool changes and projections. [mappool-workbench](../src/lib/mappool-workbench.ts) handles candidate work. |
| Schedule and results | [fixtures](../src/lib/fixtures.ts) owns official fixture changes, [schedule](../src/lib/schedule.ts) owns requests, [results](../src/lib/results.ts) owns import, review and result publication, and [public-competition](../src/lib/public-competition.ts) serves published competition data. |
| Referee | [referee](../src/lib/referee.ts), [referee-irc](../src/lib/referee-irc.ts) and [referee-mp](../src/lib/referee-mp.ts) handle assigned match work, IRC coordination and multiplayer evidence. |
| Historical data | [historical-archive](../src/lib/historical-archive.ts) defines archive records and publication rules. [archive-relations](../src/lib/archive-relations.ts) reads and writes the relational representation. [archive-read](../src/lib/archive-read.ts) serves saved projections. |

## Draft snapshots

Previously, `tournaments.ts` imported the draft service to update snapshots
after a capacity change. That service imported `content.ts` for edition reads,
forming the static cycle
`tournaments.ts → draft.ts → content.ts → tournaments.ts`.
Captain and team commands also loaded the draft command module for the update.

Tournament, captain and team commands now call
[draft-snapshot](../src/lib/draft-snapshot.ts), which updates the draft version
and the captain and public snapshots on the caller's transaction. It reads
the same stored state through [draft-data](../src/lib/draft-data.ts) and
projects it through [draft-board](../src/lib/draft-board.ts). The draft service
uses those same read and projection functions for its own commands. The board
projection accepts data and can run without a database connection. The original
draft API entry points stay in `draft.ts`.

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
