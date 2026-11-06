# S11 empty-state background correction

Date: 2026-11-06 (Asia/Taipei). Follow-up to merged PR #940, based on main
`210ffde579d2e928b43a2842a7bcaa19d9ead610`.

The organizer reported a rectangular light fill behind the unpublished teams
and unpublished draft notices. Both use the shared `EmptyState` component.
Public tournament pages intentionally give that component a transparent
background, a thin top divider and no panel padding. S11's panel selector also
included `.empty-state`, so it added a surface fill and shadow to that flat
layout. The correction removes `.empty-state` from that selector and lets the
existing public/private context rules supply its presentation.

The isolated preview uses the real `EmptyState` for teams and the real
`LiveDraft` with an unpublished board. Only the draft HTTP response is replaced
with `null`; no live data, account, publication or configuration is changed.

| Reported page | Before, light 877 × 819          | Corrected light                    | Corrected dark                    |
| ------------- | -------------------------------- | ---------------------------------- | --------------------------------- |
| Teams         | [Before](teams-light-before.png) | [After](teams-light-877-after.png) | [After](teams-dark-877-after.png) |
| Draft         | [Before](draft-light-before.png) | [After](draft-light-877-after.png) | [After](draft-dark-877-after.png) |

Representative phone checks: [teams/light](teams-light-390-after.png) and
[draft/dark](draft-dark-390-after.png), both at 390 × 844.

[Computed styles and browser results](results.json) confirm all six corrected
views have `background-color: rgba(0, 0, 0, 0)`, `box-shadow: none`, no horizontal
page overflow or script errors, and zero axe WCAG 2 A/AA and 2.1 AA violations.
Before the fix both reported views computed white backgrounds and panel shadows.

Reproduce with the existing DB-free component host and
`/nebula-preview?view=teams&theme=light&locale=zh-Hant` or `view=draft`.
The draft snapshot endpoint must return JSON `null` in the isolated browser
context. This is a focused visual correction; no E2E regression matrix was added.

Verification with Node 24.22.2:

- `npm run check` and `npm run build` passed.
- `npm test`: 208 files passed / 82 skipped; 1,769 tests passed / 794 skipped,
  177.35s. Database-dependent cases skipped without an isolated test database.
- `npm audit --omit=dev`: zero vulnerabilities.
- Affected-file formatting, evidence links and `git diff --check` passed.
- Full E2E: not run (too slow). The browser checks above reproduce the reported
  visual defect with synthetic component data; they do not establish a live
  deployment result.
