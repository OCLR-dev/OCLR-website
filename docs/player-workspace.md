# Player workspace (#671)

Accepted players and appointed captains can enter the **Player workspace** from
the tournament context bar. Private tournament pages have a separate sidebar
section for **Practice sheet** and **Season timetable**. Captains also retain
their Captain workspace section. Navigation visibility is optional; each page,
API read and command rechecks the current edition, identity and saved eligibility.
Staff roles alone do not grant access to personal workspace data.

## Practice sheet

`/tournaments/[edition]/player/practice` automatically selects the most recently
published mappool, with a selector for other published pools. Hidden pools and
historical archives are unavailable. Each map has optional manually entered
score, accuracy, a 1–5 star rating and a comment (up to 2,000 characters).

Each player edits only their own record. Current active teammates can read each
other's records; an unassigned player can save and view their own records.
Sharing follows the current active roster and accepted registration/captain
appointment, including after roster or eligibility changes. Practice records
never appear in public mappool responses or competition results.

A record belongs to an edition, owner and pool entry. The saved chart ID,
checksum, category and mod configuration identify its map context. A replacement
or relevant mod change marks the old record and requires a fresh context/version
before replacing it. Deleted entries retain private audit history and do not
silently transfer a score to a new slot.

## Season timetable

`/tournaments/[edition]/player/availability` stores up to 200 dated time ranges
for the whole season, independently of teams and fixtures. It reuses Schedule's
calendar, timezone-aware date/time controls and interval validation. Calendar
selection and date/time fields both fill the slot editor; add/update slots,
then save the timetable. Times are normalized to UTC and rendered in the
tournament timezone, including explicit clock-change offsets.

Only the player writes their own timetable. The player and their currently
appointed team captain may read it. Teammates, other captains, coaches and staff
have no extra timetable access. The captain's player selector uses the current
active eligible roster and becomes read-only when viewing another player.
Per-fixture Schedule reports and rescheduling requests retain their own workflow.

## Persistence and access

- Browser-session APIs: `/api/tournaments/[edition]/player/practice` and
  `/api/tournaments/[edition]/player/availability` (GET/POST).
- POST requires same-origin JSON, current eligibility and business-write
  authorization. The owner is derived from the authenticated session; commands
  reject extra owner fields. Completed/locked editions are read-only.
- Commands use optimistic versions, a chart-context check where applicable,
  edition locking and idempotency keys. An uncertain response can be retried
  with the same key. Record and automatic audit changes commit together.
- Migration `0070_player_workspace.sql` creates `player_practice_records`,
  `player_season_availability` and `player_workspace_events`. Private events are
  kept outside generic staff audit projections.
- Responses use private/no-store caching. Personal routes are excluded from
  Developer saved-read resources and delegated remote coverage. Developer-only
  accounts retain the existing read-only write restriction.

The new Chinese interface wording is prepared for organizer review. Local
verification and implementation do not establish deployment or organizer
acceptance; issue #671 records the actual checks and review checkpoint.
