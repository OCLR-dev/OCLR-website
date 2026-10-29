# Admin-configured season themes (#445)

The Header and whole-site settings offer only the nine cross-season designs in
`publicAppearances`. All eight registered season designs remain available in the
existing edition Admin form, with unchanged edition permissions, revisions and
audit events. New season designs belong in `seasonAppearances` and remain
unavailable as visitor/site choices.

Server rendering and client navigation ignore season-valued visitor cookies.
The client expires obsolete preferences without persisting the inherited edition
theme. Legacy season-valued site settings render as `default` but retain their
stored value/revision/history until a global Admin explicitly saves a public
appearance. Remote site defaults follow the same fallback; read contracts and DB
constraints retain compatibility with old saved values. No migration is needed.

Public visitor overrides still precede the current authorized/published edition
default and public site default. Private edition visibility, player-profile
edition context, independent light/dark/system and broadcast isolation remain.
No production configuration or data was changed and no deployment was performed.

## Local verification — 2026-10-29

Node.js 24.22.1, existing lockfile and `npm ci`. Tests use only disposable
`oclr_445_test` / `oclr_445_unit_test` databases on a dedicated loopback PostgreSQL
cluster. Screenshots contain synthetic identities and tournament dates.

- `npm run check`: passed.
- `npm test`: 186 files passed, 1,529 tests passed, one skipped (after integration). An earlier run found an incorrect new
  test assertion treating an unchanged `default` save as a new audit event. The
  test setup was corrected; targeted appearance/permission checks passed 84/84.
- `npm run build`: passed.
- `npm run i18n:extract` and `npm run test:i18n`: passed; Chinese catalog text
  is proposed wording, still subject to organizer review.
- Initial desktop/mobile browser checks before the main sync: 50 distinct targeted cases passed across the
  combined runs. S8 had one transient desktop selector timeout; its final isolated
  desktop/mobile rerun passed 2/2. Tests now configure
  season themes on editions instead of selecting them through public cookies.
  Earlier S7/S8 tests assumed that navigating away retained a season theme;
  those fixtures now configure the actual target edition. Header dismissal
  checks assert hidden state, compatible with existing mounted hidden menus.
- Remote frontend core desktop/mobile check: 2/2 passed, including real synthetic
  grant revocation, session isolation and the no-local-database guard.
- `npm audit --omit=dev`: zero vulnerabilities.
- Formatting and `git diff --check`: passed.

This is targeted browser regression, not the full functional/header/remote
matrix. Commit-specific GitHub CI and maintainer acceptance remain separate.

## Screenshots

- [Desktop public menu](desktop-public-menu.png)
- [Mobile public menu](mobile-public-menu.png)
- [Desktop site settings](desktop-site-settings.png)
- [Mobile site settings](mobile-site-settings.png)

The final branch also incorporates S4 Azure Brush from updated main
`3750bc932cf0cd37b1ed5b74921080c881c164b7`; the same Admin-only policy applies.
Post-integration build, lint/types and i18n checks passed. The final targeted
desktop/mobile run passed 24/24 across season policy, site settings, all seven
Admin-configured edition defaults and S4 Azure rendering/responsiveness. The
full unit/integration counts above are from this integrated version. The remote
frontend core desktop/mobile checks were also rerun after integration: 2/2 passed.

PR synchronization also incorporates S2 Verdant Prelude and the player-filter
changes from main `3ced64d645eccf43752bfa4bd01867aa3e249db0`. The public whitelist
remains unchanged; S2 is likewise edition-Admin-only.
