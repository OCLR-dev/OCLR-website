# Mappool implementation and workflows

Public presentation, official metadata, mod-specific attributes, staff operations, batch editing, audit and publication guarantees. See [competition workflows](competition-operations.md) for fixture/result integration.

## Competition mappools

Published maps appear directly at `/tournaments/[edition]/mappools`, grouped by stage and collapsible rounds. When both stages have released pools, keyboard-accessible tabs switch the visible stage in place. The first round opens automatically; each pool retains its shareable detail URL. Desktop rows group stats alongside covers, difficulty and mapper credits; phone layouts expose additional stats through Details. Base SR remains separate from saved provider-calculated Mod SR; NM uses Base SR, and unknown FM/TB mods remain variable.

Admin and Mappooler assignments grant access to `/admin/tournaments/[edition]/mappools`. Create independently named/ordered rounds under Group Stage or Knockout Stage, then draft pools. NM/HD/DT/HR/FM/TB slots have database-unique category/index positions. FM is disabled unless explicitly configured as Free Mod or Force Mod; enter only approved restrictions. Changing category/index, replacing/removing a map, reordering, refreshing metadata and publishing are automatically audited and require the current pool version. Routine saves apply directly; publication and removal retain explicit confirmation. Conflicting edits return 409 and refresh the editor.

Paste a numeric beatmap ID or canonical osu! difficulty URL to preview the cover, artist/title, difficulty, mapper, base stars, BPM and duration before saving. Song metadata is read-only. The protected same-origin `/api/admin/tournaments/[edition]/mappools/preview` endpoint requires edition-scoped Admin/Mappooler access. Input changes cancel old requests; collapsed map editors perform no lookup. Mod categories remain tournament slot labels, and the displayed base rating is not a mod-adjusted calculation. Bulk import keeps verified base metadata; it does not infer a mod combination from a slot category. Request official adjusted attributes explicitly while editing a draft pool. Public reads never calculate, backfill or modify published maps.

