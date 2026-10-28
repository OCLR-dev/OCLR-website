# Historical MP statistics — S1–S10 (#177, #366)

## Product and calculation

The statistics workspace uses the existing MainSheet appearance tokens: a calm, compact table with small player avatars and one accent for selection. The reading order is coverage → stage tabs → team/search/sort → player aggregates → optional per-game detail. Interaction is confined to tab/filter transitions, row selection and expanding details; no decorative dashboard mosaic or new UI framework.

The original #177 S7–S10 MP inventory contains 111 played matches / 111 links: S7 21, S8 38, S9 22 and S10 30. The S7 confirmed forfeit has no played game and contributes no player statistics. Empty templates are not imported. S1–S6 coverage is computed from each saved archive rather than included in that original inventory.

- One selected official game is one map appearance, including a recorded failed score. Match appearances count distinct archive fixture IDs.
- Raw total / arithmetic mean score, arithmetic mean known accuracy, maximum recorded combo, complete-known Miss sum and mean known pass flags are shown. Missing fields stay null, never guessed as zero. Accuracy shows known-value coverage.
- Relative score = player score / highest player score **in the same game**, averaged over known positive-denominator games. This is a descriptive metric, not a retroactive award release or a new eligibility/Tier rule.
- All-zero games have no relative score. Zero observed appearances are displayed as unknown when match coverage is incomplete. Raw score systems remain literal in per-game detail; cross-system totals and small samples require care.
- Stage labels, identities, map metadata, timestamps and mod values remain source literals. Stage grouping uses existing archive fixture stages; it does not fabricate weekly dates or unrecorded knockout round names.

Public: `/tournaments/s1/statistics` through `s10` (including OCLR β as `s5`). Admin: `/admin/tournaments/{edition}/statistics`. Navigation, archive match details and saved statistics reads share the same exact season allowlist. An edition still needs its own saved historical archive and publication; adding support does not import, approve or publish any MP statistics.

S1–S6 use the existing import/review/release workflow and database/remote read contracts without a new table or migration. Public reads show only reviewed, released snapshots. Empty drafts have no player rows; matches without MP evidence remain uncovered rather than receiving fabricated appearances or zero scores. Edition-scoped staff access, optimistic versions and transactional audit remain enforced. Source/result/ranking uncertainties stay in the archive; this compatibility change does not resolve them. #365 separately tracks S2 evidence and statistical review.

## Import and review

The server follows only MP IDs already present in that edition's authoritative historical archive. It reuses `fetchMatchSource` and the credential-isolated official osu! API client, including ascending pagination, event bounds, duplicate/change detection, size/time budgets, rate limiting and failure preservation. Arbitrary URLs and client-supplied scores cannot be imported.

Import missing histories sequentially; stop after the current MP or resume later. A failed/deleted/rate-limited source leaves saved draft and published data intact. One source is bounded to 500 games / 2 MB. No visitor request fetches provider data.

Imports produce **private drafts with no selected games**. Reviewers choose the recorded pool and scoring games, excluding warmups, aborted games and superseded replays. Incomplete/unfinished histories, unsupported modes/scoring, missing/conflicting score facts, unknown/opponent roster identities, unreviewed ambiguous team colors and duplicate/replayed maps cannot be approved. Both team identities are attributed by UID, never by lobby title or name similarity.

