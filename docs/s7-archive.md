# S7 historical archive preparation (#175)

Organizer-provided [S7 MainSheet](https://docs.google.com/spreadsheets/d/1vZ7JN6ePxDqjdVZ1527fvyeoV1m5rbHzSvXObDUuf7I/edit?gid=1476192500), exported as XLSX on 2026-10-24. SHA-256: `51e1175e5e90837be7ef8b03de2575ca81f73dc4d7e1c1e58d905d237ee365a2`.

The source workbook includes application/contact material and is **not committed**. `scripts/prepare-s7-archive.py` reads only allowlisted competition cells, the C:D identity lookup referenced by roster avatar formulas, and staff signatures. It never executes formulas, calls a network service or writes a database. The application sheets, biographies, contact columns, comments, Damage evaluations and Chess are excluded.

## Verified coverage

| Source                               | Records and handling                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team List E3:U10                     | Eight teams in A–H source order. 56 playing members including eight Captains, plus eight assigned coaches. All 64 UIDs are evidenced in this workbook.                                                                                                                                                                           |
| 测试表 C1:D57                        | 56 complete roster name/UID mappings referenced by Team List's VLOOKUP formulas. The unmatched final name has no UID and does not become a guessed identity. Case-insensitive lookup follows the original VLOOKUP behavior; display names stay literal.                                                                          |
| Team List H3:H10                     | Eight coach avatar formulas contain numeric UIDs even though their cached image cells show `#REF!`. These fixed literal IDs are extracted without executing the formulas.                                                                                                                                                        |
| Team List Tier columns               | 48 final Tier allocations, T1–T6. There is no selection log or captain order. `draftMode: "final-tiers"` preserves Tiers with an empty `picks` array. The draft page displays final Tier cards without invented pick numbers or selection chronology.                                                                            |
| 对阵表 A2:L13, A997:L1006            | 21 scored matches with unique MP IDs, plus the organizer-confirmed A8 forfeit. Two valid Bilibili VODs. Rows 997–1006 are actual knockout results and must not be lost by stopping at the blank template rows.                                                                                                                   |
| Team List A3:B10 and group fixtures  | Two four-team round-robin components, A/C/E/G and B/D/F/H. Presentation labels A/B follow component order. Win/loss totals reconcile when A8 is treated as a C win. No numeric official ranks or tiebreak rules are supplied. Map totals include only played scores.                                                             |
| Mappools B257:L275, B77:L91, B41:L57 | Three populated pools: 小组赛 15, 淘汰赛 15, 决赛 17, totaling 47. Preserve the original `ACE1` slots rather than relabeling them as TB. Historic SR/BPM/drain/CS/AR/OD stay unchanged; drain day-fractions become seconds. The last parenthesized suffix supplies the literal mapper.                                           |
| Staff A1:A9, C1:C9                   | Nine referee and nine streamer signatures, corroborated by per-match H/I columns. Seven signatures match UIDs already evidenced in the same workbook. The remaining 11 were resolved through reviewed public osu! profiles and existing edition identity evidence on 2026-10-24; see below. No account or permission is created. |

The complete Cover is empty. The Grand Finals pool and other unused round templates have no beatmaps; do not create empty pools or fabricate maps. Blank GS placeholders NM6/HD4/HR4/DT4 are not selected maps. Source match labels without participants/results are omitted. No S7 rulebook or edition artwork is supplied; do not reuse S8/S9/S10/S11 content.

The knockout source only explicitly labels 淘汰赛, LF and GF. Do not infer extra SF/Finals stage assignments from dates or map scores. Generated bracket edges retain the existing meaning of previous recorded team appearances.

## Organizer-confirmed corrections (2026-10-24)

1. The organizer confirmed that A7, A8, A9 and A10 use **2022** in place of the erroneous 2021 year. Month, day and time are unchanged: January 5 (A7), January 2 (A8/A10), January 3 (A9). Other source dates remain unchanged.
2. The organizer confirmed A8 as **C wins, G forfeits**. Preserve `score: null, forfeitWinner: 0`, with the original `0:-1` retained in review notes. Do not replace it with a normal map score. It counts as a result and contributes no played maps.

Finalized package: [imports/s7-archive.json](imports/s7-archive.json). It contains 22 recorded results (21 scored plus one forfeit), zero unconfirmed template fixtures, 64 identities, 48 final Tier allocations (zero chronological picks), 18 staff signatures and 47 maps.

## Staff identity follow-up (#176, 2026-10-24)

The organizer requested missing staff homepage links after the initial publication. All 11 previously name-only signatures now have reviewed numeric UIDs. Public osu! profile headings were checked against these identities; names are not resolved dynamically at runtime. The supplementary mappings are fixed in the preparation script so regenerating the package preserves them.

| Source signature | Verified homepage                                            | Supporting evidence                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| osu happy        | [9580470](https://osu.ppy.sh/users/9580470)                  | Exact-name public profile redirect and heading.                                                                                                                                                                               |
| Another Flower   | [6854920](https://osu.ppy.sh/users/6854920)                  | S8 Team!AE36, S9 Team!AO21, S10 Staff!B4:C4 and public profile.                                                                                                                                                               |
| Morika           | [7083201](https://osu.ppy.sh/users/7083201)                  | Exact-name public profile redirect and heading.                                                                                                                                                                               |
| Truth your left  | [4082595 — Truth you left](https://osu.ppy.sh/users/4082595) | Organizer explicitly confirmed the spelling error and requested correcting the username. Both staff signature and A5 referee display use `Truth you left`; the original spelling is retained here and in import review notes. |
| WhiteCookies     | [13617153](https://osu.ppy.sh/users/13617153)                | Exact-name official public profile.                                                                                                                                                                                           |
| 110              | [4524921](https://osu.ppy.sh/users/4524921)                  | Official `/users/@110` username lookup redirects to this numeric UID; profile heading is `110`, previously Vacodado / [Y o s h i n o]. Do not use UID 110.                                                                    |
| Muziyami         | [7003013](https://osu.ppy.sh/users/7003013)                  | S8 Team!AJ8, S9 Staff!B7:C7 and public profile.                                                                                                                                                                               |
| Explosive        | [245276](https://osu.ppy.sh/users/245276)                    | S9 Staff!B6:C6 and public profile.                                                                                                                                                                                            |
| FcEazy           | [7825227](https://osu.ppy.sh/users/7825227)                  | S10 Staff!B10:C10 and public profile.                                                                                                                                                                                         |
| feifeiis         | [4734497](https://osu.ppy.sh/users/4734497)                  | Exact-name public profile redirect and heading.                                                                                                                                                                               |
| Alice Mana       | [1698898](https://osu.ppy.sh/users/1698898)                  | Exact-name official public profile.                                                                                                                                                                                           |

The seven original workbook-derived staff UIDs are unchanged. This update changes only staff identities, the confirmed referee spelling, and review provenance; teams, roster, dates, results, final Tiers and maps are unchanged.

```sh
python3 scripts/prepare-s7-archive.py /path/to/source.xlsx docs/imports/s7-archive.json --captured-on 2026-10-24 --january-year corrected-2022 --a8 forfeit
```

## Compatibility and deployment handoff

No database migration. The schema adds optional `draftMode` and `forfeitWinner`, recognizes literal ACE slots, and allows a historical staff signature's UID to be null. Existing S8/S9/S10 packages retain their shape and behavior. Forfeit results cannot simultaneously carry fabricated played scores, final-Tier mode cannot claim chronological picks, and ordinary unconfirmed records remain hidden publicly. Existing edition scope, revision checks, explicit publication and audit transactions are unchanged.

Deploy this compatible build **before** any S7 import. Older strict parsers cannot read the additional S7 fields; rollback must keep compatible archive support rather than erase production audit/revision history.

After the organizer confirms deployment, use computer use at https://oclr.org/:

1. Check whether S7 already exists; do not overwrite unrelated content. Create/select private `s7`, name `OCLR Season 7`, season `7`, Completed, fixed UTC+8 (`Etc/GMT-8`), no registration or inherited S11 assets. Suggested factual summary: `osu! Chinese League Rookie — Season 7. 2021–2022 年歷史賽事歸檔。`
2. Upload and validate the finalized package, review notes/counts and save a private draft using the existing importer.
3. Review eight teams, 64 UID identities, 48 final Tier cards with no pick order, 18 staff signatures, all dates/results including the organizer's A8 decision, generated bracket and all three pools/47 maps. Rules remain unrecorded.
4. Publish separately when authorized, then verify anonymously on desktop/mobile and both themes. Record actual production evidence on #175; close only after import acceptance. Do not write directly to the production DB/API or deploy on the organizer's behalf.

## Local validation

Initial #175 validation: `npm run check`, production build and 45 targeted unit/integration tests passed. S7 was subsequently imported and published through computer use after explicit organizer approval, with anonymous desktop/mobile verification; the organizer performed deployment.

The #176 identity follow-up passes `npm run check`, production build, 25 archive unit tests and five transaction integration tests. Integration tests use only `TEST_DATABASE_URL=postgresql://emik@127.0.0.1:5432/oclr_archive_test`. Production dependency audit reports zero vulnerabilities. The legacy-format browser test passes on desktop and mobile using installed Chrome (`PLAYWRIGHT_CHANNEL=chrome`): full S7 private file import, separate publication, all 18 staff links including the corrected name and numeric username `110`, final Tier cards, ACE filtering and forfeit schedule/bracket rendering in light/dark, including accessibility and overflow checks. Package regeneration is semantically identical; comparison against the previous package confirms no changes to teams, roster, dates, results, Tiers or maps. Formal production update evidence is recorded on #176 after the organizer authorizes the importer-required temporary unpublication.

## Saved reconstructed rules (#338, 2026-10-26)

The organizer supplied a draft rulebook and confirmed a reconstructed version,
now saved through the native rules editor. Earlier statements above that no
rulebook was supplied describe the initial import checkpoint, not current content.
S7's public historical page now reads the edition's saved rules version and
sections when the archive matches the evidenced S7 workbook. No rule text is
bundled or substituted, and missing saved rules still display as unrecorded.
Other seasons retain their existing source matching. No migration or re-import
is needed; the compatible application release must be deployed before this
change is visible on the live site. This implementation does not establish live
deployment or change any saved archive data.

Validation for #338: Node 24.22.1, `npm ci`, `npm run check`, production
`npm run build`, `npm audit --omit=dev` (zero vulnerabilities), and
`git diff --check` completed. The organizer requested skipping regression tests
while the full suite and desktop/mobile browser checks were running. The full
suite was stopped and is not reported as passing; the two S7 desktop/mobile
checks had already completed successfully before the stop signal arrived. No
additional regression run was started. Coverage remains for later CI execution.
No production deployment was performed.
