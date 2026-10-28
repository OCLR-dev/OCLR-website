# Match details copy reduction (#377)

The ordinary and historical match pages share the reduced presentation described
in [match details](../../match-details.md#match-page-presentation-377).
The formula and full source disclosure remain available in round/Admin rating
views and the [rating reference](../../yumu-rating.md).

## Same-viewport comparisons

All images use synthetic fixtures, English, the default appearance and light mode.
Before images use main `efaba82c62a4ef1dbba387ca80a49e3b3a4b12fb`;
after images use this implementation. Each pair uses the same fixture and browser
viewport: desktop 1280 × 720; mobile 390 × 664 (iPhone 13 emulation).
Mobile images are reduced from device pixels to CSS-pixel width, equally in both
versions. Full-page WebP images retain the scoreboard, map/player tables and rating
for comparison; page height can change with the removed content.

| View               | Before                                   | After                                  |
| ------------------ | ---------------------------------------- | -------------------------------------- |
| Historical desktop | [Before](historical-desktop-before.webp) | [After](historical-desktop-after.webp) |
| Historical mobile  | [Before](historical-mobile-before.webp)  | [After](historical-mobile-after.webp)  |
| Ordinary desktop   | [Before](ordinary-desktop-before.webp)   | [After](ordinary-desktop-after.webp)   |
| Ordinary mobile    | [Before](ordinary-mobile-before.webp)    | [After](ordinary-mobile-after.webp)    |

The historical fixture has an official 2:1 technical result, retained-game wins of
2:0, two MP sources, four played maps (two excluded) and a long literal player
name. The ordinary fixture has six approved maps. Neither represents a live OCLR
result or a production import/review/publication.

Full-page height in CSS pixels (same viewport and data):

| View               | Before | After |
| ------------------ | -----: | ----: |
| Historical desktop |  5,621 | 4,952 |
| Historical mobile  |  6,656 | 5,814 |
| Ordinary desktop   |  8,238 | 7,595 |
| Ordinary mobile    | 10,398 | 9,635 |

## Verification

Local verification on 2026-10-28 used Node.js 24.22.1, PostgreSQL 17 and synthetic
data in newly migrated isolated test databases:

- `npm run check`, `npm run build`, i18n extraction and `npm run test:i18n` passed.
- Final `npm test`: 170 files passed; 1,356 tests passed, one skipped.
- Four match-detail desktop/mobile cases passed, covering the 312 combinations
  below. Four additional desktop/mobile Rating/player-class cases passed,
  including the full Admin presentation and public round/player views.
- `npm audit --omit=dev`: zero reported vulnerabilities. Changed documentation
  links and `git diff --check` passed.

The final unit run used a fresh database and Python 3.13. Earlier attempts had an
interrupted Python 3.15 replay compression subprocess and, on database reuse,
retained staff history affecting draft-deletion fixtures. Those attempts are not
reported as passing runs. Local browser runs used a temporary port override
(31477) because 3100 was already serving another task; saved-data page tests did
not require the provider transport fixture. No test-server configuration change
ships with the patch.

The focused browser tests exercise
both routes in Chromium at desktop/mobile widths, three locales, all 13 registered appearances
and both brightness settings: 312 rendered combinations. They check scores and
rating tables, exclusion/missing-Mods states, withdrawal/unavailability, keyboard
focus, document overflow and Axe. Unit rendering checks additionally cover partial
sources, technical results, adjusted team mapping, withheld player data, failed
scores actually changed to zero, valid zero versus missing values and the full
rating presentation used outside match pages.

The expanded matrix found low-contrast player links on Manga's ink table row
headings. Those links now inherit the heading's foreground; their underline,
destination and data are unchanged.

## Chinese wording awaiting organizer review

| English                    | 简体中文            | 繁體中文            |
| -------------------------- | ------------------- | ------------------- |
| Match details unavailable. | 对局详情暂不可用。  | 對局詳情暫不可用。  |
| Team mapping adjusted      | 队伍归属已调整      | 隊伍歸屬已調整      |
| Failed scores counted as 0 | 失败成绩按 0 分计入 | 失敗成績按 0 分計入 |
| Player data incomplete     | 选手数据不完整      | 選手資料不完整      |

Local checks and CI do not establish organizer wording/visual acceptance or a
deployment. Scoring, rating, saved evidence, API fields and authorization remain
unchanged.
