# S2 historical follow-up (#365)

This follow-up preserves #285's accepted archive and separates source review,
identity confirmation, statistics review and publication. No new migration is
required. Deploying or publishing is a separate organizer action.

## Read-only reconciliation

`scripts/review-s2-archive.py` compares a saved S2 archive with bounded MainSheet
range reads. It produces a private JSON report, HTML review and SVG candidate
bracket without network requests or application writes:

```sh
python3 scripts/review-s2-archive.py \
  --archive /PRIVATE_WORK/saved-archive.json \
  --ranges /PRIVATE_WORK/source-ranges.json \
  --mp-dir /PRIVATE_WORK/mp-snapshots \
  --output /PRIVATE_WORK/review
```

The range input maps exact sheet titles to Sheets value responses containing
`range` and `values`: `GS Schedule!B8:N30` and `ES Schedule!B8:N19`.
Use metadata-grounded connector reads, preserving null/blank cells. Retrieve the
current saved archive through the authorized management UI. Keep management
appendices, raw MP histories and review outputs outside source control and public
issues. The report records input hashes; MP snapshots have their own hashes and
must not be described as fresh provider requests.

The 2026-10-26 comparison found all 30 source rows consistent, including six
draws and one forfeit. There were 23 recorded MP links, 18 complete saved
snapshots and seven played knockout fixtures without MP links. These counts
establish source reconciliation, not independent approval of map decisions.

The rules specify group BO8, win/draw/loss points of 2/1/0, group ranks 1–2
entering the upper bracket and 3–4 entering the lower bracket, BO11 knockouts
and no grand-final reset. The script's explicit knockout template is a
**candidate for organizer review**. Matching its 12 outcomes to recorded teams
does not independently prove official progression. Warmups, repeated maps,
team-fail decisions and lobby occupants remain review items. The script never
selects statistics games, excludes a score or changes an official result.

S2's undated final was displayed before later dated rounds because the generic
renderer assigned it depth zero. For the exact S2 workbook, the presentation now
uses the recorded `ES Schedule` row order when all knockout source rows are
available. Its unknown date and unknown predecessor edges stay unknown; original
stage names remain literal.

## Resolve an unknown identity

Completed historical editions without registration now offer **Resolve archive
identity** for source-only roster positions, including published editions. An
edition Admin supplies the explicitly confirmed numeric UID and its confirmation
source, reviews the confirmation dialog and saves one identity.

The command locks the edition, rechecks `configure_tournament` authority and
the expected configuration revision, rejects UIDs already in the roster or
replacement history, and validates the resulting archive. It preserves the
original name, team, role, Tier and roster source, adds private confirmation
evidence, and records a configuration revision and transactional audit event.
It does not replace match/standing/pool data, create an account, change grants or
change edition visibility. A stale/repeated command fails safely. Changed roster
identity invalidates dependent statistics through the existing archive key.

After deployment, apply only the organizer-confirmed S2 identity in #365 through
this form, reload it and check its edition-specific public profile link. Do not
unpublish/reimport the entire accepted season to resolve one UID.

## Statistics integration

S2 uses the existing importer/reviewer and six statistics tabs, with shared
season support in public/Admin navigation and saved-data services. Whole-series
ties reconcile normally; forfeits without plays remain excluded. Accepted played
fixtures without MP links stay in the coverage denominator and cannot publish
empty statistics. Pending match reviews are not counted as accepted fixtures.

The existing explicit Admin bench exception requires three other retained,
positive teammates for S2's exact source and 3v3 rules. Other editions retain the
four-player safeguard. All exclusions are checked together; no score, role, NF
mod or threshold automatically excludes anyone. Raw source data remains intact.

The six-tab public workspace shows reviewed match coverage, scoring games,
players with data, known accuracy/combo counts and per-match release state,
including technical-adjudication notices and links back to edition match pages.
Coverage includes missing-MP fixtures. Profile links are added only when a
displayed historical name identifies one known UID. Aggregate participation/pick
rates describe released observations, not unrecorded season-wide appearances.

After deployment, import only recorded S2 links into private drafts. Retain failed
or unavailable sources as uncovered; review roster attribution, legitimate failed
plays, bench/referee occupancy, warmups, replays, teamfail adjudication and map
selection before explicit Admin approval. Never turn awarded points into player
scores. No live import or statistical publication is performed by the code change.

The new identity form/error and known-value labels have three locale entries.
New Chinese wording awaits organizer review. CI and deployment evidence must be
recorded separately from local synthetic verification.

## Local verification (2026-10-26)

- Node.js 24.22.1, locked `npm ci`; ESLint/route types/TypeScript and production
  build passed. Production dependency audit found zero vulnerabilities.
- Full unit/integration run against dedicated loopback `oclr_365_test`: 1,214
  passed, one existing skipped and one newly added test had an incorrect
  expectation about the pre-existing generic ordering. After fixing that test
  and hardening the S2 source-order guard, all 44 affected model, transaction,
  bracket and i18n checks passed. This is the recorded full-run result plus
  affected rerun, not a claim of a second full-suite pass.
- Desktop/mobile Chrome workflows passed for import/review/explicit publication,
  score exceptions, bench safeguards, unknown identity resolution and public
  readback. Additional S2 checks cover all six tabs, round/team/map/search
  filtering, profile links and missing-MP coverage. Existing appearance/theme
  loops and Axe checks passed. The identity test uses fresh synthetic edition
  slugs so reruns do not collide with an earlier saved revision.
- The read-only report reconciled all 30 rows and 12 candidate outcomes.
  Mismatch reporting, unrelated-source rejection, missing-row rejection, input
  preservation, HTML parsing and SVG XML validation passed. Browser policy
  blocked opening the local HTML file, so no browser-rendered report QA is
  claimed. Application screenshots were inspected separately.
- No production data/roles were changed, no provider statistics were imported or
  released on the live site, and no deployment was performed. New Chinese labels,
  candidate advancement relations and the eventual deployed UI still require
  organizer review. Commit-specific CI is recorded on #365 after pushing.
