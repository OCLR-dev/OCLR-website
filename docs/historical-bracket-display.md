# Historical competition presentation (#241)

The historical schedule and bracket page now share the same archive competition view: Group Stage and Knockout are the top-level choices. Group A/B/C/D remain secondary choices under Group Stage, beside the historical standings. Knockout shows the archive's match columns and the reviewed winner and loser connections when available. The match summary, round filter and detail links remain available.

Migration `0091_historical_bracket_progression.sql` stores the reviewed
S1–S10 knockout paths (#999). `historical_brackets` identifies each archive
source and the expected counts. `historical_bracket_matches` records 104
played matches, their bracket positions, the two source team IDs and the
confirmed winner slot. `historical_bracket_advancements` stores 124 winner
or loser outcomes, each linked to a slot in a later match in the same edition.
S8 has 14 matches and 16 links. Each other season has 10 matches and 12 links.
The migration can run before archive import. It inserts only the reviewed
graph and keeps the archive as the source of scores and team names.

The schedule, bracket and public read API use the reviewed graph when the
source, played knockout matches, teams and winners agree with the saved
archive. The schedule falls back to recorded appearances when the graph is
missing or disagrees with the archive. It leaves out scoreless alternatives
and withholds appearance links with ambiguous or missing dates.

For S1, the official saved losers final has Aimseky 1–6 日卡古鸭. The winner
advances to the grand final. S10 match 27 sends its winner to 30 and its loser
to 29. The winner of 29 meets the winner of 27 in match 30, which decides the
championship. The match summary and details use the saved stage and pool labels.

S1's exact source workbook identifies `小组赛 A组` and `小组赛 B组`
independently of its overall final standings, including in private previews and
public projections without source appendices. Its 30 group matches remain grid
cards alongside the knockout bracket.
When S1's saved standings explicitly use `最終排名（全賽事戰績）`, the table
uses the existing translated **Final standings** heading and remains visible
beneath either phase, without a redundant Group column. Genuine group standings and other editions retain their
existing presentation. These are read-only presentation choices: no source
stage, approved score, rank, private appendix or publication setting is changed.

S4's exact source workbook records `小组赛第1轮` through `小组赛第4轮`
without reliable group standings. These four source rounds are secondary choices
under Group Stage, each containing six recorded matches; the ten knockout matches
remain under Knockout. The group view does not infer group assignments or rankings.
The A22 forfeit and five approved 5:5 draws keep their recorded results. This
presentation fix requires no reimport or change to saved tournament data (#408).
