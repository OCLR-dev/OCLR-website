# #610 remaining historical-data review — 2026-11-01

This is a review proposal, not an import receipt or an official standings table.
The current production archives were downloaded read-only through the existing
Admin UI. No production changes have been made in this follow-up.

The organizer accepted this proposal on 2026-11-01, confirmed S6 has no reset,
and chose UTC+8 actual competition dates with missing dates left unknown.
[Recorded acceptance](https://github.com/OCLR-dev/OCLR-website/issues/610#issuecomment-6555006692).
Native application and public readback await deployment of the compatible build.

## Current saved evidence

| Season | Saved revision | Teams |                         Series | Published statistics coverage | Remaining date gaps                                                    |
| ------ | -------------: | ----: | -----------------------------: | ----------------------------: | ---------------------------------------------------------------------- |
| S1     |             36 |    12 |                             40 |                         19/40 | A14, A15, B6 lack a scheduled instant                                  |
| S2     |             12 |    10 |                             30 |                         18/29 | 11 lack a scheduled instant; final A10 has no date or MP               |
| S3     |              9 |    10 |                             30 |                         13/30 | B9 and A10 have MP dates, no original scheduled time                   |
| S4     |             14 |    12 |                             34 |                         17/33 | No scheduled-date gaps; A19 MP unavailable, A22 forfeit has no MP      |
| S5     |             30 |    12 |                             34 |                         34/34 | Completed separately; preserve approved records                        |
| S6     |             42 |    12 |                             34 |                          0/34 | 28 lack a scheduled instant; MP dates exist; terminality now confirmed |
| S7     |             11 |     8 |                             22 |                         21/21 | No scheduled-date gaps; one forfeit has no MP                          |
| S8     |              5 |    16 |                             38 |                         38/38 | No scheduled-date gaps                                                 |
| S9     |              5 |     8 | 22 scored + 6 conditional rows |                         22/22 | No scheduled-date gaps                                                 |
| S10    |              6 |    10 | 30 scored + 6 conditional rows |                         30/30 | No scheduled-date gaps                                                 |

S1–S3 and S6 are populated, published archives, not placeholders. Saved notes
from their earlier private-import stages are historical provenance, not current
publication claims. S6 now includes the separately approved J–G upper final
4:7, MP 85501582; the older 33-match preparation file is superseded.

Original rulebooks and source-sheet timezone metadata support UTC+8. S8–S10
Schedule explicitly says `Time(UTC +8)`. S1–S4 workbook metadata is
`Asia/Shanghai`; S7–S10 is `Asia/Hong_Kong`. Workbook timezone alone does not
create a missing scheduled instant. MP opening/playing dates remain distinct
from scheduled times. `capturedOn` remains the import date.

## Proposed final placement bands

Use the existing scored knockout paths. Preserve original scores, team IDs,
players, approval history, pools and statistics. These are reconstructed
placements (`official: false`). A multi-team band means the records do not
separate those places; it does not award an additional podium place or invent
a tie-break. S1–S3/S5 keep their already approved placement decisions and gain
explicit structured metadata only.

| Season | Place/band | Teams (literal saved names)                                     |
| ------ | ---------- | --------------------------------------------------------------- |
| S4     | 1          | New Year Burst！                                                |
| S4     | 2          | GXY 970 Ti                                                      |
| S4     | 3          | 白果子抱抱                                                      |
| S4     | 4          | 46miss                                                          |
| S4     | 5–6        | 122粉丝天团; 工作日不愉快                                       |
| S4     | 7–8        | 麻吉亚巴库内; [青蛙Hello]                                       |
| S4     | 9–12       | 爆炸奶油面包; Baby's Breath; 德州点金虾仁狂; 五三题霸：圆锥曲线 |
| S7     | 1          | Cute honey                                                      |
| S7     | 2          | 挑衅                                                            |
| S7     | 3          | 牢龙                                                            |
| S7     | 4          | C                                                               |
| S7     | 5–6        | ∀ W∀∃⊥; 卧龙                                                    |
| S7     | 7–8        | D; B                                                            |
| S8     | 1          | 好幸福队                                                        |
| S8     | 2          | 睡覺擺爛隊                                                      |
| S8     | 3          | 人堆1                                                           |
| S8     | 4          | 玩OSU不带HD                                                     |
| S8     | 5–6        | Baby Bus; RIP AR8HD                                             |
| S8     | 7–8        | 《狂日人记》; 弱气美少女水水                                    |
| S8     | 9–12       | 老人堆; 人堆2; 那个蓝色背景的hd; 茉莉司机                       |
| S8     | 13–16      | 白果子哥哥队; 14utc plz; 白果子妹妹队; 白圣女与黑猫猫           |
| S9     | 1          | 對手太強怎麼贏                                                  |
| S9     | 2          | 土地瓜队                                                        |
| S9     | 3          | 你怎么知道我一发十连出了水梓                                    |
| S9     | 4          | Baby birth                                                      |
| S9     | 5–6        | 你们这里谁最会EX; 猪翅堡店                                      |
| S9     | 7–8        | 彼瘾犯了; 不可选取                                              |
| S10    | 1          | 这儿不是rx赛？                                                  |
| S10    | 2          | put AR8HD in                                                    |
| S10    | 3          | 扣一復活苦來兮苦                                                |
| S10    | 4          | 初华未来                                                        |
| S10    | 5–6        | 已经结束了不是吗，别露出这样的表情; 感谢你的洗肾                |
| S10    | 7–8        | 三角初音; United States of Chinada                              |
| S10    | 9–10       | 什么什么; 什么？                                                |

S8 has four upper-bracket entrants and eight lower-bracket entrants, plus four
group-stage eliminations. Its 8 SemiFinals / 4 Finals / 2 GF labels describe pool
weeks: the 14 matches cover 3 upper, 10 lower and 1 deciding final. The first
GF-week match is the lower final, not a second championship final. Group order
by wins then map difference was already accepted under [#171](https://github.com/OCLR-dev/OCLR-website/issues/171#issuecomment-6375080064).
The original stored standings have stale cached totals; use the validated
24-match calculation, not those caches. Retain group scope explicitly.

S9 and S10 send each group's top two to the upper bracket and next two to the
lower bracket. S10 eliminates the fifth team in each group, as explicitly stated
in its GroupScore sheet. Each has ten actual knockout series.

S6's final terminality is now separately confirmed: G 5:7 B on 2021-06-27
(MP 86362224) ended the tournament without reset. Its reconstructed bands are:

| Place/band | Teams                                            |
| ---------- | ------------------------------------------------ |
| 1          | 队长是隐形播放器                                 |
| 2          | 超级敏感                                         |
| 3          | 挑食                                             |
| 4          | aoi被圣遗物气晕                                  |
| 5–6        | 爆炸奶油面包V2; 猫娘别演了                       |
| 7–8        | 饮茶先啦; 你寄吧谁                               |
| 9–12       | 不练傻逼图; 延毕; 我只会心疼白果果; 只练二次元图 |

The original stage string remains source provenance; typed final metadata and
the dated organizer note carry the current decision, preserving the statistics
source identity.

## Conditional schedule rows and S10 statistics

Keep all original rows as source evidence. Annotate the six conditional rows
in each of S9/S10 as `not-played`, without a score, appearance or statistic.

| Season | Rows    | Meaning supported by the sheet and played path                |
| ------ | ------- | ------------------------------------------------------------- |
| S9     | 20a/c/d | Unused alternative lower-bracket pairings                     |
| S9     | 20b     | Same pairing/time as actual match 20; no second played series |
| S9     | 22a     | Unused alternative final pairing                              |
| S9     | 22b     | Same pairing/time as actual match 22; no second played series |
| S10    | 28a     | Same pairing/time as actual match 28; no second played series |
| S10    | 28b/c/d | Unused alternative lower-bracket pairings                     |
| S10    | 30a     | Candidate final on April 27; actual match 30 occurred May 10  |
| S10    | 30b     | Unused alternative final pairing                              |

All four S10 snapshots are already published and have no blockers. The current
legacy snapshots have no recorded reviewer/time/evidence; do not backdate or
invent those fields. A new normal Admin review can stamp its own current actor
and time while preserving all earlier raw facts and included/excluded choices.

| Match | Snapshot version | Existing excluded games | Proposed reason/evidence                                                                                    |
| ----- | ---------------: | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| 3     |                4 | 613454993               | Aborted: no end time or scores; retain all eight included games and existing non-participant exclusions     |
| 18    |                4 | 614394514               | Superseded replay: completed attempt of 4487658 followed by included 614394786; preserve existing selection |
| 26    |                5 | 615606378               | Aborted: no end time or scores; preserve existing technical adjudication and 13 included games              |
| 30    |                4 | 617063413; 617068065    | Aborted empty attempt; post-match game after the nine accepted scoring games                                |

Match 26 retains the approved series 7:6 and the raw retained-game totals
8:5. The reason for the existing technical ruling is not established by those
totals. Do not invent a Team Fail decision or individual technical scores.

## Accepted competition dates and retained unknowns

Use local-day boundaries with `precision: day`; they do not assert a midnight
start. Phase windows use the same precision. The range is based on dated saved
competition records, not registration or import dates. Undated fixtures remain
undated.

| Season | First known competition day | Concluding final day |
| ------ | --------------------------- | -------------------- |
| S1     | 2018-11-09                  | 2018-12-15           |
| S2     | 2019-06-14                  | Unknown              |
| S3     | 2019-11-23                  | 2019-12-29           |
| S4     | 2020-06-05                  | 2020-07-19           |
| S5     | 2020-11-21                  | 2021-01-17           |
| S6     | 2021-05-08                  | 2021-06-27           |
| S7     | 2021-12-25                  | 2022-03-05           |
| S8     | 2023-02-25                  | 2023-04-09           |
| S9     | 2023-11-04                  | 2023-12-10           |
| S10    | 2025-03-14                  | 2025-05-10           |

- S2 final A10: original ES Schedule B18:M18 has `21:30`, no date and no MP.
  The organizer also confirmed the date is unknown. Keep the season/final end
  null instead of using the July 20 lower final as the season end.
- S1 group A15: no scheduled date, room or game time. Keep unknown unless a
  primary source or organizer supplies the date.
- S3 final dates are established by MP 57309485 (December 28) and 57336748
  (December 29), UTC+8; original scheduled times remain unknown.
- S6 MP dates cover the 28 blank schedule instants, but do not establish an
  original scheduled minute. Final terminality is confirmed above.
- The organizer selected actual competition dates. S8–S10 Landing has planned dates that differ
  from played dates (S8 final April 9; S10 starts March 14, final May 10).
  The accepted ranges are not registration-to-conclusion windows.

The [MP date evidence](imports/remaining-mp-date-sources.json) has 42 allowlisted
rooms: 37 successful public-header reads and five current 404/401 failures.
Only verified opening instants may fill `roomOpenedAt`; no opening time becomes
a scheduled minute. Existing known instants are retained.

Other S1–S4 source limits: S3 has one unresolved VICE identity (`Isahi`), S2 has
27 unknown beatmap titles, S3 has five, and S4 A19's MP is currently unavailable.
These remain explicit; no account, map title or player score is guessed.

## Staff labels accepted by the organizer — 2026-11-01

| English                   | zh-Hans      | zh-Hant      |
| ------------------------- | ------------ | ------------ |
| Evidence URL              | 证据链接     | 證據連結     |
| Adjudication note         | 裁定说明     | 裁定說明     |
| Adjudication evidence URL | 裁定证据链接 | 裁定證據連結 |
| Exclusion reason          | 排除原因     | 排除原因     |
| Warmup                    | 热手         | 熱手         |
| Superseded replay         | 已由重打取代 | 已由重打取代 |
| Post-match game           | 赛后游戏     | 賽後遊戲     |
| Outside mappool           | 不在图池内   | 不在圖池內   |
| Other                     | 其他         | 其他         |

Existing labels for Aborted, Unknown, Derived placement and Final placement are
reused. The organizer accepted the listed Traditional and Simplified Chinese
labels explicitly in this session on 2026-11-01.

## Native milestone precision follow-up

The native milestone editor now exposes date precision and retains it in the
save payload together with unknown boundaries. Existing instants are preserved;
only its local row IDs are stripped. This is required for applying the three
prepared phase windows through the existing Admin UI and for later edits to
retain their calendar-date meaning.

Additional labels submitted for organizer review:

| English        | zh-Hans    | zh-Hant    |
| -------------- | ---------- | ---------- |
| Date precision | 日期精度   | 日期精度   |
| Date only      | 仅日期     | 僅日期     |
| Date and time  | 日期与时间 | 日期與時間 |

## Sources

- Current unauthenticated [public read API](https://oclr.org/api/v1/tournaments),
  per-season tournament/competition/statistics resources; actual Admin downloads
  stay local and are not committed.
- [S8 MainSheet](https://docs.google.com/spreadsheets/d/16ASDCD95p3TgfjgSHCjXmRN3KJuuAD4KS0fImpcTiiM/edit):
  Schedule, GroupScore, Landing; original rules in `imports/s8-rulebook.txt`.
- [S9 MainSheet](https://docs.google.com/spreadsheets/d/11PwNlEsUFb6f3VCY2-sdGlPysP0ukihN8_lE4DGuzfA/edit):
  Schedule, GroupScore, Landing; original rules in `imports/s9-rulebook.txt`.
- [S10 MainSheet](https://docs.google.com/spreadsheets/d/12BGS8WRnl10OdeUKyvmOypFzpTYCpHgx9QY1mw-0hlw/edit):
  Schedule D7:U45, GroupScore D1:K15, Landing; original rules in
  `imports/s10-rulebook.txt`; [official forum](https://osu.ppy.sh/community/forums/topics/2043339).
- [S2 MainSheet](https://docs.google.com/spreadsheets/d/1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY/edit):
  GS Schedule A1:N30; ES Schedule A1:P28.
- [S3 MainSheet](https://docs.google.com/spreadsheets/d/1o4asx7nZQTAWwNjK_TyB_aq2ZWD471BHAxcdLp-TPAo/edit):
  Elimination Schedule A1:Q20.
- [S6 J–G acceptance](https://github.com/OCLR-dev/OCLR-website/issues/289#issuecomment-6401514274).

Public Challonge pages returned HTTP 403 to the read tools. They have not been
treated as read or as independent official placement evidence.
