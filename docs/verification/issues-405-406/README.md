# Historical mappool statistics — #405 / #406

Source baseline: main `efaba82c62a4ef1dbba387ca80a49e3b3a4b12fb`.
Local verification: 2026-10-27 (America/Los_Angeles), Node.js 24.19.0,
PostgreSQL in a new, dedicated loopback test cluster. No production data or
configuration was changed.

## Behavior and scope

Eligibility comes from an explicit published archive fixture pool or validated,
published statistics snapshots. Draft selections and stage/slot guesses cannot
establish eligibility. A conflicting archive/snapshot association remains unknown.
Same round + slot + beatmap identities shared across pools union applicable
fixtures once; different beatmaps in the same slot stay separate. Replays count
once per fixture for picks and pick rates.

Picks require published MP coverage; bans use the published schedule independently.
Only fully resolved ban strings establish known zero for other maps. Missing or
unparseable strings stay unknown. With partial coverage, known counts remain
visible, coverage is shown as recorded / applicable fixtures, and incomplete rates
stay unavailable. An unknown-pool fixture in the selected round/team scope also
withholds rates and is listed separately. Team filtering limits eligibility to
that team's fixtures and bans to that team's side.

Rows and map options include applicable pool maps with no score rows. Score
statistics for those maps remain unavailable. Historical source text, scores,
saved snapshots and publication state are unchanged.

`publicArchiveStatistics.poolFixtures` is additive and optional in the shared
read contract; DTO and OpenAPI generators were synchronized. Older backends
without this context leave eligibility/coverage and historical rates unknown.

## Verification

- Locked install, check, production build, i18n extraction/check, changed-file
  ESLint, DTO/route-matrix generator checks, and production dependency audit
  (0 vulnerabilities).
- Model/DB/identity/i18n/read-DX tests cover S10 Group A HR2 (4/5 = 80%), Group B,
  shared NM5 (10 applicable fixtures), SF HD3 (2 bans / 4 = 50%), missing and
  conflicting pools, partial coverage, missing/unparseable bans, known zero,
  team filtering, replay deduplication and publication boundaries.
  Committed public S10 source identities are combined with synthetic snapshots;
  this does not attest to the production deployment or publication state.
- Playwright desktop/mobile: both themes, denominator, ban-only map, known zero,
  sorting, map/team/search filters, Axe and no page horizontal overflow.
  These are focused browser checks, not a full site/browser/theme matrix.
- Focused model/DB/identity/i18n/read-DX checks: **43 passed**. Desktop/mobile
  browser checks: **2 passed** (both themes in each test).
- Full `npm test`: **1271 passed / 65 failed / 3 skipped**, across 170 files
  (14 failed). Failures include Windows Bash execution, symlink EPERM, durable
  media path checks, Python GBK decoding, and an existing S10 pool-name migration
  test exceeding its 15-second timeout. A focused retry of that migration test
  still timed out. These failures remain unresolved; no full-suite or CI success
  is claimed. The remote inventory check passed after locally normalizing its
  generated JSON line endings; no inventory content changed.

Screenshots use synthetic fixtures; the coverage screenshots scroll the table
to its final columns:

- [Desktop light](desktop-light.png) / [desktop dark](desktop-dark.png)
- [Mobile light](mobile-light.png) / [mobile dark](mobile-dark.png)

## Chinese wording for organizer review

Headers: 适用比赛数／適用比賽數、图池未知的比赛数／圖池未知的比賽數、
选取记录覆盖／選取紀錄覆蓋、禁用记录覆盖／禁用紀錄覆蓋。

- 简体：分数和选取次数仅统计已审核发布的 MP 对局；禁用次数来自已发布赛程。缺失记录不视为零。
- 繁體：分數和選取次數僅統計已審核發布的 MP 對局；禁用次數來自已發布賽程。缺失紀錄不視為零。
- 简体：比例仅在图池明确且记录完整时显示。覆盖范围显示已记录／适用比赛数，图池未知的比赛另列。
- 繁體：比例僅在圖池明確且紀錄完整時顯示。覆蓋範圍顯示已記錄／適用比賽數，圖池未知的比賽另列。

Wording awaits organizer review; automated checks do not establish acceptance.
