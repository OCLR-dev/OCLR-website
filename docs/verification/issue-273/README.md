# #273 Compact tournament overview

The banner uses a shallower desktop crop (4.6:1, retaining the existing mobile crop). The stage wheel keeps one full stage and 12px previews above/below, with its existing navigation beside the stage. Row heights accommodate the title, status, deadline/time zone and action; navigation targets are 44px.

Visual inspection used an isolated synthetic PostgreSQL database and Chrome at 1440×1000 and 390×844. Before images restore the main-branch styles on the same page/data. Banner-to-stage measurements: desktop 611.2px → 404.2px; mobile 455.8px → 303.8px. Default, cute-pastel and swiss-minimal in light/dark had no horizontal overflow at these widths. Screenshots were inspected; this was a visual preview, not a local e2e suite run.

- [Desktop before](desktop-before.png) / [after](desktop-after.png)
- [Mobile before](mobile-before.png) / [after](mobile-after.png)

`git diff --check` passed. Batch lint/types, unit/integration tests, build and production dependency audit will be recorded in the PR. Local e2e is skipped at the organizer's explicit request. No tournament data, stage logic or publication rules changed.
