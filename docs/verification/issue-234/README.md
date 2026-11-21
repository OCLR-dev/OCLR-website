# Back-office draft presentation (#234)

The original verification covered launch controls in the edition draft and streaming workspaces. Current launch controls are in the draft control room. Presenter access is edition-scoped on the server. OBS output is a public, read-only released-data URL. See [draft broadcast access](../../draft-broadcast-access.md).

## Local verification — 2026-10-25

- Production build, lint/type checks and i18n extraction passed on the combined verification branch. No new interface copy was introduced.
- Combined unit/integration run: 848 passed, 1 skipped. The subsequent S10 MP evidence tests passed separately (7 adapter tests).
- All 22 targeted desktop/mobile checks passed after correcting two stale test assumptions and waiting for bracket geometry; dedicated issue checks passed using installed Google Chrome and the isolated `oclr_thread_ui_test` PostgreSQL database. Screenshots use synthetic configuration and archived competition evidence, not production state.
- Production dependency audit: zero vulnerabilities. No deployment or production data write.
- Remote CI and organizer visual acceptance are separate from these local checks.

## Screenshots

- [desktop-staff-broadcast-tools](desktop-staff-broadcast-tools.png)
- [mobile-staff-broadcast-tools](mobile-staff-broadcast-tools.png)
