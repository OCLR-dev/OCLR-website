# #279 Compact draft broadcast tools

The control-room heading and view actions use a compact scoped layout. The OBS URL is a read-only single-line field with the copy action beside it on desktop and below it on narrow screens. The release-boundary explanation stays visible through clipboard feedback; failures focus/select the whole URL for manual copying. Existing presenter/overlay destinations, staff scope and published snapshot behavior remain unchanged.

A long synthetic edition slug was used on the actual control-room page at 1440×1000, 390×844 and 320×844. Before comparisons reconstruct the former wrappers/textarea on the same page/data. Heading-through-tool height: desktop 356.5→263.3px, 390px 345.4→343.3px, 320px 423.3→416.4px. The long slug now wraps fully; no after view has horizontal overflow. Narrow-screen gains are limited because previously overflowing context is now fully visible.

Visual previews inspected:

- [Desktop before](desktop-before.png) / [after](desktop-after.png)
- [390px before](mobile-before.png) / [after](mobile-after.png)
- [320px before](narrow-before.png) / [after](narrow-after.png)

Direct preview interaction confirmed the entire 117-character URL was copied at every width. Denied clipboard access selected characters 0–117 and focused the field, with the existing accessible failure message. The release notice remained visible. These were preview/clipboard inspections; the local e2e suite was skipped at the organizer's explicit request.

The existing operations/overlay URL unit checks passed (16 tests). The existing CI browser scenario now also checks the exact copied value and retained release notice. `git diff --check` passed; no interface messages were added. Combined non-e2e and CI results are reported in the PR.
