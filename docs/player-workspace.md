# Player workspace (#671)

The Chinese interface name is **選手專區** (`zh-Hant`) / **选手专区** (`zh-Hans`),
shared by dashboard entries, navigation, page eyebrows and access notices.

Accepted players and appointed captains can use the **Player workspace**.
Private tournament pages have a separate sidebar
section for **Practice sheet** and **Season timetable**. Captains also retain
their Captain workspace section. Navigation visibility is optional; each page,
API read and command rechecks the current edition, identity and saved eligibility.
Staff roles alone do not grant access to personal workspace data.
The dashboard links each eligible registration card directly to that
edition's practice sheet. This entry is hidden for archived/unpublished editions,
ineligible applicants and delegated remote sessions.

## Practice sheet

`/tournaments/[edition]/player/practice` automatically selects the most recently
published mappool, with tabs for other published pools and each available Mod.
Changing Mod keeps each map's unsaved inputs mounted; changing pools asks before
discarding drafts. Hidden pools and historical archives are unavailable.
Each map has optional manually entered
score, a 1–5 star rating and a compact, vertically resizable comment field (up to
2,000 characters). Score, rating, comment and the save action share one compact
row. Narrow containers show the current rating in a button that opens the same
five-star controls; choosing a value, clearing it, Escape or leaving the control
closes the picker. Team records use a map-by-player comparison table with fixed map and player
headers. Scores, ratings and comments are visible together, and the current
context's highest saved score is emphasized (ties share the emphasis). Missing
scores and outdated map contexts never enter that comparison. Each map retains
its compact personal form below the comparison row; updates and deletions
immediately update that map's comparison. The table scrolls horizontally while
the editor stays within the visible container.

Each player edits only their own record. Current active teammates can read each
other's records; an unassigned player can save and view their own records.
Sharing follows the current active roster and accepted registration/captain
appointment, including after roster or eligibility changes. Practice records
never appear in public mappool responses or competition results.

Only the owner may delete a practice record, after confirmation. It disappears
from every teammate's next read. Migration `0071_practice_record_deletion.sql`
retains a deletion marker and monotonically increasing owner/entry version;
recreating a record cannot reset its version and allow stale pages to overwrite
it. Deletion and its private before/after audit commit together. The old ACC
column remains legacy storage, omitted from current commands and read models;
new saves and deletions clear it.

A record belongs to an edition, owner and pool entry. The saved chart ID,
checksum, category and mod configuration identify its map context. A replacement
or relevant mod change marks the old record and requires a fresh context/version
before replacing it. Deleted entries retain private audit history and do not
silently transfer a score to a new slot.

## Season timetable

`/tournaments/[edition]/player/availability` stores up to 200 dated time ranges
for the whole season, independently of teams and fixtures. The horizontal sheet
groups real dates within the selected week, with a shared half-hour axis and one
row per authorized player. Names stay visible during horizontal scrolling.
The initial view scrolls to the selected date/time; date and previous/next-week
controls keep the full calendar date in context.

Clicking a cell cycles available → unsure → unavailable → unfilled. Dragging
copies the starting cell's existing state across the continuous range, including
when moving backwards or over mixed states. Starting from an empty or partial
cell paints available. Cancelled pointer gestures restore their original data.
Each stroke is one undo step (up to 50), and all edits save together with the
existing optimistic version and idempotent retry key. A saved-range disclosure
also permits removing an exact old interval without rounding its boundaries.
Partial or mixed old cells are striped and described separately.

The default zone is the device's IANA timezone, with a UTC+0 toggle shared by
editing, rows and date headings. Only the presentation changes: UTC instants stay
authoritative. Every date shows its actual offset; missing clock-change hours
have no cells, and repeated hours have distinct UTC offsets and instants. Existing
legacy ranges without `status` remain available. Optional `unsure`/`unavailable`
values use the same private interval JSON; absence means unfilled. Validation
rejects overlaps with different states. No database DDL is required.

Only the player writes their own timetable. The player and their currently
appointed team captain may read it. Teammates, other captains, coaches and staff
have no extra timetable access. Captains see all current eligible team members'
slots together in the horizontal sheet, labelled with their names, without a player
selector. The roster also lists members who have not submitted any slots. The
captain can still add, edit and save only their own slots; teammate cells are
read-only. Transfers, withdrawals and appointment revocation are reflected in
the next authorized read. Authorized legacy `?player=` page links redirect to
the combined view; the API keeps its existing owner-specific read compatibility.
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