Bulk import accepts 1–50 plain BIDs, canonical `/beatmaps/BID` URLs or `/beatmapsets/SET#osu/BID` difficulty URLs. Select the category once; plain rows append after its highest saved slot, leaving existing gaps untouched. Advanced `NM1 4184799` / `HD1 URL` rows can be mixed in; explicit positions are reserved before automatic assignment. Set-only URLs cannot identify a difficulty. Preview reports resolved slots, malformed input, duplicates and saved-slot conflicts; reuse across different categories is flagged for organizer review. The official [batch endpoint](https://osu.ppy.sh/docs/#get-beatmaps) deduplicates IDs and shares the same bounded snapshot cache. Save recomputes slots from the original text on the server, revalidates fingerprints and commits the complete batch, pool version and audit together. Stale imports keep pasted text for another preview. In Maps, drag handles work with mouse/touch; keyboard arrows/Home/End, up/down buttons and a position picker provide alternatives. Moves stay local until **Save order**; that single mutation normalizes only the selected category. Batch edit can explicitly insert selected maps into an occupied destination, shifting/renumbering that category; choose an insertion position within the resulting list. Removal remains confirmed and metadata refresh is all-or-nothing. Completed-fixture locks and stale revisions remain protected; valid edits to unlocked public pools remain public.

Select calculation mods explicitly when adding/editing a slot. The official [Beatmap Attributes endpoint](https://osu.ppy.sh/docs/#get-beatmap-attributes) supplies calculated SR, available max combo and supported ruleset attributes. Combinations use standard mod settings, with no custom speed assumptions. Base AR/OD/CS/HP, stars, BPM and duration remain separate; FM/TB default to variable/unconfigured. Saved calculation configuration survives metadata refresh; any failed base/attribute lookup leaves all selected entries unchanged. Attribute snapshots are bounded to 200 cached combinations with a 15-minute expiration, keyed by map/ruleset/mods and base fingerprint. No database migration is needed for optional fields in the existing metadata JSONB; older entries remain base-only until refreshed. A configured round mode is enforced; absent round rules do not invent a mode restriction.

Preview and Save share the existing server-side [official osu! API](https://osu.ppy.sh/docs/#get-beatmap) client-credentials `public` token and verified cache. Tokens never reach browser clients. Every Save validates the map server-side; a changed preview fingerprint returns 409 and requires a refreshed preview. The actual provider fetch time is persisted. Public reads use saved metadata without calling osu!. Provider failures/deletions preserve entries, versions and audits. The process bounds its cache to 200 records, successful snapshots to one minute, concurrent distinct lookups to six, and failure cooldowns to 10 seconds (60 seconds for missing/rate-limited maps). Shared provider pacing, queues, timeouts and retries still apply. When scaling Node processes, keep aggregate traffic within official application limits.

Browser tests launch a guarded, test-only transport fixture through `tests/fixtures/osu-provider.ts`; it requires an isolated test database and the loopback browser server, and supplies synthetic public beatmap responses only. Application code has no provider-mocking switch or authentication bypass. A live server-side client-credentials request on 2026-10-20 also successfully retrieved official beatmap 75. A read-only live check on 2026-10-20 additionally retrieved BID 4184799 using the official batch endpoint and its DT attributes. No tournament records were created. These checks verify metadata/attribute transport, not full user OAuth consent or deployment.

Only released pools are returned by public pages/APIs, including direct UUID requests. Unlocked public pools can be edited directly; full revisions remain in private audit history. A completed-fixture lock permanently prevents map/settings/round-label changes, even after unpublishing. Create a new pool rather than rewriting historical competition maps; the results service sets this lock atomically when a fixture is approved. Locked pools reject ordinary publication/content changes; create a replacement pool for new competition content.

## Internal replay workflow (#185)

1. Admin/Mappooler finishes map selection in the existing edition → round → pool editor, sets a **future Showcase deadline** using local time (the exact UTC instant is displayed), then confirms **Lock map selection**. This separate, irreversible selection lock freezes map identities/slots, round labels and the deadline. Create a new pool if selection must change; the lock does not publish the pool. Existing completed-fixture locks remain separate and cannot be used to configure a new replay window.
2. Edition-authorized **Tester/Replayer** and Admin can upload/delete through each map's **Replays** panel **only while selection is locked and server time is strictly before the Showcase deadline**. At the deadline, uploads/deletions close automatically, including Admin. Downloads remain available. Mappooler has read/download access; an additional Tester/Replayer grant is required for uploading. Developer can read/download and cannot write. Staff names on the About page never imply a role grant.
3. Attach multiple files with optional descriptions (500 characters). Names, size, actual uploader ID/name, UTC upload instant and literal replay player/mode/mod bitmask are shown. Replay names do not establish account identity and cannot affect registration, Tier, draft or results. Duplicate SHA-256 content for the same entry returns the existing attachment with a clear message. Interrupted/retried uploads cannot create duplicate associations; no existing file is overwritten. Each actual upload/deletion increments the pool version and records an automatic transactional mappool audit event.

Supported files are **stable `.osr` containers from version 20140721 up to (excluding) lazer's 30000000 marker**, in the four legacy rulesets, with bounded UTF-8 headers, a validated LZMA replay-frame stream and the documented stable score-ID/Target Practice trailer. Lazer-native replays/extra score-info blocks, older containers, malformed/extra data, oversized dictionaries, non-finite frames and excessive expansion are rejected. Up to **8 MiB per file and 10 files per map**, one upload at a time. The server checks content, not MIME or extension alone. [Official `.osr` format](<https://osu.ppy.sh/wiki/en/Client/File_formats/osr_(file_format)>) and [lazer's version boundary](https://github.com/ppy/osu/blob/master/osu.Game/Scoring/Legacy/LegacyScoreEncoder.cs) inform this scope; this is file validation, not anti-cheat or gameplay validation.

Official beatmap responses now retain the optional MD5 checksum. A known checksum/ruleset mismatch blocks attachment. Missing official checksums (including older saved metadata) are explicitly **unverified**, never labelled matched; refresh metadata **before locking selection** when verification is required. No arbitrary URL is fetched. Attachments reference stable entry IDs, so any legacy/imported attachment follows the same entry during an allowed slot move. An attached entry cannot be removed or replaced without explicit attachment cleanup; a metadata refresh cannot introduce a known checksum conflict. New locked selections cannot be moved/replaced in the first place.

Files stay private even when the pool is published. There is no public replay API or public download URL. The protected endpoints are `/api/admin/tournaments/[edition]/mappools/entries/[entryId]/replays` (GET list / POST bounded multipart upload) and its `/[replayId]` resource (GET attachment / DELETE confirmed versioned removal). Reads validate current read grants; writes also enforce same-origin, current write grants and version/window/archive checks. A retry of already committed content is idempotent; a different concurrent write with a stale version returns 409. See [deployment and recovery](deployment.md#private-mappool-replay-storage-185) for persistent storage, quotas, Python LZMA, backup and offline cleanup.

## Historical S4–S6 metadata

See [historical metadata supplements](archive-map-metadata.md) for the #335 root
cause, official snapshot provenance, field precedence and current/base-value
disclosure. This read-only display enrichment does not rewrite archive imports.

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

Candidates reuse the historical mappool `MapCardBand`: cover, star-coloured rail,
Mod category, title/artist/mapper, saved base parameters (including HP), copyable
BID, official osu! link and osu!direct. The workbench reuses the cover's top-left
Mod badge as the category selector. Adder, intended-round multi-select and
formal pool promotion sit to the right of the beatmap parameters on the same
row; there is no separate control row. Long names use ellipsis at desktop widths,
while narrow screens wrap the row and show the full text. Pool promotion opens
in a scrollable popover containing round/pool selection, the guarded entry form
and success feedback; opening it or completing an addition does not grow the card. Pool promotion, round selection and history use compact 44px icon buttons with
accessible names and hover hints; the round hint retains the saved selection.
The round selector opens a checkbox dropdown in
the browser's top layer, with Save/Cancel and Escape/outside dismissal; opening
it does not add a card row. A clear-selection icon stays at the bottom-left of
the dropdown footer, with Save/Cancel on the right; clearing changes only the
unsaved selection. Cancel/dismiss drops the unsaved selection, while
conflicts keep the draft open for review. Read-only viewers see the saved rounds.
Candidate creation time and the separate footer stay hidden.
Mode/status and snapshot details stay hidden; saved metadata is not a live lookup,
and unknown fields stay unknown. Comment
boxes remain visible below each card on desktop and mobile; history uses a
bounded scrolling area inspired by player messages and loads near the viewport.
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
