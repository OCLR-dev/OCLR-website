# S4 recorded group-stage rounds (#408)

S4's archived group stages use `小组赛第1轮` through `小组赛第4轮`, with
no reliable group standings. The bracket read model now recognizes those labels
only for S4's exact source workbook (with or without `/edit`). Each recorded
source round remains a six-match grid under Group Stage. The ten knockout games
remain under Knockout, with no group-stage predecessor links or invented groups,
rankings or advancement. Editable edition slugs do not select this behavior.

No saved data, import package, approved score, forfeit or publication flag changes.
The five 5:5 draws retain no winning team; A22 retains its forfeit winner and no
played score. No new interface messages or database migration are required.

## Local verification — 2026-10-28

- Node.js 24.22.1 and `npm ci` with the existing lockfile.
- `npm run check` and `npm run build` passed.
- Full unit/integration run: 175 files passed; 1,423 tests passed, one skipped,
  and one lint-toolchain case timed out during initial plugin loading. The entire
  affected lint-toolchain file was rerun without code/config changes: all five
  cases passed in 1.80 seconds. The complete suite was not repeated after this
  successful focused retry.
- Targeted source-data regression: 17 tests passed across S4, historical bracket,
  S1 and S6 files. Coverage includes the exact workbook variants, private/public
  projections, all 34 recorded S4 games, unchanged approved scores, A22, five
  draws, no mutation, and unknown source/stage rejection. Existing S2 and Group
  A/B/C/D classification checks also passed.
- Desktop/mobile browser run: all 24 cases passed across the new S4 schedule
  test and existing S1/historical-archive workflows. S4 checks every group-round
  tab, all 24 group matches, ten knockout cards, draws/forfeit, no invented
  standings, private/public access boundaries, three locales, light/dark and
  horizontal overflow. Existing S6 and S9 appearance regression also passed.
- `npm audit --omit=dev`: zero vulnerabilities. Formatting and
  `git diff --check` passed.

Database tests used only the isolated `oclr_408_test` database. Browser screenshots
contain synthetic identities/results. This is local targeted browser evidence,
not a full-site matrix, production deployment or maintainer acceptance. GitHub CI
has a separate commit-specific status.

## Screenshots

- [Desktop: fourth group round, draw and A22 forfeit](desktop-groups-dark.png)
- [Mobile: fourth group round, draw and A22 forfeit](mobile-groups-dark.png)
