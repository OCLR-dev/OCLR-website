# Tournament administration and registration

Database-backed tournament configuration, player registration, role assignment, staff reviews, and audit behavior. For operator prerequisites, see [deployment and recovery](deployment.md).

## Tournament content

Historical editions can import verified source snapshots through the edition's **Historical archive** screen, then preview privately and publish separately. These records retain source identities and aggregate outcomes without creating live registrations, accounts, permissions or approved game results. See [S9 analysis and import handoff](s9-archive.md) for the allowlisted format, unresolved source conflicts and deployment/import checkpoint.

Tournament editions live in PostgreSQL and are managed through `/admin/tournaments`. Global Admins create private editions; edition-scoped Admins configure their assigned tournaments. Creation needs only a name: the URL slug is suggested and editable before creation; UTC is the neutral initial zone. Drafts may have no summary, season or artwork. Add public copy before publishing. Save general information, rules/eligibility, registration and milestones independently, then deliberately publish. The slug is immutable. S11 starts unpublished with its existing artwork and no invented dates, rules or registration window.

Global Admins can remove an accidentally created **unused blank draft** from
Settings → Publication → **Delete unused draft** (#327). Confirm the exact slug
in the dialog. The server checks the current revision, all saved configurations,
setup/publication flags, edition-owned data and audit history in one transaction.
Only an upcoming, never-published draft with no saved content or operational use
qualifies; changing its name, season identifier or time zone alone is allowed.
Clearing content, revoking roles or deleting competition records does not make a
previously used edition eligible. Edition-scoped Admins and Developer/remote
read channels cannot delete drafts. Concurrent settings, setup and role changes
are serialized; stale requests fail without deleting anything.

Removal retires the active configuration, so the draft disappears from public and
staff lists, selectors and edition pages. Its reserved slug, configuration
revisions and automatic `tournament_delete_draft` audit event remain intact.
There is no cascade deletion, slug reuse or new database migration. Existing
historical and used tournaments remain available through the normal private
archive/unpublish controls. Deployment is required before using this new action;
implementation and local tests do not establish that a production draft was removed.

S1's organizer-provided WebP is available as both logo and key visual at its
original 1728×1080 dimensions. The exact S1 workbook enables its seven saved
native rule sections after private source facts are removed. The original PDF
is served at `/archive/s1/rules.pdf`, with the literal section transcript in
[`imports/s1-rules.json`](imports/s1-rules.json). The PDF's date and EX wording
anomalies remain literal; importing presentation support does not approve
match scores, finalize standings or publish the edition.

S2's organizer-provided AVIF is
available as both logo and key visual, with its original 1379×862 dimensions.
The exact S2 workbook enables the current saved native rule sections, including
after public projections remove private source facts. Its five original sections
are preserved in [`imports/s2-rules.json`](imports/s2-rules.json); the original
PDF is served at `/archive/s2/rules.pdf`. This presentation support does not
approve scores, enter final rankings or publish an edition.

Historical directory cards inherit their approved source artwork when no explicit
logo is set; an explicit logo takes priority. S6's original image is available in
the logo and key-visual selectors. Its organizer-supplied rules are maintained as
four original chapters (`重点规则`, `比赛流程`, `BP流程`, `时限`) in the ordinary
rules editor; see [the import checkpoint](s6-archive.md) for the confirmed version
and pending display deployment. The S6 archive's exact source pair enables the same saved sections in
historical public/private views and saved reads.

Both artwork selectors use localized season labels, including **Season 5 (β)**.
The existing S8/S9 1920×1080 images and S10 1024×1024 image are available as both
logo and key visual (#356). Select and preview the desired image in General
settings, then explicitly save; deployment does not select it automatically.
Saved reads and public historical views retain the selected image's dimensions.
**No edition artwork** clears the explicit configuration; existing historical
source-artwork fallback rules remain in effect. No migration or image replacement
is required.

S5 likewise uses its native versioned editor, bound to the exact S5 MainSheet and
QQ rulebook source URLs. The organizer-provided `OCLR β 规则表` is saved in its
original order as `重点规则:`, `BP流程`, and `时限`; source subheadings, wording,
bullets and numbering remain literal. The source transcript is in
[`imports/s5-rulebook.txt`](imports/s5-rulebook.txt), with the saved section
snapshot in [`imports/s5-rulebook.json`](imports/s5-rulebook.json). Public reads
use the edition's current saved version, not that offline snapshot. Deployment
of the S5 source-pair reader is required for the historical page to display it.

Completed historical editions can approve saved pending match scores from the
archive screen with **Approve reviewed matches**. The review list and confirmation
use the current configuration revision; server-side edition Admin authorization,
transactional revision/audit writes and concurrent-save protection remain in
force. Approval preserves the edition's publication state and every source game,
raw score and missing value. It does not create unrecorded matches or final ranks.
Historical source-inspection data is stored in an Admin-only appendix on the
archive screen. Public pages, public saved-read resources and tournament previews
omit the appendix; recorded match totals and MP room-open times remain public. Existing archive replacement still requires an unpublished edition.

**Exchange historical players** saves an organizer-confirmed two-player exchange
in a completed format-2, final-Tier archive without registration. Select two
recorded players from different teams and provide the identity confirmation
source. The confirmation shows both UID/team movements. Captains, coaches,
unresolved identities and chronological draft logs cannot be rewritten through
this operation. Player order, usernames, roles, Tiers, original roster sources,
match results, rankings and missing dates remain unchanged. The original teams
and confirmation evidence are appended to the Admin-only source appendix; public
rosters show the confirmed teams.

The server requires edition-scoped Admin configuration/result-approval authority,
the current configuration revision, both original team IDs and explicit statistics
preservation. It serializes with statistics writes under the edition lock. Every
current published snapshot is checked against both rosters: exclusions, selected
games, team attribution, per-player projections and the complete fixture score
must remain valid and identical. A changed published play rejects the entire
exchange; review or withdraw affected statistics first. Unchanged releases keep
their original publication time, raw MP source and selections, with a versioned
archive-key revalidation recorded in the audit transaction. Valid unchanged drafts
are revalidated without selecting or publishing newly attributable games. Already
stale or changed drafts stay stale and require fresh import/review. Neither an
old request nor a repeated payload can swap the players back. This is not a bulk
archive replacement, a result correction or an automatic production-data change.

Publishing never enables registration. Rules, eligibility and milestones are optional, independent content. Registration requires publication, privacy configuration, explicit enablement and a valid unlocked window. Advance enabling is supported; submissions are accepted from opening (inclusive) until closing (exclusive). Only configured Rules/Eligibility are acknowledged. Missing rules use a null version and absent eligibility uses a null acknowledgment; no synthetic consent is generated. Existing draft/team locks still protect competition setup. Changed rules cannot reuse a version for different text. Configuration snapshots preserve earlier rules, questions and answers without requiring a retention-approval checkbox or coupling question edits to rules versions.

Registration dates, withdrawal deadlines, milestones and fixture times use separate Date and 24-hour `HH:mm` fields with the configured IANA zone immediately after the time (and a date-specific offset when available). Partial edits and daylight-saving gaps block saving; duplicated hours require an explicit UTC offset. Optional dates can be cleared to TBA. Unchanged timestamps retain their original seconds and offset; editing the date/time sets seconds to zero. Changing a fixture’s time zone keeps its scheduled instant and updates the local display. General settings and Fixtures share a searchable city/IANA selector; UTC is the default, valid saved aliases are retained, and supported zones have a bundled fallback list.

`OCLR_EDITIONS_FILE` is no longer read by the application. `drizzle/legacy-editions.json` is an archival migration fixture, not runtime content. Use the one-time, conflict-protected import only when upgrading an installation with externally mounted JSON; see [migration and rollback](deployment.md#tournament-configuration-cutover). Normal tournament management requires no JSON edits or redeployment.

`npm test` runs configuration/business tests. `npm run test:e2e` runs Playwright against the production build (install Chromium using `npx playwright install chromium`; set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome). Test data must never be copied into production configuration.

The development dependency audit reports an esbuild development-server advisory through Drizzle Kit’s legacy loader and an upstream, unpatched `braces` stack-exhaustion advisory through Next.js lint tooling. No esbuild server or Drizzle Studio is exposed, and lint patterns are repository-controlled. `npm audit --omit=dev` is clean; review upstream patches regularly without downgrading the application or forcing unrelated dependency changes.

## Registration lifecycle

Applications are **individual**, with one database-enforced record per stable osu! identity and edition (including withdrawn/rejected records). Withdrawn registrations can submit a fresh player attempt while normal public registration is open. Registration Settings supports up to 16 organizer-authored Text or Single-choice questions. Text is the default for existing questions and retains its maximum length. Single-choice questions have 2–20 distinct, nonempty options, with stable IDs preserved across label edits and reordering. Short lists use radios; longer lists use a selector. Required choices must match one saved option ID; optional choices may be blank. The server rejects unknown/removed options and stale configuration revisions. Editing types, labels or options affects future applications; review, the private dashboard and CSV resolve previous responses using their submitted configuration revision. No database migration is needed for this question-type addition; the existing JSONB answers and immutable configuration revisions remain authoritative.

Configured eligibility is disclosed and acknowledged; staff assess the approved rules manually, never inferred rank/country/age restrictions or claims of official osu! validation. Unknown fields, forged identities, missing applicable acknowledgments and stale rule versions are rejected. Repeated/concurrent submissions cannot create duplicates. The organizer approved the new Chinese question-type and historical-answer explanation on 2026-10-23 under #114; organizer-authored labels/options remain literal in every locale.

After saving typed questions, roll back only to a build that understands `type`/`options` in edition configuration. Earlier strict schemas cannot parse these newly saved fields. Retain configuration revisions and original answer IDs; do not erase or reinterpret responses to make older code accept them.

`pending` means awaiting staff review; staff may change it to `accepted` or `rejected`. A player may withdraw a `pending` or `accepted` application only before the explicitly configured `withdrawUntil` and while the edition is unlocked. `withdrawn` retains its history and may reapply during open registration; rejection cannot be changed by a player. No withdrawal deadline means no self-service withdrawal. Captain appointment/locked draft state prevents self-service withdrawal and requires staff review. Every transition is recorded with actor and time; review is separate from captain/team assignment. Edition-scoped transaction locks serialize eligibility-affecting changes and draft lock against withdrawals/submissions.

## Staff provisioning and reviews

There are no seeded administrators. Verify the first administrator's numeric osu! profile ID out of band, explicitly place that ID in the server-only `ADMIN_OSU_IDS` comma-separated bootstrap allowlist, deploy/restart, and authenticate normally. Legacy `STAFF_OSU_IDS` is ignored: review each old operator's responsibilities before explicitly granting a role. Never copy the old list automatically.

Administrators manage persistent Admin, Mappooler and Referee assignments at `/admin/staff`. Recipients must first authenticate through osu!. Grants may be global or limited to a configured edition; multiple grants combine capabilities. An edition administrator can only grant/revoke roles within that edition. Every confirmed grant/revocation automatically records actor, recipient, scope and before/after assignment. Revocation applies on the next server check, including existing sessions. Captains receive no staff privileges from their appointment.

Keep bootstrap access restricted for recovery. An environment bootstrap administrator cannot be revoked through the website: remove the ID from `ADMIN_OSU_IDS` and restart. Before removing the final bootstrap ID, verify a persistent global Admin can sign in. A scoped Admin cannot recover global access. Never grant roles from usernames, client cookies or request-supplied actor identities.

Staff enter `/admin` for a role-aware overview, then select a tournament at `/admin/tournaments`. The selected workspace has grouped operational navigation, a tournament switcher and breadcrumbs. General/rules/registration/milestone/publication settings live under `/admin/tournaments/[edition]/settings`; registration review lives under `/admin/tournaments/[edition]/registrations`, with `/admin/registrations` for authorized cross-edition search. Legacy filtered `/admin` bookmarks and registration detail URLs redirect safely. Global Staff Management and Audit stay outside tournament navigation; personal accounts remain on the public website. All page queries, APIs, reviews and exports also enforce authorization on the server. Pending applications may be accepted/rejected with explicit confirmation; rejection requires a player-visible explanation. Reviews use transaction locks and a version check, so stale or concurrent decisions are rejected. Locked editions cannot be reviewed. Audit events include actor, before/after status, timestamp and reason. CSV exports contain ID, username, edition, status, submitted time and private application answers, with original question/option labels and stable IDs. Formulas/control-prefixed cells are neutralized and quotes escaped. Internal audit data and staff notes are excluded. Exports are limited to 10,000 filtered rows and should be handled as private staff data.

## Automatic staff audits

Routine commands accept no generic audit-reason field. Existing event tables share an automatic contract: authenticated actor, action, edition/entity ID, database timestamp, authoritative before/after changes and applicable revisions/request keys. Edition/result event details include an explicit entity type/ID; mappool and role tables retain their existing typed pool/grant context. Writes happen in the mutation transaction; rejected or rolled-back changes cannot leave a successful-update event. Migration `0012` makes historical reason columns nullable and adds before/after role assignments without rewriting old records or inventing explanations. Historical notes remain readable through the Admin-only `/admin/audit` browser. It queries existing audit tables without a second store, with edition, actor, action, module, UTC date filters and server pagination. Edition-scoped Admins see only their editions; Mappoolers and Referees cannot access generic audit records. Private answers and credential fields are redacted from this bounded read projection. Match review retains its necessary source evidence and immutable result revisions. Public DTOs never include audits.

Draft unavailability explanations, player-visible registration rejection explanations, game exclusions and permitted substitution evidence remain business decisions. Result rejection/withdrawal uses the specifically named `decisionNote`; it is collected in that action's confirmation dialog, never required for ordinary import, submission, approval or publication. Routine saves use a single button; privilege changes, publication and destructive/finalizing actions retain confirmation. Authorization, CSRF, version locks and result idempotency remain server-enforced.

Edition Registrations → **Add registrant** resolves a numeric osu! ID, canonical profile URL or explicitly selected current osu! username through the existing server-side profile client. Numeric usernames must use the username input type; ID lookup never falls back to a username. Verify the current official name, avatar, numeric ID and profile link before confirming. Pending entries remain private; choosing Accepted requires explicit approval of the normal public identity listing. Staff-assisted entries store `source=staff`, the current configuration revision, empty answers and null player acknowledgments. The initial registration event identifies the authenticated operator and status. The real osu! account owns the entry on subsequent sign-in; no session or credentials are created for it.

An unlocked, unfrozen edition can accept an explicitly confirmed registration-window exception with an explanation in the private audit log. This does not change public registration availability. Completed/locked editions, active/finalized drafts or finalized rosters reject additions. Existing entries of every status remain conflicts. Apply migration `0018_manual_registration_source` before running this release; existing records retain player provenance and historical acknowledgments. To roll back application code, retain the additive source column and constraint—do not rewrite staff entries as self-submissions or drop their audit history.

The organizer approved the Chinese staff-assisted registration, public-identity confirmation and registration-window exception wording on 2026-10-22 under #85. This is an operator attestation, never a player acknowledgment.

BWS is informational for osu!standard only. The formula is [documented by osu!](https://osu.ppy.sh/wiki/en/Tournaments/Badge-weighted_seeding); API badge descriptions do not establish prize type or ruleset. In a private registration detail, load the cached standard profile and classify every badge as a standard tournament prize, not eligible, or unknown. No evidence/reason input is required. Unknown or missing/partial inventory keeps BWS pending; an explicit empty provider inventory means zero badges. Changed inventories invalidate reviews. Public accepted-player profiles show only aggregate value/count/mode and review/update dates, never classifications or reviewer identity. Ordinary profile statistics retain other rulesets; they do not display BWS. Migration `0019_badge_reviews` and historical audit records remain unchanged on rollback.

The organizer approved the Chinese BWS caveat and same-mode badge-classification wording on 2026-10-22 under #89. This approval does not classify any player’s badges or confirm live provider data.

An incorrect, unused fixture can be removed from **Manage fixture → Delete fixture**. Unpublish it first. Imports, result/revision records, protected competition history or downstream bracket references block deletion. Harmless referee assignments are removed, while the setup audit records are transferred transactionally to the existing edition audit stream with their original IDs, actors and times; deletion also records the prior fixture snapshot. Cancellation remains a distinct competition operation.

### Automatic eligibility and BWS

Automatic eligibility is optional, edition-specific, osu!standard-only PP/global-rank bounds. All configured limits are inclusive and combined with AND. Numeric rank ≥ 10000 excludes rank 9999; numeric rank ≤ 20000 excludes 20001. No limits means no automatic restriction, including for an unranked player. Text eligibility remains optional and separate. BWS is informational and is never substituted for global rank.

Applicant checks reuse the profile cache but require a snapshot under five minutes old; refreshes retain the existing one-minute claim/backoff and provider-error handling. Provider I/O occurs before the edition row lock. Submission rechecks configuration revision, snapshot freshness and current registration/lock state transactionally. Failure blocks self-service; unavailable data requests retry rather than fabricating zero/pass. Private registration verification stores inputs, comparisons, source and edition revision. Existing applications keep their original snapshot and status when limits change. Staff-assisted exceptions require explicit confirmation and are stored as Staff override, never automatic Pass. No public registration verification history is exposed.

BWS badge review is now osu!standard-only. Other-mode historical classifications remain excluded; ordinary profile statistics retain all four rulesets. Saving classification needs no evidence/reason field; automatic audit retains source badge facts and before/after values.

The organizer approved the new Chinese automatic-eligibility and permissive-draft explanation (and corresponding Traditional Chinese meaning) on 2026-10-22 for #100/#101.

### Reapplication

Apply again opens the current questions, rules and eligibility checks; it never restores an old acceptance. Each fresh submission updates the same registration ID to Pending with player provenance, new timestamps/answers/acknowledgments and an incremented attempt. An explicit prior-attempt token, edition lock and registration row lock protect concurrent retries and staff restoration. Existing captain/roster/fixture/draft-pool references require staff recovery first. Prior withdrawn attempts are archived with their original source, answers, configuration/rules version and eligibility snapshot. Staff can inspect this private history; CSV and public visibility use only the current attempt. Staff restore remains a separate correction without new player consent.

Migration `0024_registration_attempt_history` adds attempt numbers to registrations/events (existing records are their original first attempt) and an initially empty archive. It never invents prior answers or acknowledgments. Preserve this additive history during application rollback; older builds do not support self reapplication. Organizer approved the reapplication wording on 2026-10-23 under #116.

### Bulk staff-assisted enrollment (#184)

**Add multiple registrants** accepts 1–20 non-empty lines, up to 8192 characters. Unprefixed lines use the selected input type (usernames by default); canonical HTTPS profile URLs are recognized directly. For mixed input, use `name: Example Player`, `name: 12345` for a numeric username, or `id: 12345` for a numeric ID. Internal spaces and special characters are preserved. Blank lines are ignored and source line numbers remain visible.

Username resolution follows the official [Get User API](https://osu.ppy.sh/docs/index.html#get-user), using an encoded `@`-prefixed username. The older `key=username` parameter is deprecated. The provider sometimes resolves previous usernames; this feature deliberately rejects responses whose current name differs (case-insensitive comparison only). Use the current name or stable ID after a rename. No fuzzy matches, space/underscore substitution or unverified identities are accepted. Resolution has a 60-second bounded process cache (including failures, at most 1000 names and 8 active resolutions); authoritative ID profiles retain the existing shared database cache, claims and failure backoff. Stale/fallback profiles cannot enroll players.

Preview does not create registrations. Each row shows its resolved identity, eligibility, any existing status and ready/duplicate/failed state. De-duplication uses the official ID across names, IDs and URLs. Existing pending, accepted, rejected and withdrawn records link to their normal management view and are never overwritten or restored. Uncheck rows to exclude them, or edit the pasted text and preview again. Eligibility exceptions are explicitly confirmed per selected player; the registration-window exception and explanation apply to the selected list. Pending is the default. Accepted requires a new explicit approval of the selected identities' public listing; changing the selection clears that approval.

Confirmation submits only the selected stable IDs and the previewed edition revision. Each player uses the existing enrollment service and one transaction for the user, registration and automatic event. Partial success is intentional: successful players remain saved, existing records are skipped, and failures retain their individual error. Result counts cover the submitted selection; excluded and preview-only duplicate/error rows are not counted as attempted writes. After a failure, **Preview unfinished rows again** excludes completed items, refreshes unresolved rows and clears exception/publication confirmations. After a lost response, retrying the selection checks the unique edition/user constraint and reports any already-saved records as skipped. No automatic browser retry occurs.

Both batch endpoints require same-origin authenticated `manage_registrations` permission for the requested edition and bound streamed JSON to 32 KiB. Provider lookups are sequential within a batch and use the shared provider pacer (1.1 seconds between calls, 10-second fetch timeout, at most two transport attempts). The existing profile service caps concurrent outstanding ID lookups at 32. Provider rate limits/timeouts remain failures; there is no fallback enrollment. Commit rechecks identity, eligibility, authorization, edition protection and configuration revision for each transaction. No player answers/consent, OAuth sessions, captain/team/Tier assignments or new migration are created.

The new #184 Simplified/Traditional Chinese interface wording is pending organizer review; the earlier #85 wording approval does not cover these additions. This feature does not deploy the site or perform real tournament enrollment.
