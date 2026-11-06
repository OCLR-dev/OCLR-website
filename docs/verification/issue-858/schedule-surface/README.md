# S11 overview schedule surface correction

Date: 2026-11-06 (Asia/Taipei). Based on main
`19e944d2e6150188c61d8b527f4c0f5e7557480a`.

The organizer reported the styling of the overview's `#schedule` section at
877 × 819. S11's solid reading-surface selector included `.information-document`,
overriding the overview's explicit transparent, unboxed article style. This
painted a rectangular fill behind the schedule heading and its table.

The correction removes `.information-document` from that selector, so the
overview uses its existing context style. The table retains its tinted header,
alternating row shading, dividers and responsive timestamp wrapping.

| Width     | Before                         | Corrected light              | Corrected dark             |
| --------- | ------------------------------ | ---------------------------- | -------------------------- |
| 877 × 819 | [Before](light-877-before.png) | [Light](light-877-after.png) | [Dark](dark-877-after.png) |
| 390 × 844 | —                              | [Light](light-390-after.png) | [Dark](dark-390-after.png) |

The DB-free fixture matches `InformationDocument`'s overview/article/section/table
structure and uses its shipped stylesheet plus the real overview contents
navigation. Dates are clearly synthetic 2030 fixture values. This captures the
reported CSS interaction without reading live registration data.

[Computed styles and browser results](results.json) confirm the article and
heading have transparent backgrounds, the header and alternating row shading
remain distinct, both timestamps remain present, and the four previews have no
page overflow, script errors or axe WCAG A/AA violations.

Reproduce with the existing component host at
`/nebula-preview?view=schedule&theme=light&locale=zh-Hant` (or `theme=dark`).
No E2E regression matrix was added for this visual correction.

Verification with Node 24.22.2:

- `npm run check` and `npm run build` passed.
- `npm test`: 208 files passed / 82 skipped; 1,769 tests passed / 794 skipped,
  162.94s. Database-dependent cases skipped without an isolated test database.
- `npm audit --omit=dev`: zero vulnerabilities.
- Affected-file formatting, local evidence links and `git diff --check` passed.
- Full E2E: not run (too slow). The targeted browser results above cover the
  reported styling with synthetic data; live authenticated rendering and
  deployment remain separate evidence.
