# Published match details (#283)

Both ordinary fixture pages and historical match pages render saved records only.
The shared projection is `src/lib/match-details-model.ts`; it never fetches osu!
or writes business data. No migration or automatic production backfill is needed.
Missing provider fields remain missing until a separately authorized import/review.
Saved missing-mod validation flags project to `modsKnown: false`, rather than
mislabeling unavailable game/player mods as NM.

## Source → review → public display

| Saved source                                                            | Approved selection / transformation                                                                 | Public display                                                                                     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Ordinary `match_imports` + `match_games`                                | Exact `publishedRevision`, approved revision/import fingerprint; published fixture and team lineage | Source MP link, partial-source warning when needed; game ID preserves repeated maps                |
| Historical `historical_statistics.published`                            | All fixture MP sources, matching archive key, whole-fixture reconciliation                          | All approved rooms; immutable snapshot fingerprints remain in saved evidence, outside the match UI |
| Game beatmap ID, artist/title/difficulty                                | Literal saved metadata                                                                              | Beatmap link and identity; no slot-derived mods                                                    |
| Game start/end, mode, team type, scoring type, mods                     | No inferred times or rules                                                                          | Recorded timestamps in edition timezone; absent values labelled                                    |
| Score osu ID, total, accuracy, combo, hits, mods, pass, lobby team/slot | Public identities only; reviewed roster/substitution mapping                                        | Player/team links, 300/100/50/miss, actual score and reviewed contribution                         |
| `providerFields.score`, `legacy_total_score`, `total_score`             | Explicit numeric allowlist                                                                          | Expandable additional score values; no generic provider payload                                    |
| Included game decisions / historical included IDs                       | Excluded games retained as source evidence                                                          | Included/excluded labels; no internal reason or substitution note                                  |
| Failed score policy                                                     | Ordinary approved policy; historical retained raw scores                                            | Separate original and effective values, never overwrite the actual score                           |
| Historical score exclusions / roster-team override                      | Published review snapshot                                                                           | Excluded public player scores do not contribute; private/non-roster identities withheld            |
| Official series score / technical adjudication                          | Existing official result remains authoritative                                                      | Official scoreboard separate from retained-game wins; administrative points create no scores       |
| Effective approved games                                                | Existing `calculateRating` via `ratingSnapshot`; no SR                                              | MRA/ERA/DRA/RWS/appearances; invalid data has no substituted zero rating                           |

Raw events, provider warnings, reviewer reasons, private evidence and unapproved
revisions are not public DTO fields. A null score is not zero. Excluded effective
scores are not applicable. Incomplete/private raw totals remain unknown.

Historical review now rejects duplicate game IDs, rather than every repeated
beatmap ID. Reviewers still explicitly select valid games, and existing eligibility,
MP coverage, uniqueness, technical adjudication and series reconciliation checks
remain required. Merely importing a replay does not include it.

Ordinary result revisions currently approve one import/MP. The details follow that
exact import; unrelated or newer imports are not treated as additional approved
rooms. Historical fixtures support all recorded MP rooms atomically. This change
does not invent a new multi-import ordinary-result approval workflow.

## Match-page presentation (#377)

The shared ordinary/historical match view leads with played maps and Match Rating.
It removes the fixed series-result explanation, failed-score policy paragraphs,
missing-value glossary, source revision/fingerprint text, rating formula, policy
code, comparison-group disclaimer and calculation-source disclosure. The nested
YumuRating heading and its extra section spacing are also removed on match pages.
The [rating reference](yumu-rating.md) retains the methodology. Round reports and
the Admin rating workspace retain the full `PlayerRatings` presentation.

Actual and reviewed scores/totals keep their separate labels. Only relevant
conditions add short local notices: technical adjudication, partial MP sources,
reviewed team mapping, incomplete public player data and failed scores actually
changed to zero. Excluded maps and scores keep their status and recorded values;
missing values remain unknown and a recorded zero remains zero. No new generic
explanation panel replaces the removed text. Additional provider score values
and user-opened player evaluations remain available as actual data/detail views.

