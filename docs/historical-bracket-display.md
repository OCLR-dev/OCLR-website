# Historical competition presentation (#241)

The historical schedule and bracket page now share the same archive competition view: Group Stage and Knockout are the top-level choices. Group A/B/C/D remain secondary choices under Group Stage, beside the historical standings. Knockout displays the existing archive bracket's complete chronological columns and recorded team-path connectors instead of an isolated SF/Finals/GF card list. The match summary, round filter and detail links remain available.

By default the archive generator connects previous recorded appearances. It
excludes scoreless alternatives and withholds edges with ambiguous or missing
dates. The public bracket omits the recorded-appearance disclosure (#512).

S10's [original workbook and rulebook](s10-archive.md) support a verified
knockout path (#997). The first two teams in each group start in the winners
bracket. The third and fourth teams start in the losers bracket. The graph
checks all eight seeds and both inputs to each of the six subsequent matches
against the saved teams and outcomes. The winner of 27 goes directly to 30.
Its loser meets the winner of 28 in 29, and the winner of 29 advances to 30.
Match 30 decides the championship without a reset. If the saved records do
not match the verified path, the schedule displays the recorded appearances.
The match summary and match details retain the original stage and pool labels.

S1's exact source workbook identifies `小组赛 A组` and `小组赛 B组`
independently of its overall final standings, including in private previews and
public projections without source appendices. Its 30 group matches remain grid
cards and its ten knockout matches remain in the recorded-appearance view.
When S1's saved standings explicitly use `最終排名（全賽事戰績）`, the table
uses the existing translated **Final standings** heading and remains visible
beneath either phase, without a redundant Group column. Genuine group standings and other editions retain their
existing presentation. These are read-only presentation choices: no source
stage, approved score, rank, private appendix or publication setting is changed.

S4's exact source workbook records `小组赛第1轮` through `小组赛第4轮`
without reliable group standings. These four source rounds are secondary choices
under Group Stage, each containing six recorded matches; the ten knockout matches
remain under Knockout. No groups, rankings or qualification links are inferred.
The A22 forfeit and five approved 5:5 draws keep their recorded results. This
presentation fix requires no reimport or change to saved tournament data (#408).
