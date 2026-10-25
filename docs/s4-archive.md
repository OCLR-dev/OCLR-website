# S4 initial historical import (#287)

## Saved private draft — 2026-10-26 Asia/Taipei

The organizer authorized starting the S4 import with the supplied rules PDF and
key visual. The existing Admin UI created `s4` as **OCLR Season 4**, completed,
unpublished, season `4`, Asia/Shanghai (UTC+8), with no registration configuration.
No results were approved and no edition was published.

The saved archive was read back through the Admin source appendix and compared
field-for-field with `imports/s4-archive.json`. It contains:

- 12 teams and 84 roster positions: 84 resolved osu! IDs. Captain, VICE, coach and final Tier allocations remain
  distinct; no chronological draft order is invented.
- 34 fixtures: 24 group-stage rows and ten knockout rows, 33 MP links and 30
  source VOD links. Scores remain null pending review. Original scores and the
  single FF row are preserved in the administrator-only appendix.
- Five pools / 76 slots: coach 7, captain 7, group 19, knockout 20, final 23.
  Unknown song titles remain null; difficulty names are separately retained.
- 189 original qualifier per-map scores, qualifier source totals/ranks, four
  Damage tables and team COST/RANK fields retained as source evidence.
- Three named STAFF credits from the PDF; no account or permission grants.

The native rules version is `OCLR S4规则说明（原文分段）`, with four source sections:
`赛程规则`, `比赛规则`, `赛程安排`, `STAFF`. The nested source headings are retained
inside their sections. `imports/s4-rules.json` matches the PDF text after removing
layout whitespace. These four sections are also saved as archive rule facts for
the existing historical preview. Source-review records remain outside that preview.

## Sources

- [MainSheet](https://docs.google.com/spreadsheets/d/1QqF8leIqov2l3loi92hFHu82HEuplb9Iau2zPNUcySk):
  downloaded through the Google Drive connector as the original XLSX.
  SHA-256 `3fd98e5cfff9eda8d900033c4b8d35605e8bdbe07dd657a69a2f0724134607bd`.
- Organizer attachment `OCLR S4规则说明.pdf`, three pages, visually inspected.
  SHA-256 `55c2b46e831229ad4c28b9944c90494440e1c4b3ba52d2fe9115c42cf728cfe3`.
- Organizer attachment `S4.avif`, 1728×1080. Original bytes copied unchanged to
  `public/archive/s4/key-visual.avif`.
  SHA-256 `f141a68227ec17015b8b81957e06e010f993840cd7da58da798697ea722e3fc3`.

The original workbook and application fields are not committed. The `roster`
sheet is used only to resolve identities actually present in `Team`; case and
whitespace differences are normalized for matching, while authored names are
preserved. Other historical names are not silently merged.

## Identity cross-check — 2026-10-26

Five initially unresolved identities were resolved and saved through the Admin UI.
Original S4 names are preserved. Pigeons (7660383) and Refia Vridis (760389)
are listed in their official profile previous usernames. MP 62579255 identifies
Monoblos- as 12494307; MP 62621461 identifies NoirMei as 4561097 and includes
GreySTrip_VoV (714369), matching TaneshimaPopura through the S5 MainSheet
and the historical team link on that official profile. Evidence URLs are retained
in the administrator-only source appendix. Full UI readback matched the submitted
update; no results or publication state changed.

## Remaining review

- Five group games are 5:5: A5, A10, A11, A17, A20. The current approved-result
  schema rejects ties. Their source scores are preserved without inventing a
  winner; draw-aware approval/statistics need a separate compatibility change.
- A22 G–J is `FF` with the other score blank and no MP. Do not fabricate 0:6.
- MP review now covers 32 complete rooms, with red/blue sides and pool IDs saved
  as pending evidence. See [the per-match review](s4-mp-review.md). A19 returns
  404 and A22 has no MP; their pool IDs stay null. VOD titles remain unchecked.
- The Team RANK column disagrees with knockout outcomes and is not treated as
  final placing. The knockout table implies E/B/C/I as the first four,
  K/L tied fifth and D/H tied seventh, pending review. Official standings remain empty.
- Schedule timestamps use UTC+8 consistently with the organizer's earlier
  historical imports; the workbook itself does not explicitly label a timezone.
- Four source rows lack a usable VOD: A7 G–I (blank), A15 F–J (source says recording
  forgotten), A22 G–J (FF), A24 B–E (none).

## Artwork delivery

The existing artwork selectors and allowlist now support the original S4 AVIF
for both directory logo and key visual, preserving its 1728×1080 aspect ratio.
The source-sheet fallback also identifies S4 without depending on the editable
slug. Generated saved-read contracts include the new allowed path.

The production UI does not yet offer this asset. After review/merge and organizer
deployment, select **OCLR Season 4** in both artwork fields through the Admin UI,
save, and verify the directory and historical overview. This branch does not
deploy, merge itself, approve results or publish the edition. No migration is needed.

## Verification

Production checks: successful native UI draft saves, complete archive readback,
native rules reload, and private preview showing all four sections with no source
review appendix. Local schema validation and PDF text comparison passed.
Application verification and current CI evidence are recorded in #287; do not
infer a full test pass or deployment from this document.
