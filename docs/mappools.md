# Mappool implementation and workflows

## Download mirrors (#852)

Each map may save an optional `downloadMirror` HTTPS URL independently of its
official BID and metadata. Authorized pool editors set or clear it in the
existing entry form. Saves use the existing edition permission, pool version,
publication, completed-fixture lock and transactional audit checks. Changing
the BID clears the old mirror in the editor; API saves that omit the field keep
it only for the same BID. Metadata refresh and reorder preserve it. Explicit
`null` clears a native entry's mirror. Historical imports accept an optional
non-null URL on each map.

Every beatmap in cards, compact lists and Details has a **Download mirror** menu
alongside its osu! actions. BeatConnect, Sayobot and Catboy link directly to the
known beatmapset. When its ID is missing, the menu labels the links as searches.
BeatConnect and Sayobot receive the song title when available. A valid saved
mirror appears first. BeatConnect, Catboy and GitHub use local SVGs. Sayobot uses
a centred S in an SVG badge, and other hosts without a distinct site icon use
initials. The browser follows each HTTPS link directly. URLs with credentials or
unsafe schemes are rejected and are not rendered from older read responses.
Draft pool links remain private with the pool. Developer/remote channels stay
read-only. Older backends may omit the additive field.

The menu button uses the [Font Awesome download icon](../LICENSES/Font-Awesome-Free.md).
The osu!direct button uses the original outlines from the [official single-colour
osu! SVG](https://github.com/ppy/osu-web/blob/cfcc19be102bb2e4712fef4067542affd506087d/public/images/layout/osu-logo-white.svg).
It follows the button's text colour under the [osu! brand identity guidelines](https://osu.ppy.sh/wiki/en/Brand_identity_guidelines).

Migration `0086_mappool_download_mirrors` adds the native entry column and typed
historical-map column, and saves the organizer's two pinned GitHub OSZ mirrors.
See [official package evidence and normalization](archive-map-metadata.md#official-osz-download-mirrors-852).
New labels are `下载镜像（可选）` / `下載鏡像（選填）` and
`下载镜像` / `下載鏡像`; organizer wording review remains separate.

## Candidate creation times (#965)

Candidate cards show the original creation time on their final row below the
intended rounds, labelled **Added at**,
using the workbench's existing locale-aware UTC timestamp format and semantic
`time` element. The value comes from the candidate's saved `createdAt`, distinct
from metadata refresh or workspace snapshot times. The timestamp can wrap in
narrow columns; the author's profile link stays on the artist row. Editable and
read-only workspaces share the same display.

## Candidate skillset tags (#735)

The private selection workbench displays each candidate in three columns at list
widths of 52rem or more: beatmap card, Skillset Tags, comments. Narrower lists stack
the same three sections in that order. Staff with edition-scoped `select_mappools` write access may open
the editor and select any combination of 29 literal skill names grouped under Aim,
Tapping, Control, Technical, Reading and Special. Apply saves the whole set; clear
selection is saved only on Apply. Cancel, Escape and backdrop dismissal discard the
draft. Header/footer remain visible while choices scroll on narrow screens.
Clear selection uses the eraser icon in the lower-right footer action group, with
an accessible name and hover hint; it is disabled while saving or when nothing is selected.
Archived and Developer/remote views remain read-only.

Migration `0073_candidate_skillsets` adds an empty tag set and independent version
1 to existing candidates. Apply checks the version under the existing edition lock,
rechecks capability and archive state, and records a transactional
`candidate_skillsets` event for changes. Conflicting drafts cannot overwrite a newer
set; reopen the editor after the list refreshes before retrying. Tags belong to
candidates and are not copied into official/public pools when promoting a map.
Deployments must apply the reviewed migration before running the updated backend;
no live migration is performed by this implementation task. Saved read contract
1.18.0 includes the new fields; older read backends omit the summary data.

Public presentation, official metadata, mod-specific attributes, staff operations, batch editing, audit and publication guarantees. See [competition workflows](competition-operations.md) for fixture/result integration.

## Competition mappools

Published maps appear directly at `/tournaments/[edition]/mappools`. Following the approved historical-card design (#794), keyboard-accessible pool tabs show one published pool at a time, ordered by Group Stage, Knockout Stage and Exhibition, with its stage, distinct authored round name and release date. Duplicate pool names include their stage/round context. The first pool opens automatically; each pool retains its shareable detail URL. Search, sorting and card/table controls share one toolbar, followed by underline Mod tabs. Switching pools resets that pool's browser; it performs no writes or provider requests. Cards use the same MapCardBand styling as S10 (#847), including its full-width star rail, cover proportions, title size and actions. They remain horizontal above 640px; on smaller phones the 16:9 cover sits above the map information. Full titles and further values remain available in Details. Base SR remains separate from saved provider-calculated Mod SR; NM uses Base SR, and unknown FM/TB mods remain variable. Historical archive styling remains scoped to its existing components.

Admin and Mappooler assignments grant access to `/admin/tournaments/[edition]/mappools`. Create independently named/ordered rounds under Group Stage or Knockout Stage, then draft pools. NM/HD/DT/HR/FM/TB slots have database-unique category/index positions. FM is disabled unless explicitly configured as Free Mod or Force Mod; enter only approved restrictions. Changing category/index, replacing/removing a map, reordering, refreshing metadata and publishing are automatically audited and require the current pool version. Routine saves apply directly; publication and removal retain explicit confirmation. Conflicting edits return 409 and refresh the editor.

Paste a numeric beatmap ID or canonical osu! difficulty URL to preview the cover, artist/title, difficulty, mapper, base stars, BPM and duration before saving. Song metadata is read-only. The protected same-origin `/api/admin/tournaments/[edition]/mappools/preview` endpoint requires edition-scoped Admin/Mappooler access. Input changes cancel old requests; collapsed map editors perform no lookup. Mod categories remain tournament slot labels, and the displayed base rating is not a mod-adjusted calculation. Bulk import keeps verified base metadata; it does not infer a mod combination from a slot category. Request official adjusted attributes explicitly while editing a draft pool. Public reads never calculate, backfill or modify published maps.

Existing-map edit forms omit the repeated map preview and its refresh action.
Metadata lookup still runs automatically before Save becomes available, retaining
the verified fingerprint and visible lookup errors/retry. New-map forms retain
their metadata preview.

Bulk import accepts 1–50 plain BIDs, canonical `/beatmaps/BID` URLs or `/beatmapsets/SET#osu/BID` difficulty URLs. Select the category once; plain rows append after its highest saved slot, leaving existing gaps untouched. Advanced `NM1 4184799` / `HD1 URL` rows can be mixed in; explicit positions are reserved before automatic assignment. Set-only URLs cannot identify a difficulty. Preview reports resolved slots, malformed input, duplicates and saved-slot conflicts; reuse across different categories is flagged for organizer review. The official [batch endpoint](https://osu.ppy.sh/docs/#get-beatmaps) deduplicates IDs and shares the same bounded snapshot cache. Save recomputes slots from the original text on the server, revalidates fingerprints and commits the complete batch, pool version and audit together. Stale imports keep pasted text for another preview. In Maps, drag handles work with mouse/touch; keyboard arrows/Home/End, up/down buttons and a position picker provide alternatives. Moves stay local until **Save order**; that single mutation normalizes only the selected category. Batch edit can explicitly insert selected maps into an occupied destination, shifting/renumbering that category; choose an insertion position within the resulting list. Removal remains confirmed and metadata refresh is all-or-nothing. Completed-fixture locks and stale revisions remain protected; valid edits to unlocked public pools remain public.

Select calculation mods explicitly when adding/editing a slot. The official [Beatmap Attributes endpoint](https://osu.ppy.sh/docs/#get-beatmap-attributes) supplies calculated SR, available max combo and supported ruleset attributes. Combinations use standard mod settings, with no custom speed assumptions. Base AR/OD/CS/HP, stars, BPM and duration remain separate; FM/TB default to variable/unconfigured. Saved calculation configuration survives metadata refresh; any failed base/attribute lookup leaves all selected entries unchanged. Attribute snapshots are bounded to 200 cached combinations with a 15-minute expiration, keyed by map/ruleset/mods and base fingerprint. No database migration is needed for optional fields in the existing metadata JSONB; older entries remain base-only until refreshed. A configured round mode is enforced; absent round rules do not invent a mode restriction.

Preview and Save share the existing server-side [official osu! API](https://osu.ppy.sh/docs/#get-beatmap) client-credentials `public` token and verified cache. Tokens never reach browser clients. Every Save validates the map server-side; a changed preview fingerprint returns 409 and requires a refreshed preview. The actual provider fetch time is persisted. Public reads use saved metadata without calling osu!. Provider failures/deletions preserve entries, versions and audits. The process bounds its cache to 200 records, successful snapshots to one minute, concurrent distinct lookups to six, and failure cooldowns to 10 seconds (60 seconds for missing/rate-limited maps). Shared provider pacing, queues, timeouts and retries still apply. When scaling Node processes, keep aggregate traffic within official application limits.

Browser tests launch a guarded, test-only transport fixture through `tests/fixtures/osu-provider.ts`; it requires an isolated test database and the loopback browser server, and supplies synthetic public beatmap responses only. Application code has no provider-mocking switch or authentication bypass. A live server-side client-credentials request on 2026-10-20 also successfully retrieved official beatmap 75. A read-only live check on 2026-10-20 additionally retrieved BID 4184799 using the official batch endpoint and its DT attributes. No tournament records were created. These checks verify metadata/attribute transport, not full user OAuth consent or deployment.

Only released pools are returned by public pages/APIs, including direct UUID requests. Unlocked public pools can be edited directly; full revisions remain in private audit history. A completed-fixture lock permanently prevents map/settings/round-label changes, even after unpublishing. Create a new pool rather than rewriting historical competition maps; the results service sets this lock atomically when a fixture is approved. Locked pools reject ordinary publication/content changes; create a replacement pool for new competition content.

## Internal replay workflow (#185, updated by #692)

1. Add maps in the existing edition → round → pool editor. Replay management requires no selection-lock step or Showcase deadline; the former upload-window settings and their write command have been retired.
2. Edition-authorized **Tester/Replayer** and Admin can upload/delete through each map's **Replays** dialog at any time in an operational edition, including on unpublished pools and after legacy Showcase dates. The map's replay icon opens a compact modal with the list and upload fields; closing it returns focus to that icon. Downloads remain available. Mappooler has read/download access; an additional Tester/Replayer grant is required for uploading. Developer and remote read channels cannot write. Staff names on the About page never imply a role grant.
3. Attach multiple files with optional descriptions (500 characters). Names, size, actual uploader ID/name, UTC upload instant and literal replay player/mode/mod bitmask are shown. Replay names do not establish account identity and cannot affect registration, Tier, draft or results. Duplicate SHA-256 content for the same entry returns the existing attachment with a clear message. Interrupted/retried uploads cannot create duplicate associations; no existing file is overwritten. Each actual upload/deletion increments the pool version and records an automatic transactional mappool audit event.

Supported files are **stable `.osr` containers from version 20140721 up to (excluding) lazer's 30000000 marker**, in the four legacy rulesets, with bounded UTF-8 headers, a validated LZMA replay-frame stream and the documented stable score-ID/Target Practice trailer. Lazer-native replays/extra score-info blocks, older containers, malformed/extra data, oversized dictionaries, non-finite frames and excessive expansion are rejected. Up to **8 MiB per file and 10 files per map**, one upload at a time. The server checks content, not MIME or extension alone. [Official `.osr` format](<https://osu.ppy.sh/wiki/en/Client/File_formats/osr_(file_format)>) and [lazer's version boundary](https://github.com/ppy/osu/blob/master/osu.Game/Scoring/Legacy/LegacyScoreEncoder.cs) inform this scope; this is file validation, not anti-cheat or gameplay validation.

Official beatmap responses retain the optional MD5 checksum. A known checksum/ruleset mismatch blocks attachment. Missing official checksums (including older saved metadata) are explicitly **unverified**, never labelled matched; refresh metadata when verification is required. No arbitrary URL is fetched. Attachments reference stable entry IDs, so an attachment follows the same entry during an allowed slot move. An attached entry cannot be removed or replaced without explicit attachment cleanup; a metadata refresh cannot introduce a known checksum conflict. Existing legacy selection locks and completed-fixture locks still protect map identities and structure. Saved `selectionLockedAt` / `showcaseAt` fields and audit history remain available for compatibility; they do not control replay writes. Archived editions remain read-only.

Files stay private even when the pool is published. There is no public replay API or public download URL. The protected endpoints are `/api/admin/tournaments/[edition]/mappools/entries/[entryId]/replays` (GET list / POST bounded multipart upload) and its `/[replayId]` resource (GET attachment / DELETE confirmed versioned removal). Reads validate current read grants; writes also enforce same-origin, current write grants, versions and archive protection. A retry of already committed content is idempotent; a different concurrent write with a stale version returns 409. See [deployment and recovery](deployment.md#private-mappool-replay-storage-185) for persistent storage, quotas, Python LZMA, backup and offline cleanup.

## Historical S4–S6 metadata

See [historical metadata supplements](archive-map-metadata.md) for the #335 root
cause, official snapshot provenance, field precedence and current/base-value
disclosure. The #852 section covers the separate database migration for five
confirmed original IDs and the existing normalization command to run afterward.

## Public difficulty preview (#851)

Published native pools and historical pools share an Enable modded difficulty
toggle (off shows base values), alongside the Mod filters below the search/view
toolbar. The settings wrap onto their own line when space is limited. FM uses
single-selection HD / HR / EZ buttons with individual borders; clicking the
selected button clears it. Selecting a Mod enables the toggle, and toggling
off preserves the FM selection for comparison. Cards, compact tables, sorting and
map details use the same selection. HD, HR and DT slots default to their named Mod
when no explicit calculation combination is saved; a saved complete combination takes precedence.
NM stays at base values. Unknown TB/ACE configurations remain variable. FM offers
**HD, HR or EZ, one at a time**, with no DT option. This display choice is
independent of the pool's Free Mod / Force Mod policy and never changes allowed
competition Mods, slots or saved pool settings. Missing official SR shows Not
calculated; known base parameters still convert independently. Changing selection
cannot reuse another selection's SR. Unselected FM and unknown TB retain visibly
labelled base/recorded values with Variable status instead of blanking the map.

SR is the literal result of the official
[Beatmap Attributes API](https://osu.ppy.sh/docs/index.html#get-beatmap-attributes)
for that BID, ruleset and complete standard Mod combination. There are no SR
multipliers. BPM and length use the standard clock rate (DT 1.5× / HT 0.75×).
For osu!standard, HR applies AR/OD/HP ×1.4 and CS ×1.3, capped at 10; EZ halves
the settings. Speed changes convert AR through preempt timing and OD through the
great hit window, retaining the official integer rounding. AR/OD are effective
timing values; CS/HP are difficulty settings. Non-osu! rulesets show no derived
AR/OD/CS/HP. Sources: [Hard Rock](https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Osu/Mods/OsuModHardRock.cs),
[HP](https://github.com/ppy/osu/blob/master/osu.Game/Rulesets/Mods/ModHardRock.cs),
[Easy](https://github.com/ppy/osu/blob/master/osu.Game/Rulesets/Mods/ModEasy.cs),
[Easy OD](https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Osu/Mods/OsuModEasy.cs),
[AR timing](https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Osu/Objects/OsuHitObject.cs),
[OD timing](https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Osu/Scoring/OsuHitWindows.cs)
(reviewed 2026-11-05). Custom Mod settings are not represented by the existing
calculation configuration model and are not inferred.

An explicit authorized staff metadata refresh prepares the slot's preview
variants through the existing shared cache/rate limiter. FM prepares HD/HR/EZ
regardless of its competition restrictions. All requested results must succeed
before the existing versioned, audited pool transaction commits. A failure
preserves prior metadata, revision and audit. Existing metadata JSONB accepts the
optional `difficultySnapshot`; no migration is required. Completed-fixture locks
and read-only Developer/remote restrictions still apply.

Older native pools and historical pools can use an **operator-prepared public
numeric catalog**, without changing locked pool or imported archive records.
The checked-in `src/data/difficulty-previews.json` starts empty. Preparing live
snapshots requires the operator's separately approved osu! application
configuration; this implementation does not supply credentials or perform live
backfill. On an approved preparation host, export `OSU_CLIENT_ID` and
`OSU_CLIENT_SECRET` through its existing secret configuration, then run:

```sh
node --import tsx scripts/prepare-difficulty-previews.ts --archives --output /absolute/path/difficulty-previews.json
node --import tsx scripts/prepare-difficulty-previews.ts --ids 75,123 --mods HD,HR,DT,EZ,HDHRDT --output /absolute/path/difficulty-previews.json
```

The first command gathers BIDs from the reviewed `docs/imports/s*-archive.json`
files (including `s*-confirmed-archive.json`). The second prepares selected BIDs
and complete combinations. Each successful BID is written atomically; a failed
BID retains its previous complete snapshot and timestamp, with a nonzero exit
status. Retry failed IDs explicitly. Only numeric public metadata is written;
errors do not print provider responses or credentials. Commands perform no DB or
tournament writes. The output directory must already exist. Use one preparation
process per file and respect the official application's aggregate rate limit.

Set `OCLR_DIFFICULTY_CATALOG_FILE` to the absolute output path on the serving
backend (or omit it to use the reviewed checked-in catalog). Atomic file updates
are recognized on subsequent reads. Missing, invalid or oversized files/entries
leave Mod SR unavailable, with no provider fallback. Snapshots bind BID,
ruleset, checksum when known, fetch time and exact Mod configuration. Native maps
with a known different checksum cannot use the catalog entry.

Historical source values may already include Mods. They stay visible and labelled
Recorded historical values when no verified base snapshot exists, including while
the toggle is enabled, and are never used as inputs to another Mod conversion.
The missing/variable Mod result is labelled separately. With a snapshot, the
base/adjusted control uses the current official base; original source values remain
in the details. The source, ruleset and UTC fetch time identify the current calculation, which is not
a reconstruction of the tournament year's difficulty algorithm.

Saved-read contract **1.22.0** carries optional native metadata snapshots and
historical map snapshots through the existing public resources. The backend
composes the catalog into `publicEnrollment` / `publicMappools`; the remote
frontend needs no provider credentials or DB. Older backends and missing variants
remain readable and show unavailable/recorded values. Public pages, preview
switches and saved-read API requests never contact osu!, backfill the catalog or
write business data. Deploying the code alone does not populate live snapshots;
prepare the catalog or refresh an editable pool before expecting adjusted SR.

## Private map selection workbench (#572)

Open **Competition → Map selection workbench** at
`/admin/tournaments/[edition]/mappool-workbench`. Admin, Mappooler (Pooler),
Tester and Replayer grants have the edition-scoped `select_mappools` capability.
Tester/Replayer can add candidates and comment without gaining `manage_mappools`.
Staff credits alone do not grant access; revoked or other-edition grants fail on
the next request. Developer can read saved data and cannot write through this
capability; existing additional write roles retain only their authorized scope.

Candidates are grouped by Mod tabs (unassigned, NM, HD, DT, HR, FM and TB),
independent of official round/slot assignments. Existing candidates migrate to
unassigned. New batches use the current tab; the same BID may have independent
candidates/discussions in different categories. Reclassification preserves the
candidate ID and comments, checks the previous category under the edition lock,
and rejects a duplicate destination without merging or discarding discussions.
Classification alone never infers difficulty calculation mods. Paste 1–50 BIDs or supported official difficulty URLs,
one per line. Preview marks invalid, duplicate and lookup-failed rows; select
valid rows and confirm addition. Unselected/failed input remains available for
correction. Duplicate BIDs within the same edition/category are skipped without overwriting
metadata or discussion. The edition supports up to 500 candidates. Saved metadata
is revalidated against the preview fingerprint; changed/failed lookups reject
the whole selected batch. Successful retries skip already saved candidates even
when the provider is unavailable. Candidate additions and their audit events
commit together under the edition lock.

Candidates reuse the historical mappool `MapCardBand` with its workbench variant:
the cover image and placeholder are omitted while the original faded background
art remains. Mod, copyable BID and the ellipsized map title share one header row.
Artist and adder share the credit row, followed by difficulty/mapper and saved
base parameters (including HP). Parameters and four compact actions share one
row, with actions on the right; narrow cards scroll that row horizontally rather
than adding an action row. The row is keyboard-focusable and controls remain
reachable. Saved intended rounds appear as wrapping name chips directly below
the parameters; all selected round names stay literal, and empty selections show
the localized Unassigned state. The summary is also visible to read-only staff
and updates after saving the existing multi-select editor. Unsaved drafts do not
change the summary. At a list width of 52rem or more, each candidate places the map on the
left, skillsets in the middle and always-visible comments on the right, separated
by vertical rules. Narrower lists stack all three sections. Public/historical cards retain their
existing cover layout. Pool promotion opens
in a scrollable popover containing round/pool selection, the guarded entry form
and success feedback; opening it or completing an addition does not grow the card. History, round selection, pool promotion and osu!direct use 32px toolbar controls
with 16px icons (44px touch targets on coarse pointers). The redundant osu! web
action is omitted from candidate toolbars; the map title retains its web link. These controls have
accessible names and hover hints; the round hint retains the saved selection.
The round selector opens a checkbox dropdown in
the browser's top layer, with Save/Cancel and Escape/outside dismissal; opening
it does not add a card row. A clear-selection icon stays at the bottom-left of
the dropdown footer, with Save/Cancel on the right; clearing changes only the
unsaved selection. Cancel/dismiss drops the unsaved selection, while
conflicts keep the draft open for review. Read-only viewers see the saved rounds.
Candidate creation time and the separate footer stay hidden.
Mode/status and snapshot details stay hidden; saved metadata is not a live lookup,
and unknown fields stay unknown. Comment headings and refresh actions share one
line. A single-line composer remains visible, grows with its text up to a bounded
height, and shares its row with Send; limits remain below and are associated with
the input for assistive technology. Author/timestamp and edit/delete icon actions
share a compact comment header. History uses a bounded scrolling area inspired by
player messages and loads near the viewport.
Comments preserve author identity/name and their original UTC posting time.
Authors with a current edition-scoped write grant can edit or delete only their
own comments; Admin/Pooler roles do not override authorship. Editing is inline
and deletion requires confirmation. Both operations compare an opaque row version
under the edition/row locks, reject stale edits/deletes and audit metadata in the
same transaction. Conflicts retain the draft; cancel and refresh before starting
a new edit against the reviewed text. Deleted comments disappear from the thread
and count. Replaying a deleted comment's creation request is rejected rather than
recreating it. No deleted comment text is copied into audit metadata.
Candidate intent can include multiple existing rounds from the same edition, or
remain unassigned. Set it for a new batch or edit an individual candidate. These
are planning labels, independent of formal pool/slot assignment; adding an existing
BID again never changes its saved round intent. Updates compare the expected round
IDs under the edition lock and audit before/after IDs in the same transaction.
Edition-scoped foreign keys reject cross-season links. Deleting an otherwise
unused round removes its planning links, preserving candidates and discussion;
existing formal pool/fixture/history deletion protections remain unchanged.

**Check history** opens an on-demand lookup for the candidate's exact BID across
other published historical archives or completed editions' published official
pools. Archive original IDs also match; a different difficulty in the same set
does not. Results identify the edition, round/pool and slot with a public pool
link. This is pool inclusion, not evidence that the map was played in a match.
Unpublished editions/pools, live editions and candidate lists are excluded.
An empty result says no historical records; failures provide retry instead.
The GET validates the current selection read grant and candidate's edition,
uses saved data only, and is available through the versioned read API as
`candidateHistory` (contract 1.16.0). No candidate or official pool is changed.

Each candidate accepts up to 200 comments of 2,000 characters. A per-submission
request UUID makes retries idempotent for the same author/candidate; reusing it
with different text fails. Concurrent comments append rather than overwriting.
There is no candidate removal. Admin/Pooler users
with `manage_mappools` can explicitly add a candidate to a selected official pool
by explicitly selecting one target round, then an editable pool in that round,
using the existing official entry form, provider preview, chosen category/slot and
versioned command. Changing the target round clears the old pool and entry form.
Planning labels do not automatically select a destination or constrain an
otherwise authorized choice of target round. Locked pools cannot be selected or written; existing FM,
completed-fixture, uniqueness, archive and transactional audit protections apply.
Tester/Replayer and remote read-only users get no formal write control. Public
pools show a warning that additions become visible immediately; draft pools stay
draft. Candidates and discussions remain private and are not removed or copied
to the published entry. Refresh the pool after a conflict or uncertain response.

Candidate metadata, comments and authors remain private even after an edition
or official pool is published. The browser-session API is
`/api/admin/tournaments/{edition}/mappool-workbench`: GET saved candidates; POST
`preview` (text/category), `add` (category and selected BID/fingerprint pairs),
`classify` (candidate UUID, expected/new category), `assign_rounds` (candidate UUID,
new/expected round UUID arrays), or `comment`
(candidate UUID, request UUID and body), `comment_edit` (candidate/comment UUIDs,
version and body), or `comment_delete` (candidate/comment UUIDs and version). GET `/{candidateId}/comments` loads a
thread. POST requires same-origin and fresh write authorization; no Bearer
business writes are accepted. Reads never query osu! or mutate official pools.
Historical archives are readable but cannot receive new candidates/comments.
Formal pool selection/completed-fixture locks and Replay deadlines are unchanged.

Saved-read contract **1.8.0** added `selectionWorkspace` and `candidateComments`
under `/api/v1/staff/tournaments/{edition}/mappool-workbench[/{id}/comments]`.
Both require the private tournament read scope plus existing server read
permission (or explicit Developer read access). The remote frontend supports
these saved views through the same adapter, with all workbench/comment commands and official pool writes disabled;
it grants no remote business-write transport. Older backends need the additive
contract and migration `0062_mappool_workbench` to serve this workspace.

Contract **1.9.0** additionally returns each candidate’s `category`; migration
`0063_mappool_candidate_categories` preserves existing rows and changes uniqueness
to edition/category/BID. Updated remote backends need this additive field.

The original migration adds only private candidate/comment tables and their constraints;
it does not change official pools or grant real staff roles. Apply through the
normal reviewed migration/deployment process. New Chinese interface wording and
actual organizer workflow acceptance remain review items distinct from local
synthetic verification.

Contract **1.11.0** adds an opaque string `version` to saved candidate comments
for author edit/delete conflict checks. Updated remote backends must return this
field; all remote views remain read-only. This uses the existing PostgreSQL row
version and audit table, with no database migration.

Contract **1.12.0** adds `selectionWorkspace.rounds` (minimal same-edition round
identities) and `candidates[].roundIds`. Migration `0064_mappool_candidate_rounds`
adds an initially empty relation table with composite edition-scoped foreign keys
and cascade cleanup for deleted planning rounds. Apply via the normal reviewed
migration workflow before this app version; no production migration was performed
by this change. Older app versions can ignore the additive table; do not remove
saved planning data or down-migrate. Remote backends need the new fields and
migration, while frontend remote views remain read-only.

## Exhibition pools from historical maps (#788)

In an Exhibition round, create a pool and open **Choose from historical
mappools**. Choose a past tournament and pool, search by title/slot/BID, and
select individual maps or all visible maps (up to 50 per save). Sources include
published archive pools and released saved pools from completed public editions;
the current edition, private editions, draft pools and archive entries without
a usable recorded map identity are excluded. Historical categories outside the
supported NM/HD/HR/DT/FM/TB slots are not selectable. Configure the destination FM
policy explicitly before selecting FM maps.

Saving verifies current official map metadata and appends maps after the last
saved position in each original category. It preserves existing gaps and rejects
duplicate maps in the same category. Deleted/unavailable provider maps, failed
lookups, ruleset mismatches, stale source/target revisions, source withdrawal or
locked target pools fail without a partial save. Refresh the source selector if
its content changed. Public reads use saved data and never fetch the provider.

The new entries retain source edition/pool names and IDs, original slot and BID.
This provenance is visible in map management and public map details. Map
replacement clears provenance when its BID changes; refresh/reorder retain it.
Historical source rows and replay attachments are never copied or modified.
Destination entries, pool version and audit commit together under the existing
edition permission and locking rules. The protected historical selector composes
existing public saved-read resources; the remote frontend remains read-only.
