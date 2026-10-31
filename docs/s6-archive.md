# S6 surviving historical sources (#289)

## Team K roster correction (#629, 2026-11-01)

[Issue #629](https://github.com/OCLR-dev/OCLR-website/issues/629) supersedes the
2026-10-25 interpretation of `队伍表!J43`: Name-Less- (8425774) and
PhantoMPainN (14947596) are both regular Tier 4 players for Team K. Neither is a
substitute or a replaced player. The import packages now contain 72 numeric-UID
roster identities, 13 unresolved identities and no replacement slot (85 people).
The schema also normalizes the exact legacy S6 replacement entry on read, so
already saved imports receive the correction without reimporting or changing
publication, approved results, or audit history. Other sources and replacement
entries retain their existing meaning. No production data operation is included.

The original source-review snapshot and preparation script remain historical
evidence of the earlier interpretation. References below to K's replacement
history describe that superseded checkpoint; they are not the current roster.

The organizer supplied `OsuChineseLeagueR Season6 MainSheet.xlsx` and the original
S6 key visual in the [#289](https://github.com/OCLR-dev/OCLR-website/issues/289)
preparation chat on 2026-10-25. This is **OCLR S6**, not β/S5. The issue URL is the
provenance entry point, not a claim that the workbook is downloadable there.

The original preparation commits organized surviving evidence only. At that
checkpoint there had been no production import, publication, deployment,
database change or edition creation. The issue
remains open. The initial workbook did not preserve knockout results or final
placements. The organizer subsequently supplied corrected 2021 MP links:
[match and bracket reconstruction](s6-match-reconstruction.md) now records the
surviving games, candidate scores, preliminary tables and unresolved bracket
questions separately. The original workbook-only `results: []` is preserved;
it is no longer a claim that no supplementary match evidence exists.

## Production approval completed — 2026-10-25

After the organizer deployed `0f924afd6afd2355561fb0082f9dc5410c17873e`,
computer use verified that exact release in the browser and used the native
Admin approval control plus its confirmation to approve all 33 saved matches.
Reload/readback confirmed **revision 9**, published status, 33 approved results
and zero pending matches. D–I is 3:5; C–F is 2:6. All 348 raw games and the
four-section configured rules compare equal to the saved import snapshots
(after normalizing JSON object-key ordering).

The public schedule displays 33 recorded rows with MP room-open timestamps.
The public overview shows four rule chapters and 33 results. Source inspection
and the appendix are absent from both public pages and the private tournament
preview; the appendix remains available on the Admin archive page. Missing
G–J evidence and final placements remain unresolved. No reimport, unpublication,
direct production API/DB write or deployment was performed by the agent.

## Approval of all 33 reconstructed matches — 2026-10-25

The organizer reported the public schedule was empty, then explicitly instructed
“核准這33場對局”. The 33 source records had been saved with pending reviews,
which excluded them from public recorded schedules and match pages. This latest
approval supersedes the proposal to display pending scores publicly.

The approval control reviews the saved list of 33 existing working scores,
including D–I 3:5 and C–F 2:6. The versioned, edition-scoped Admin command records
an approval date/source and authoritative score without replacing the archive.
All 348 source games, raw totals, missing HD2 scores/timestamps and replay
evidence remain unchanged. No missing G–J match or final placements are created.
Earlier pending/confirmed packages remain reproducible source snapshots.

The compatibility correction requires matching recorded scores and approval
evidence for approved source reviews. Pending reviews still cannot claim
results or winners. Approved records flow through the ordinary schedule,
results, winner and historical appearance-path rendering. MP room-open times
are labeled separately from original planned times and supply actual chronology;
appearance lines do not establish undocumented qualification rules. Per the
organizer's further instruction, inspection records are a management-only
appendix on the Admin archive screen. They are absent from public pages, public
read resources and the tournament preview. Original source facts, raw reviews,
qualifier scores and comparison tables remain saved in the private configuration.
Public roster names and undated replacement information remain, with inspection
headings/provenance strings omitted. Public match DTOs expose recorded totals and
a separately labeled MP room-open timestamp, without the private review payload. Four Swiss rounds appear in the group-stage
view without inventing group standings. The legacy results filter begins on
recorded entries only.

**Pre-deployment checkpoint (superseded by the completion above):** deploy the compatible version first,
then use the saved archive's **Approve reviewed matches** control and confirmation.
This is an Admin approval of already reviewed source records, not direct import
publication. The existing published edition stays public throughout; no unpublish,
reimport, migration or editing of saved rules/summary is needed. No direct
production API/DB write or operator deployment is performed by this session.

Verification: check, full isolated-database tests (1,033 passed, one existing
skipped), production build, i18n and production dependency audit (zero
vulnerabilities) passed. Eight focused historical archive browser cases passed across desktop/mobile.
They operate the actual Admin approval control, check all 33 recorded rows,
D–I/C–F scores, unchanged rules and 348 games, anonymous access, six responsive
widths, management-only appendix access, and absence of inspection content from
tournament previews and public pages. After safely incorporating main’s #297
update, the final build and 21 affected draft/i18n tests also passed. Full browser/remote suites remain for commit-specific CI.
The isolated test database is stopped after verification.

Synthetic local evidence, pending deployment and production approval:
[desktop schedule](verification/issue-289/s6-approved-schedule-desktop.png) and
[mobile schedule](verification/issue-289/s6-approved-schedule-mobile.png).

## Original rule hierarchy correction — 2026-10-25

The organizer rejected the flattened 14-section import. The corrected
[rule import](imports/s6-configured-rules.json) preserves the original four
chapters: `重点规则`, `比赛流程`, `BP流程`, `时限`. Original sublabels, bullet
markers and numbered clauses remain inside their chapters. The evidence-backed
annotation distinguishing the struck-out group proposal from four Swiss rounds
is retained.

The organizer explicitly approved saving the new version
`OCLR S6 规则表（原文分段）`. Computer use saved it through the ordinary rules
editor. Reload and readback verified **revision 8**, all four chapter headings
and exact rule equality, with publication and the imported archive unchanged.
Old version records are retained by the ordinary configuration flow. The native
rules display and directory artwork still require the pending application
correction to be deployed; this content update itself needs no second import.
The checkpoint below records the earlier 14-section import, now superseded.

After the original hierarchy correction, the three targeted S6 tests and both
desktop/mobile directory-and-rules browser cases passed again; the latter check
all four complete chapter bodies and six responsive widths. The isolated test
database was stopped after verification. The linked 320px rules image below
now shows this corrected four-chapter layout.

## Consistent directory copy, artwork and sectioned rules — 2026-10-25

The organizer requested the same summary format as S7 and supplied the complete
S6 rule text. Computer use saved the summary as
`osu! Chinese League Rookie — Season 6. 2021 年歷史賽事歸檔。` and imported
[the supplied rules](imports/s6-configured-rules.json) into the native rules
editor as **14 sections**, version `OCLR S6 规则表`. Production readback verified
revision **7**, `published: true`, exact section equality and an unchanged saved
archive. The obsolete two-group proposal is visibly annotated as superseded;
four Swiss rounds remain the active format. The COST/Z draft wording, BO9/11/13,
two bans with distinct mods, warmup, rescheduling and all nine time-limit clauses
are retained.

The application correction makes directory cards inherit the source-keyed
archive artwork when no explicit logo is configured, in both the shared saved
read summary and direct edition rendering. Explicit logos keep priority; this
does not mutate edition configuration or publication. S6's original 1920×1080
image is also selectable as logo/key visual and uses the existing landscape
treatment. No bitmap, CSS palette or card layout was replaced.

For the exact S6 issue/rulebook source pair, historical pages and their shared
read overview now use the edition's saved sectioned rules with the existing
`RulesHandbook`, including anchors and preserved line breaks. Other seasons
continue to use their own curated source supplements. These display corrections
require deployment of the new application commit; the corrected four chapters
are already saved, so no second import or database migration is needed after
deployment.

Local verification for this correction: npm ci, lint/typecheck, 1,031 unit and
integration checks (one existing skipped), production build, i18n checks and
production dependency audit (zero vulnerabilities) passed. After the saved-list
projection adjustment, the 18 affected API/DX/S6 checks passed again. Existing
archive presentation passed on desktop/mobile; both new S6 directory/rules cases
passed after fixing duplicate fixture-name selection and the select-label query.
The final two cases also verify the image actually loads at 1920px natural width.
Full browser/remote coverage is left to commit-specific CI, not claimed as a
completed full local run. The test database is separate from production/demo.

Synthetic local evidence, not screenshots of deployed fixes:
[desktop directory card](verification/issue-289/s6-directory-desktop.png),
[mobile directory card](verification/issue-289/s6-directory-mobile.png),
[320px sectioned rules](verification/issue-289/s6-sectioned-rules-mobile-320.png).

## S6 published after private verification — 2026-10-25

The organizer subsequently instructed “完成後公開S6”. After the complete private
readback below, the source notes and summary were updated for publication; the
organizer's later instruction includes the imported competition evidence from
the previously hidden qualifier sheets. No private application fields were added.
The updated archive was saved through the UI again, then the separate publication
confirmation was completed through the UI.

Final browser readback verified **revision 5**, `published: true`, status
`completed`, `registration: null`, timezone `Asia/Shanghai` (UTC+8), and semantic
equality of every archive field with `s6-confirmed-archive.json`. All 33 matches /
348 game records, 85 historical identities, five pools / 71 maps remain saved.
The public page now renders the S6 image, source confirmations, roster/pool counts
and rule facts: <https://oclr.org/tournaments/s6>.

The current application keeps pending-review matches out of public recorded
results. The public recorded-result count therefore remains **0**; the 33 stored
matches are review evidence, not approved live results. D–I 3:5 / entertainment
TB and C–F 2:6 / HD2 F win are explicitly organizer-confirmed source facts. Other
replay rulings, the G–J source gap and final placements are still unresolved.
Publication does not convert those remaining uncertainties into accepted results
or close #289.

## Production private draft saved — 2026-10-25

The organizer confirmed deployment; computer-use inspection of `/api/health`
verified release `b3c293d3b444241bf500ea44ec0cb8e708970b3b`. The organizer then
explicitly confirmed that D–I's last TB is entertainment and C–F's HD2 is an F
win. Those two facts supersede their earlier provisional interpretations.

The current [confirmed import package](imports/s6-confirmed-archive.json),
generated by [prepare-s6-confirmed-import.py](../scripts/prepare-s6-confirmed-import.py),
preserves the earlier package and raw snapshots as evidence. D–I stays 3:5,
excluding the last TB; C–F becomes 2:6 by the organizer-confirmed HD2 point. The
raw MP totals remain 3:6 and 2:5 respectively. No individual score, missing end
time or extra game is fabricated. The old per-game review codes are a preserved
snapshot; the explicit organizer confirmation is the current ruling. The
archive's overall pending-review marker still protects other unresolved matters
and does not retract these two confirmations.

The administrator UI created `s6` / **OCLR Season 6**, season `6`, status
`completed`, timezone `Asia/Shanghai` (UTC+8), no registration and **unpublished**.
The complete confirmed package was uploaded, validated and saved privately
through its confirmation dialog. No direct production API/DB write was used.

Computer-use readback of the rendered, authenticated saved-resource page verified
semantic equality of the entire archive with the uploaded file, edition revision
**2**, `published: false`, `registration: null`, 12 teams, 85 historical people,
five pools / 71 maps and 33 matches / 348 game records. The original S6 image
loaded from `/archive/s6/key-visual.jpg` at 1920×1080. Both match previews displayed
the new organizer confirmations. The ordinary public `/tournaments/s6` page
displayed 404. Production screenshots and the readback copy are kept locally,
not committed as public production-state fixtures.

Private preview: <https://oclr.org/admin/tournaments/s6/archive/preview>.
The qualifier data, remaining replay rulings, G–J source gap and final placements
are still subject to their existing review limits. This saves a private archive;
it does not publish or close #289.

Use `s6-confirmed-archive.json` for a future authorized replacement, not the
earlier `s6-archive.json` candidate snapshot. The edition is now published;
the normal UI requires an unpublished edition for replacement. No further
application deployment is needed for this data-only update.

## Private-import compatibility checkpoint

The organizer authorized a **complete private draft import through computer use**,
with D–I and C–F remaining pending. The deployment subsequently confirmed by the
organizer and read through the production browser's `/api/health` is
`0bf4727039eec2d58d45224d8aab7c38973f43a2`. That release still uses the old archive
format and cannot represent the complete S6 evidence. The browser check found no
S6 edition. No incomplete draft, production data write or publication was made.

This compatibility change supplies a separate uploadable
[S6 package](imports/s6-archive.json), **archive format version 2**, generated by
[prepare-s6-archive.py](../scripts/prepare-s6-archive.py). The source-review and
reconstruction files below remain `importReady: false`; do not upload those files.
Existing S7–S10 version 1 packages keep their original validation and behavior.
Version 1 cannot use version 2 source extensions or null map titles.

- 12 teams; 70 numeric-UID roster identities, 13 unresolved identities and two
  identities in one undated replacement slot: 85 historical people in total.
  Unknown identities have source keys, no fabricated UID/profile URL/account.
  VICE remains a literal source role with no inferred Tier. Replacement people
  are source history, not two current members. I/J retain their source letters
  with an explicit unknown-name source note.
- Five pools / 71 entries. ES/FS titles remain null; the interface displays its
  existing localized “Not recorded” label without storing a fabricated title.
- Both qualifier score tables preserve 133 raw scores and Azureus's empty score
  record. No qualifier rank is invented. Hidden-source evidence is authorized
  for private review only; this task does not authorize publication.
- 33 matches / all 348 game-review records, including raw totals, aborts, replay
  alternatives and the provisional entertainment TB. The original player-score
  snapshot remains separately linked and hash-tracked, rather than duplicating
  it beyond the importer size limit.
- Every reconstructed match uses `score: null` and an explicit pending `review`.
  Candidate scores can be displayed with “Unconfirmed records”, but never supply
  an approved winner, recorded-result count, official standings or bracket edge.
  D–I keeps working 3:5 / raw 3:6. C–F keeps working 2:5 / possible 2:6. Source
  game 437459269 stays aborted/without an end time; no extra F point is created.
- Original six scheduled times and actual MP lobby starts occupy separate fields.
  Candidate Swiss tables, rule facts and conditional bracket/placement notes are
  separate source evidence; official standings stay empty and no G–J fixture is
  invented. Staff signatures never grant permissions.
- The original S6 visual is selected by the exact #289 source URL, separately
  from editable edition branding. Explicit configured branding still wins.

No DB migration is needed: the existing edition JSONB save/revision/audit and
private-preview flow is reused. Deploy the reviewed compatibility commit (both
backend and any separately hosted remote frontend must understand archive
format 2) before uploading this package. Production deployment remains an
operator action. After verifying that exact release, use the administrator UI to
create/configure `s6` as **unpublished, completed, without registration**, upload
only `s6-archive.json`, validate counts and pending notes, save, and re-read the
saved private preview. Do not publish or replace an unrelated existing edition.

Reproduce the package without reading the original private workbook:

```sh
python3 scripts/prepare-s6-archive.py
```

The JSON file is below the existing 450,000-byte file limit and 524,288-byte
request limit. The application still strictly rejects unrecognized object fields.

Compatibility verification on 2026-10-25: Node.js 24.19.0, `npm ci`, `npm run
check`, `npm test` (145 files; 1,026 passed, one existing skipped), `npm run build`,
i18n extraction/checks and production dependency audit (zero vulnerabilities)
passed. Tests used the separately provisioned loopback-only `oclr_s6_test`
database; no demo/production database or credentials were used. The first full
test run detected stale generated read DTOs; after regeneration the affected
checks and final full run passed. Source validation includes exact regeneration,
all 348 game records, missing qualifiers, null titles, version 1 compatibility,
strict private-field rejection and pending scores that never become winners.

The full 616-case local browser run was started and intentionally interrupted
so the existing CI shards can execute the full suite. Local focused desktop/
mobile archive checks include uploading and round-tripping the complete S6 file,
not just a smaller synthetic example. Sixteen cases in the focused 18-case run
passed; the two new synthetic cases initially misread a followed login redirect.
After correcting that assertion and making the new test edition slugs unique
across reruns, all four affected real-package/synthetic desktop/mobile cases
passed. No application change was needed for those test corrections. Exact commit
and commit-specific CI status are recorded on #289; no pending check is a pass.

Local preview evidence (not a production import):
[desktop 1440px](verification/issue-289/s6-private-review-desktop-1440.png),
[mobile 320px](verification/issue-289/s6-private-review-mobile-320.png).

The organizer then supplied [OCLR Mappool Collections](https://docs.google.com/spreadsheets/d/14o3t0nEwp5YnRZHbjgX8OBr9tj7yeajzV5FlVIZM0Vg/edit)
and selected **S6GS, S6ES and S6FS** only. The organizer reiterated that match
results are lost. Other seasons in that collection are outside this task.

## Files and reproducibility

- [Structured source review](imports/s6-source-records.json): `importReady: false`.
  This deliberately differs from the historical archive schema and **must not
  be uploaded to the archive importer**.
- [Preparation script](../scripts/prepare-s6-source.py): Python standard library
  only, no network requests, database writes or formula execution.
- [Supplementary pool snapshot](imports/s6-pool-source-snapshot.json): bounded
  native Sheets reads of B4:J70, plus empty Map ID tails J71:J1000 for each S6
  tab. Sheet IDs: GS **405667568**, ES **1310799675**, FS **1503362078**.
- [Original S6 key visual](../public/archive/s6/key-visual.jpg): unchanged JPEG,
  1920 × 1080. It has been collected as an asset; edition branding choices and
  automatic archive artwork mappings are not changed in this phase.

Workbook SHA-256:
`63a4926e5077d4ae46721de60349025ef44c8be70c3c88fe9c5b38f1af312a75`.
Artwork SHA-256:
`3f40ae9a494ef7b349229e45c016c0e8fb82719b125bd4c407cd121099e720b7`.

The workbook contains personal application material and is **not committed**.
The script reads an explicit competition-cell allowlist and only C:D identity
pairs from 测试表. It exports only identities referenced by the surviving roster
or staff signatures. Application fields, contact information, biographies,
discussions, comments, obsolete rosters, cost evaluations, unrelated lookup
identities, suggester and showcase signatures are excluded. Embedded images,
hyperlinks and instructions in the workbook are not executed or followed.

```sh
python3 scripts/prepare-s6-source.py /path/to/source.xlsx \
  docs/imports/s6-source-records.json --captured-on 2026-10-25 \
  --pool-snapshot docs/imports/s6-pool-source-snapshot.json
```

## Surviving coverage

| Source                          | Preserved evidence                                                                                                                     | Limits                                                                                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 队伍表 A3:J47, every fourth row | 12 teams in A–L source order, 84 roster slots: 12 Captain, 12 VICE, 12 coach, 48 Tier 1–4 slots                                        | Only B/E/K have authored team names. Other names stay null. Full-width Ｋ stays in `sourceLabel`, while the reference key is `team-k`. Cost/Points do not establish results or ranking.                    |
| 测试表 C1:D74                   | 70 roster slots resolve to UIDs, including the two organizer-confirmed aliases; K Tier 4 replacement history supplies two further UIDs | 72 evidenced people, 13 people without a confirmed UID. The replacement occupies one source slot, so 14 slots have a null direct UID. No fuzzy matching or cross-season name matching is performed.        |
| 对阵表 A2:L7                    | Six first-round schedules on 2021-05-08/09, 18:00/19:30/21:00, organizer-confirmed UTC+8                                               | All six lack scores, MP IDs, VODs and match staff. They are scheduled evidence, not completed results. No group membership, W/L totals or bracket progression is inferred from six pairings.               |
| 对阵表 A8:A35                   | 28 template labels retained separately for review                                                                                      | No participants or results. They are not fixtures or knockout evidence.                                                                                                                                    |
| 小组赛图池 B2:L24               | 19 maps: NM1–6, HD1–4, HR1–4, DT1–4, TB                                                                                                | Title, mapper, BID, source SR/BPM and parsed drain seconds retained. TB becomes canonical TB1 with `sourceSlot: "TB"`. CS/AR/OD are unknown.                                                               |
| 队长资格赛赛图 B2:L34 (hidden)  | Seven actual maps: NM1–3, HD1, HR1, DT1–2                                                                                              | Blank and `#N/A` templates excluded. Column C contains stale/template IDs; actual BIDs come from J. This is review evidence, not an instruction to publish a hidden sheet.                                 |
| 教练赛赛图 A2:G8 (hidden)       | Seven actual maps: NM1–3, HD, HR, DT1–2                                                                                                | HD/HR get canonical HD1/HR1 while literal source slots remain recorded. Source SR/BPM retained without applying DT again. Drain/CS/AR/OD are unknown.                                                      |
| 教练资格赛 A2:N16 (hidden)      | 15 score rows, 105 raw per-map scores                                                                                                  | Cached RANK/SUM values of zero are discarded. No qualifier placement or tournament final placement is calculated.                                                                                          |
| 队长资格赛 A2:N6 (hidden)       | Five names, four with scores (28 per-map values); Azureus has no scores                                                                | Missing scores remain an empty object, not zero scores or a forfeiture.                                                                                                                                    |
| Cover G7:K11                    | Five signatures: Hosts Explosive/Prophet, Referee Sonoaoi, Streamer Sonoaoi, LOGO Inspired Selis                                       | Sonoaoi/Selis have workbook UIDs. Explosive/Prophet stay name-only in this source-only phase. Blank Mappool/Commentary columns do not establish contributors. No current roles or permissions are granted. |
| Cover B21:E22                   | Registration/coach-Captain event: May 3; draft: May 5; first group round: May 8, all 2021                                              | Calendar milestones only. No pick sequence or rulebook was supplied.                                                                                                                                       |

The workbook supplies three pools with **33 maps**. The supplementary S6GS
slot/ID pairs exactly corroborate its 19 group-stage maps and do not create a
duplicate pool. S6ES and S6FS add 19 maps each, giving **five distinct pools and
71 map entries**, including the two qualifier pools. All three stage pools have
NM1–6, HD1–4, HR1–4, DT1–4 and TB. ES begins with BID **2277760** and ends with
TB **2968871**; FS begins with BID **2733463** and ends with TB **2510638**.

The supplementary Google Sheet uses live IMPORTHTML/IMPORTDATA formulas. At
capture, title/statistic cells were loading or unavailable; some difficulty
names were readable formula results. The snapshot preserves those observations
and error types separately. ES/FS historical title, mapper, SR/BPM/drain and
CS/AR/OD remain null in the review dataset. No current metadata is substituted
for historical values. The GS workbook statistics remain unchanged. A mismatch
between the two GS slot/ID sources makes regeneration fail instead of overwriting.
The collection's Google timezone setting does not override the organizer's
explicit UTC+8 schedule confirmation.

The original artwork is collected independently; it does not supply rules,
results or missing identities.

The later MP reconstruction supplies ten evidenced team names (I/J remain
unknown), 33 match histories and separate strict-GS/four-batch standings. The
organizer also recovered the [S6 rules](https://docs.qq.com/doc/DUHFuRFBER1NKS3Bw):
four Swiss rounds, BO9, 12 into 8 with four teams starting upper and four starting
lower, BO11 playoffs and BO13 lower/grand finals. The obsolete two-group proposal
is visibly struck through and must not be applied. Extra restricts lineups, not
score multipliers; individual Fail scores count and Team Fail loses.

The organizer requested two provisional interpretations, both pending historical
confirmation: D–I uses 3:5 with the final five-versus-five TB treated as post-match
entertainment (raw room total 3:6 preserved); C–F keeps played 2:5 with a possible
unrecorded HD2 win for F and possible actual 2:6, without fabricating a point.
The four-batch candidate standings now exclude D–I's entertainment TB; D/I remain
1–3, with map totals D 12–15 and I 15–18. The strict GS-pool table is unchanged.

These interpretations, four completed replay rulings and the structurally
inferred but unsourced G–J upper final remain review items. The rule-grounded
bracket has one structural source gap: the G–J upper
final. This does not approve a full
bracket or official placements. See the reconstruction for rule facts, source
links and exact game IDs; no withdrawn 2020 source is used.

## Organizer confirmations (2026-10-25)

The organizer explicitly confirmed the following in this chat after reviewing
the source questions. These are recorded separately in the JSON and script:

1. 队伍表 I27 `Inverse Lu Yang` is 测试表 C40:D40 `lnverse Lu Yang`, UID **3753204**.
2. 队伍表 G19 `Re_CYCLE` is 测试表 C74:D74 `re_cyclc`, UID **9043058**.
3. 队伍表 J43 `Name-Less-` / `PhantoMPainN` is a replacement history, not two
   simultaneous members. The lookup supplies **8425774** and **14947596**
   respectively (`PhantoMPaiN` in C65:D65). Preserve the roster spelling and both
   identities in `replacementHistory`. No replacement date, match eligibility,
   or present membership is inferred.
4. Schedule timestamps use **UTC+8**, represented as `Etc/GMT-8` and `+08:00`.

Numeric `970.0` is displayed as the username `970`; it is never UID 970. VICE is
retained as a source role with no inferred Tier. Final Tier columns are not a
chronological draft log.

## Remaining gaps and import handoff

| Source                 | Unconfirmed identity                             |
| ---------------------- | ------------------------------------------------ |
| 队伍表 D47             | Captain Fushimi Rio                              |
| 队伍表 F3/F7/F11/F15   | Coaches Neina, Kishin Sagume, Michka, 970        |
| 队伍表 F19/F23/F27/F31 | Coaches wdwdwww, [Crz]Makii, Kazumi Pager, Old K |
| 队伍表 F35/F39/F43/F47 | Coaches CUWAN, Miracle, Kotor1, Crystal          |

These are missing **from the exact-name identity evidence used in this phase**,
not claims that the people have no account. A similarly named public account is
insufficient: for example, the search result `- Fushimi Rio -` must not be silently
substituted for Captain `Fushimi Rio`. Public lookup attempts did not establish
the missing Captain identity, and no such candidate UID is included.

The original handoff requirements were:

1. Obtain a reliable Captain UID for L and reviewed evidence for other missing
   identities, or explicitly design support for unknown historical identities.
2. Decide how to preserve VICE and dated/undated roster replacements. The current
   importer requires one numeric-UID Captain per team and has no VICE or
   replacement-history representation. Do not flatten the replacement pair into
   two simultaneous players or omit the whole L team merely to pass validation.
3. Decide publication scope for the hidden qualifier evidence. Preserve raw
   scores separately from head-to-head match results and unknown final rankings.
4. Produce a separately validated archive package using the existing services
   and review flow, with no speculative results, standings, picks or rules.
   The current schema also requires map titles, so ES/FS metadata needs reliable
   evidence or compatible unknown-title support before import.
5. After compatible code is deployed and the organizer authorizes the action,
   inspect any existing `s6` edition, save a private draft through the existing
   administrator UI, review it, then publish separately if authorized. Do not
   overwrite unrelated data or write directly to production DB/API.

## Verification

The source-preparation commits changed source material, its preparation script, source checks and an
unchanged artwork asset. Application services, UI, contracts and database schema
were unchanged in those commits. The compatibility checkpoint above separately
changes validation and presentation, not database storage or publication checks.
Checks and actual CI state are recorded on #289; source review
does not establish importer compatibility, production acceptance or deployment.

Verified locally on 2026-10-25 with Node.js 24.19.0: `npm ci --include=dev`,
`npm run check`, 39 tests across the S6 source and existing historical archive
unit checks, three Python extraction/privacy/conflict tests, semantic regeneration
equality, local documentation links, unchanged JPEG hash/dimensions and
`git diff --check`. Full application build, DB/integration/browser suites and
dependency audit were not rerun for this source-preparation phase. No interface
messages changed. Commit-specific CI status is tracked separately on #289.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/scripts -p 'test_prepare_s6_source.py'
npx vitest run tests/unit/{s6-source,s7-archive,s8-archive,s10-archive,historical-archive,archive-key-visual}.test.ts
git diff --check
```
