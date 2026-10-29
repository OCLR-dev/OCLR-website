# Admin-configured season themes (#445)

The Header and whole-site settings offer only the nine cross-season designs in
`publicAppearances`. All nine registered season designs remain available in the
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

Final integration base: `5032b947814fbcfc7315894639ede81c36fe013b`, including
S1 Chromatic Origins, S2 Verdant Prelude, S4 Azure Brush and fixture recovery.
Node.js 24.22.1, existing lockfile and `npm ci`. No new dependencies or migration.

- `npm run check`: lint and types passed.
- `npm test`: 186 files passed, 1,540 tests passed, one skipped.
- `npm run build`: passed.
- i18n extraction and checks: passed. The new Chinese hint remains proposed
  wording for organizer review.
- Final desktop/mobile targeted browser run: 28/28 passed across season policy,
  global site settings, all nine Admin-configured edition defaults, and S1
  rendering/responsiveness. Coverage includes legacy/forged cookies, SSR without
  JavaScript, cross-edition navigation, independent brightness, three locales,
  saved-value recovery, authorization, origin and concurrency checks.
- Final remote frontend core desktop/mobile run: 2/2 passed, including real
  synthetic grant revocation, session isolation and the no-local-database guard.
- `npm audit --omit=dev`: zero vulnerabilities; dependencies unchanged.
- Formatting and `git diff --check`: passed.

All database checks used disposable `oclr_445_test` / `oclr_445_unit_test`
databases on a dedicated loopback PostgreSQL cluster. The final browser runs used
31545/31570 because another task occupied 3100. Temporary copies changed only
loopback URLs and relocated test imports; the provider fixture retained its
isolated-database/synthetic-credential checks at the dedicated origin. Temporary
configs/fixtures were removed afterwards. The committed tests retain their normal
3100/31470 setup. No other local service was stopped or changed.

Earlier regression also covered S4–S10 rendering, generic visitor choices and
Header interaction. One S8 desktop selector timeout occurred; its isolated
retest passed on both desktop and mobile. These checks are targeted regression,
not the full functional/header/remote matrix. Commit-specific GitHub CI and
maintainer acceptance remain separate.

## Screenshots

These contain only synthetic identities and tournament dates.

- [Desktop public menu](desktop-public-menu.png)
- [Mobile public menu](mobile-public-menu.png)
- [Desktop site settings](desktop-site-settings.png)
- [Mobile site settings](mobile-site-settings.png)

## S3/S1 follow-up — 2026-10-29

Integrated main `676b6aeb` (S3 Frost Waltz). `frost-waltz` and S1
`chromatic-origins` are both in `seasonAppearances`, available to edition Admins
but excluded from visitor preferences and site-wide defaults. Per the organizer’s
explicit request, no tests, build, lint or browser checks were rerun for this
follow-up; the earlier results above apply only to their recorded commits.
