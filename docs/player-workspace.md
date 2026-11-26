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
Changing Mod keeps each map's inputs and save progress. Changing pools asks
before discarding pending changes. Hidden pools and historical archives are unavailable.
Each map has an optional manually entered score, an optional **Feel** selection
(Poor / Okay / Good), and a compact, vertically resizable comment field (up to
2,000 characters). Players edit their own record cell directly. Score and Feel
share the first row, with a full-width comment below. Clearing any field saves
its empty value. The actor's column appears first beside the fixed map column,
including when saved roster order differs. Pool and Mod selectors use compact
underlined tabs, with a labelled reload control.
Changes save after 750 ms of inactivity. Each map sends one save at a time, and
players can keep typing while it is in progress. The cell shows when a save is
pending, confirmed or needs a retry. The retry button appears when a save fails.
Retrying first confirms the previous attempt with the same request key
so newer edits can save under the confirmed version. Inputs are retained on
failure. Reload the sheet to resolve a conflict with a changed map or record.

Team records use a map-by-player comparison table with fixed map and player
headers. The map identity column reuses the official beatmapset cover as a
subdued decorative background behind the title, metadata and download controls.
It follows the MainSheet surface in light/dark, has no pointer targets or extra
screen-reader text, and falls back to the original surface when unavailable.
Scores, saved Feel and comments are visible together. Feel is independent
of the score and never enters the highest-score comparison. Long comments initially show
three literal lines and expand through a keyboard-accessible disclosure; the
complete text is retained. The current context's highest saved score is
emphasized (ties share the emphasis). Missing scores and outdated map contexts
never enter that comparison. Only the owner's cell is editable; read-only
workspaces retain the saved-value display. Outdated own records remain available
in a Previous map context disclosure beside the fresh form. The table scrolls
horizontally with fixed map identity and player headers.

Map titles link directly to their official difficulty page. Compact direct and
Copy BID controls share the identity toolbar. BID is a purple capsule showing
the literal difficulty ID and a copy icon; after success the icon becomes a
check while the number remains visible. On narrow screens direct stays beside
the slot and the capsule sits under the map title. Copy uses the difficulty ID,
reports success or clipboard failure, and retains 44px targets for touch input.
Long titles use a two-line preview and metadata one line with their literal full
text retained in the DOM/title. Normal desktop controls use 32px rows.

Star ratings were retired by organizer request in #731. Current practice
commands accept score/feel/comment and reject the retired rating field; read
projections omit it. The legacy nullable database column and existing private
audit history remain intact. Reading old records does not rewrite them; a later
owner save/delete clears the retired value, with the previous value retained in
the normal private before/after audit. Feel has separate nullable storage added by
migration `0072_practice_feel.sql`, constrained to `bad`, `normal`, `good` or NULL.
Existing records start unset; old ratings are never converted into Feel.
Omitted Feel in an older score/comment command preserves the stored value and
the original retry payload hash. Current forms explicitly send NULL to clear it.
Deletion clears Feel together with score/comment in the same private audit.

Each player edits only their own record. Current active teammates can read each
other's records; an unassigned player can save and view their own records.
Sharing follows the current active roster and accepted registration/captain
appointment, including after roster or eligibility changes. Practice records
never appear in public mappool responses or competition results.

The practice API still accepts deletion from the owner. A deleted record
disappears from every teammate's next read. Migration `0071_practice_record_deletion.sql`
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

FM policy changes affect only FM practice contexts (#798). Existing non-FM
hashes are verified using the current chart/mod identity and saved pool-setting
history, so deploying the corrected context calculation preserves valid older
scores. This read compatibility does not rewrite records or private audit history.

## Season timetable

`/tournaments/[edition]/player/availability` stores up to 200 dated time ranges
for the whole season, independently of teams and fixtures. The horizontal sheet
groups four real dates, Friday through the following Monday, with a shared half-hour axis and one
row per authorized player. Names stay visible during horizontal scrolling.
The initial view focuses the selected date and aligns the hour cells to complete
column boundaries. Only Friday, Saturday, Sunday and Monday are offered as date
shortcuts and grid days. Overview shows all four dates in that order, including
the following Monday across a calendar-week/month/year boundary. Dates chosen
on Tuesday through Thursday (including Today) locate the upcoming Friday.
Previous/next-week controls retain the selected weekday. Both modes keep all unsaved intervals in memory;
view changes do not alter the saved data. Date and previous/next-week controls
retain the full calendar date in context. Headers and player identities stay
visible during scrolling, and consecutive states form continuous bands.
Every half-hour column, time header and player row uses a fixed 44px size, for
both editable and read-only rows. Headers show complete `HH:mm` times with
tabular numerals; half-hours have lighter type and each hour ends at a stronger
grid line. The name column has its own fixed width and truncates long identities
without changing row height. Date bands, compact offset labels and alternating
empty-row surfaces separate the four sheets. Clock changes alter the number of
columns, never their size.
Midweek intervals saved by older pages remain in the saved-range list and in
subsequent save payloads. This is a display/editing scope change; stored UTC
instants, service validation and fixture Schedule retain their existing rules.

Date headings show the zone offset once; only ambiguous repeated hours repeat
the offset in the hour header. Local/UTC controls, compact undo/save and the state
legend stay near the grid. Supplemental access/keyboard help is available from
the Notes disclosure, which supports Escape. Unsaved status and failures remain
visible; a stale Saved message is hidden when a new edit is made.

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
- POST requires same-origin JSON, a direct browser session and current
  eligibility. The owner is derived from the authenticated session; commands
  reject extra owner fields. Completed editions are read-only. Starting the
  draft locks season timetable edits. Practice stays writable for published
  mappools throughout the draft.
- Commands use optimistic versions, a chart-context check where applicable,
  edition row locks and idempotency keys. An uncertain response can be retried
  with the same key. Record and automatic audit changes commit together.
- Migration `0070_player_workspace.sql` creates `player_practice_records`,
  `player_season_availability` and `player_workspace_events`. Private events are
  kept outside generic staff audit projections.
- Responses use private/no-store caching. Personal routes are excluded from
  Developer saved-read resources and delegated remote coverage. A Developer using
  a normal website session can edit their own practice and availability under
  the same eligibility and ownership rules as other players (#904).

The new Chinese interface wording is prepared for organizer review. Local
verification and implementation do not establish deployment or organizer
acceptance; issue #671 records the actual checks and review checkpoint.
