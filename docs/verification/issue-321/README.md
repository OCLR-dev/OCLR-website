# Wiki EX description aligned with S11 (#321)

The source is the public [S11 EX chapter](https://oclr.org/tournaments/s11#rules-6),
read on 2026-10-25 (Asia/Taipei). The five source clauses are retained in
[s11-ex-source.txt](s11-ex-source.txt) for review. This snapshot does not replace
or modify the live tournament rules.

The Wiki now covers all five clauses: each team's optional two uses per match;
no TB; immediate declaration on the team's own pick; neither team's first pick;
Captain and T1 both excluded; one fewer player per team; FM rules still apply;
and the conditional one-win / one-fewer-pick / no-EX provision when only one team
can field the required players, including the organizing-committee reporting
clause. The former dedicated easier-map explanation and shared Captain/T1 slot
examples have been removed.

The EX article alone uses explicit next-intl messages in Simplified Chinese,
Traditional Chinese and English. The article URL and its four existing section
anchors remain unchanged. Its source link goes to the S11 homepage chapter,
following #298 rather than reintroducing a separate rules page. No formal rules,
historical rulebooks, stored tournament data, Tier calculation or referee logic
are changed.

Validation on Node.js 24.22.1:

- `npm ci` completed; the existing lockfile is unchanged.
- `npm run i18n:extract`, `npm run test:i18n` (4 tests), and the existing
  `wiki-guidance` test (3 locale cases) passed.
- `npm run check` and `npm run build` passed.
- `npm test`: 91 files / 624 tests passed; 51 files / 380 tests skipped because
  no isolated `TEST_DATABASE_URL` was configured. PostgreSQL integration and the
  full database-backed `npm run test:e2e` suite are not claimed as passed.
- `npm audit --omit=dev`: zero vulnerabilities.
- A one-off Playwright check against this production build passed 26 cases:
  all three locales at 1440px / 320px in light and dark, plus the seven other
  registered appearances at 320px in both themes. It checked translated EX
  content, source-link destination, all four existing contents anchors, no
  page-wide horizontal overflow, and the existing keyboard-focusable table
  scroll region. The table retains its intentional local horizontal scrolling
  on narrow screens. This check used Chrome with no database or account session.
- Source link and the public S11 `#rules-6` target were verified against the live
  public page. `git diff --check` passed.

The first sandboxed test attempt could not run local-listener / subprocess
fixtures; it was stopped and rerun successfully with those local permissions.
The initial sandboxed build was also stopped and rerun successfully. These
interrupted attempts are not recorded as passes.

Screenshots were visually reviewed:

- [Simplified Chinese, desktop, light](zh-Hans-1440-light.webp)
- [Traditional Chinese, 320px mobile, dark](zh-Hant-320-dark.webp)
- [English, desktop, dark](en-1440-dark.webp)

At the starting main commit `0bf4727039eec2d58d45224d8aab7c38973f43a2`,
[CI run 40177419250](https://github.com/OCLR-dev/OCLR-website/actions/runs/40177419250)
reported successful verification but failed browser jobs. This is baseline
status, not a result for this change. Commit-specific CI and organizer review of
the new Chinese copy remain required. No deployment or issue closure is claimed.
