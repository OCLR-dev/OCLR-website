# #274 Visible staff role editing

Existing personnel cards now show a named role-editing section, the existing multi-select checkbox form, permission notice and explicit save action. Each section includes the person's name and osu! ID in its accessible label. Existing scope, prefilled roles, confirmation, stale-grant checks, atomic service and audit behavior remain intact.

Synthetic desktop/mobile visual previews were captured using the existing staff page and a separate isolated test database. The before comparison wraps the same form in the former closed disclosure. Screenshots were inspected; the local e2e suite was skipped as requested.

- [Desktop before](desktop-before.png) / [after](desktop-after.png)
- [Mobile before](mobile-before.png) / [after](mobile-after.png)

Updated the existing browser scenario to require the save action to be visible on initial load/reload, without opening a disclosure; it remains for CI execution. `git diff --check` passed. Batch non-e2e results will be recorded in the PR.