This is a rendering change only. Saved snapshots, source evidence, API fields,
rating/scoring calculations and publication/authorization checks are unchanged.
New Chinese status wording requires organizer review before acceptance.
Same-viewport synthetic screenshots and the review wording are recorded in
[the #377 verification notes](verification/issue-377/README.md).

## Consistency and delivery

Ordinary details, official result and rating are read in one repeatable-read,
read-only transaction. Historical archive identity, published snapshots, score
projection and rating use one such transaction; the page also checks its archive
key before rendering details. Withdrawal or archive changes withhold stale details.
New drafts do not change the released snapshot. Historical rating evidence uses
published snapshot fingerprints, not the mutable draft row version.

Read API 1.2.0 adds the DTOs to `publicFixture` and `publicArchiveStatistics` and
regenerates the shared contracts/OpenAPI. Historical detail reads use the optional
`fixtureId` filter; unfiltered edition statistics omit match detail payloads to
avoid duplicating every game and rating in season-wide responses. The frontend requires 1.2.0+ within v1;
update the separately managed backend before using these fields remotely.

## Acceptance evidence

Automated fixtures are synthetic, including the historical S10-shaped case.
They are not evidence that live S10 match-2 has been reimported, reviewed or
published. Actual organizer verification of that fixture and the new Chinese
wording remains separate. No production data, grants, credentials or deployment
is changed by this implementation.

### Read-only live source check — 2026-10-26 (Asia/Taipei)

The existing anonymous [S10 statistics API](https://oclr.org/api/v1/tournaments/s10/statistics)
returned HTTP 200. Its published `match-2` projection has official score 6:2,
`technicalAdjudication: false`, MP 117474217, eight game IDs, 64 score rows and
16 distinct players. Grouping the retained actual scores by game/team reproduces
six wins for team-d and two for team-h. All 64 rows have score, accuracy, combo,
pass/fail and a hits object; only 60 have a recorded `meh` count and 59 a `miss`
count. Missing judgements must therefore remain unknown, rather than zero.

An offline, read-only call to the existing `yumu-mra-v1` core using those public
retained rows reports eight games, 64 appearances and 16 players, no issues and
finite MRA/ERA/DRA/RWS values. This checks the available public source, not a
new production publication or acceptance of the undeployed page. No live records
were imported into synthetic fixtures. The current server rejects the new
`fixtureId` query (HTTP 400), confirming that backend rollout is still needed.

### Local verification

Verification uses Node 24.22.1 and isolated PostgreSQL 17 test databases. Lint,
TypeScript, production build, i18n extraction/checks and production dependency
audit pass (zero reported vulnerabilities). A clean review build excludes local
environment files.

The full unit/integration run initially reported 1,161 passing tests and three
failures (the previous blanket replay rule, literal provider labels, and generated
coverage drift). These were corrected; the affected seven files subsequently
passed 37 tests, with all six projection tests and four i18n tests passing after the timestamp
ordering and missing-Mods checks were added.

The six desktop/mobile detail and player-evaluation browser tests pass. The four
detail cases also pass again after the final missing-Mods correction.
Historical screenshots cover all 36 locale × appearance × brightness × viewport
combinations, plus ordinary fixture screenshots. Axe, keyboard focus, retained
scores, withdrawal, literal names, team-column width, real `clientWidth` overflow
and mobile evaluation clicks are asserted. The Grid containers explicitly allow
wide tables to shrink into their local scrolling regions; the layout viewport
must not grow to the table's minimum width.

The complete browser sweep and commit-specific CI status are reported on
[#283](https://github.com/OCLR-dev/OCLR-website/issues/283). Local Firefox fails
before page loading with “Could not find profile folder”, including with a fresh
isolated download; do not interpret that environment failure as a Firefox pass.
