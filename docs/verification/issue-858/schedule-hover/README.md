# Overview table hover correction

Date: 2026-11-06 (Asia/Taipei). Based on main
`106a609928158edc7b7491e61d1c24a9c2ebf117`.

The organizer requested hover feedback on every schedule data row, excluding the
header. [Before measurements](before.json) distinguish the states: the odd row
used the global fixed dark hover color, while the even row's more specific zebra
background won over that hover rule and did not change on pointer entry.

The information stylesheet now declares its own `tbody tr:hover` after the zebra
rule, using the active appearance's `--site-tint`. Both row parities receive the
same hover color; pointer leave restores their original alternating backgrounds.
The selector excludes `thead`, so header cells keep their existing presentation.

The shared information-table rule also covers other overview document tables;
it follows each active appearance's tokens. No new controls, focus targets or
pointer cursors were added to these non-interactive rows.

| Mode      | Hover first data row           | Hover second data row           |
| --------- | ------------------------------ | ------------------------------- |
| S11 light | [First](light-row-1-after.png) | [Second](light-row-2-after.png) |
| S11 dark  | [First](dark-row-1-after.png)  | [Second](dark-row-2-after.png)  |

[Before: second row hovered](light-row-2-before.png).
[After measurements](results.json) verify at 877 × 819:

- Both data rows change color on pointer entry and use identical hover colors.
- Each returns to its exact baseline color on pointer leave.
- Hovering the table header does not change its background.
- S11 light/dark and default light have no page overflow, script errors or axe
  WCAG A/AA violations in the measured hover state.

The isolated schedule fixture uses synthetic dates and the shipped information
stylesheet. No E2E regression matrix was added for this CSS correction.

Verification with Node 24.22.2:

- `npm run check` and `npm run build` passed.
- `npm test`: 208 files passed / 83 skipped; 1,770 tests passed / 797 skipped,
  161.09s. Database-dependent cases skipped without an isolated test database.
- `npm audit --omit=dev`: zero vulnerabilities.
- Affected-file formatting, local evidence links and `git diff --check` passed.
- Full E2E: not run (too slow). The targeted hover checks use synthetic data;
  live rendering and deployment remain separate evidence.