Missing historical pools (notably S7's empty GF source) do not justify inventing maps. A reviewer may explicitly confirm that the pool is incomplete and select authoritative MP beatmaps instead. This confirmation is saved with the review/audit. Such games retain MP beatmap metadata and an unknown pool slot. Roster, source completeness, duplicate checks and score reconciliation still apply.

Official histories may contain referee/coach lobby occupants with zero score, zero combo, zero accuracy and no successful hits. Reviewers can explicitly exclude these individual records after confirming that the user did not play. This is never inferred from a zero score or a role alone: genuine failed scores remain included by default. Exclusions are saved and audited with the versioned review, and only apply to validation and published projections; raw MP records stay intact. For normal zero-record exclusions, positive scores and partially played records are rejected. Unknown score IDs and duplicate exclusions are always rejected. Save these decisions before selecting games; publication still requires both teams and the original series score.

An edition Admin explicitly **Approve & publish statistics** for a whole fixture. Every recorded MP source must be imported; selected map totals and team wins must exactly reconcile with the already accepted historical series score. This detects most extra warmup/replay mistakes but does not replace human review. Withdraw hides only that fixture's statistical release. The archive result is never edited by statistics operations, and the edition need not go offline.

## Storage and permissions

Migration `0029_historical_statistics.sql` adds `historical_statistics`, keyed by edition + MP ID, with independent draft, published snapshot and optimistic version. Writes lock the authoritative edition row, recheck permission and archive fingerprint, and append an automatic `edition_events` record transactionally. Concurrent stale operations fail 409. An unchanged source refresh preserves review choices and adds no duplicate release/audit.

Referees may import/review only their edition; Admin approval is required for publication/withdrawal. Public reads require a published supported historical edition and expose only selected released games with minimal existing roster identities. Provider event logs, draft selections and audit details remain private. Refreshed/edited drafts never silently replace a published snapshot.

The archive fingerprint covers competition identities, matches and pool evidence. Competition changes invalidate dependent statistics; staff-only/provenance edits do not. Duplicate game claims across published fixtures are rejected. No accounts, registrations, roles or live result records are created.

## Deployment handoff

1. Organizer deploys the reviewed commit using the existing backed-up migration/release workflow. This feature requires migration 0029; do not roll back to a build that lacks this table while serving these routes.
2. Through computer use, open the intended S1–S10 statistics manager and import missing MP histories. Existing edition visibility stays unchanged.
3. Review official games against pool/roster/series score. Leave unavailable sources uncovered; retain original series results.
4. Approve and publish each reviewed fixture separately. Verify anonymous coverage, stage/team/player filters, score details, desktop/mobile and both themes.
5. Record actual production evidence on #177. Local synthetic verification does not establish availability of these 111 historical MP histories.

Do not read local OAuth secrets or call the production database/API from development. Existing server-side osu! public credentials are used at runtime. No production deployment/import is performed by this development step.

## Local verification (2026-10-24)

- Full unit/integration batch: 99 files, 727 passed, one existing skipped test, using only `oclr_archive_test`.
- After final statistics refinements: all 26 affected model, MP-normalization, i18n and transaction checks passed; lint/types and production build passed. Production dependency audit: zero vulnerabilities.
- Desktop and mobile Chrome browser workflows passed: real importer/review UI, warmup/replay blocking, explicit publication, anonymous/private API boundary, all four editions, all three appearances, light/dark, search, per-game hit counts and both Chinese locales. Axe reports no violations and document widths remain within 1440/390 px.
- Browser testing found and corrected select-label ambiguity and filled-button theme inheritance that reduced role-text contrast. Rendered desktop dark and mobile Swiss light screenshots were visually inspected.
- Migration 0029 was applied only to the isolated local test database. No production MP availability, live import, deployment or published historical statistics are claimed here; these remain deployment-time acceptance work.

## Live import checkpoint and occupant review correction (2026-10-24)

Computer use verified 111 stored production MP drafts (S7 21, S8 38, S9 22, S10 30; none missing after retrying S10 network failures). Review discovered zero-score referee/coach lobby records. S8 match 1 correctly fails roster validation until these are explicitly excluded. S7 A1 initially passed because its referee is also an archived coach; withdrawal was requested for correction and remains pending organizer approval. S9 match 1 alone was reviewed and released (9 scoring games, original 6:3, no extra occupants); anonymous coverage is 1/22. This is not completed season-wide statistical acceptance.

The follow-up adds explicit per-game/UID zero-score exclusions with immutable source preservation, version checks, automatic audit and unchanged team/series-score validation. It needs a normal organizer deployment, with no new migration; then resume computer-use review of the saved drafts. Local verification: 99 test files / 732 passed, one existing skipped; after final refinements all 18 affected checks passed, lint/types and production build passed, desktop/mobile Chrome workflows passed (including three appearances, both themes and Axe), and production dependency audit found zero vulnerabilities. No production API/DB was accessed directly.

Live follow-up: the real all-miss records did not show the exclusion control when successful-hit fields were absent. The eligibility helper now permits explicit review with recorded zero score/ACC/combo, a positive recorded Miss count and no reported positive successful hits. Nullable hit counts remain nullable; missing data is never rewritten as zero, and no record is automatically excluded. Regression tests use a sparse `{count_miss: 100}` response, matching the dictionary form of [official ScoreStatistics](https://osu.ppy.sh/docs/#scorestatistics). All 99 test files passed (733 tests, one existing skipped), lint/types/build and desktop/mobile Chrome flows passed. This follow-up requires a normal deployment but no migration or MP refresh.

## Explicit historical exceptions (2026-10-24)

Live review identified organizer-confirmed technical adjudication (S8 6, 15, 20 and S10 26), incorrectly selected MP team colors (S8 7), and a referee lobby record with 3 points (S10 29/30). These are explicit Admin-only review choices, with optimistic versions and transactional audit; imports and source refreshes do not infer them.

- Technical adjudication preserves the authoritative historical series score. Selected actual MP games may have different map winners or omit awarded points with no score record. At least one real game is required and the selected count cannot exceed the original series map total. No awarded player score or missing appearance is invented. Public coverage identifies adjudicated fixtures and explains that aggregates reflect only actual MP scores.
- Per-game roster-team confirmation attributes known UIDs to their authoritative fixture team even when lobby colors conflict. Unknown/opponent identities, duplicate scores, incomplete games and unsupported score rules still fail; raw colors remain unchanged.
- An Admin may explicitly confirm a non-participant score, including nonzero records. The UID must exist exactly once in the raw game and normally cannot belong to either fixture team. The separately confirmed bench case below requires four other retained positive teammates. Ordinary roster-player positive/partially played scores cannot use this exception. No role or score threshold automatically excludes a record.
- All exceptions require edition-scoped approval authority when saved and again inside the locked write transaction. Public reads revalidate released snapshots; defaults remain fail-closed. Existing result, roster and raw provider data are never edited by this workflow.

Local exception verification: 99 files / 737 tests passed with one existing skipped, lint/types and production build passed. Four desktop/mobile Chrome flows passed, including exception review, explicit release, anonymous notice, real-player exclusion rejection, all appearances/themes and Axe. Production dependency audit: zero vulnerabilities. This follow-up needs organizer deployment, with no migration or MP re-import.

Current live checkpoint: S9 22/22 released (213 scoring games / 64 played UIDs); S7 A1 corrected and re-published with referee/bench placeholders excluded. S8 and S10 review is ongoing. Organizer confirmed S8 36/38 and S10 30 terminal extra games are post-match and should be excluded; short-handed official games are published only for actual recorded UIDs and scores, never supplemented with zeroes. None of these confirmations changes original historical results.

Organizer-confirmed S7 A10 follow-up: a rostered bench occupant left 0/50-point lobby records while four teammates already had positive scores. Explicit Admin non-participant review now also permits a bench record only when at least four other distinct, positive, valid same-team records remain after **all** exclusions. Multiple exclusions cannot reduce that lineup below four. No record is automatically removed, and raw source facts remain intact. This requires a normal deployment without migration or re-import; S7 A10 remains draft until applied and checked through the UI.

Bench follow-up verification: all 24 affected model/transaction/i18n checks passed; lint/types/build passed. The four existing desktop/mobile statistical workflows passed; the two new bench workflows passed after correcting synthetic player roles and removing unsupported synthetic Tiers. No application workaround was used for fixture-validation failures. Latest anonymous production coverage before deployment: S7 20/21, S8 38/38 (355 maps), S9 22/22 (213 maps), S10 30/30 (265 maps). Only confirmed S7 A10 bench cleanup remains.
