# S8 map-view control detail fix (#437)

2026-10-29 Asia/Taipei. The organizer's S8 dark-mode screenshot shows a capsule outline around two 8px rounded buttons. The shared `.event-pills` container supplies a 24px outer radius and 4px padding, while Sakura Circuit overrides the child buttons to 8px.

The fix scopes a 12px outer radius to `sakura-circuit .map-view-control`, matching the existing button shape and inset. It preserves padding, gaps, borders, colours, 44px touch targets, markup and view/filter/sort behavior. No shared theme styles, artwork, interface messages, preference behavior, data or permissions change.

## Visual comparison

Same isolated S8 source fixture, `zh-Hant`, 2× screenshots. Before uses main `f4b5eb85e363ddf1aed77a9cfcc7f40653c01180` in the dedicated development preview; after uses the production build with the scoped CSS fix. The screenshots show the real toolbar without injected preview styles.

Desktop dark, 1440px:

![Before, desktop dark](before-desktop-dark.png)

![After, desktop dark](after-desktop-dark.png)

Mobile light, 390px:

![Before, mobile light](before-mobile-light.png)

![After, mobile light](after-mobile-light.png)

## Verification

- [Before geometry](before.json) records the original outer/inner radii, padding and height.
- [After verification](verification.json): 24 locale/theme/width combinations, both view states and 48 Axe AA scans passed with zero violations or page errors. Keyboard focus, search/sort preservation, 44px touch targets and containment passed; two forced-colour checks passed. The default appearance retains its original 24px radius. The report binds the production build ID and final stylesheet hash.
- Existing desktop/mobile S8 appearance and mappool-browser E2E cover menu/SSR behavior and actual card/compact interactions. No implementation-mirroring test was added for the isolated radius value.
- Node.js24.22.1 locked install, lint/types and production build passed. Complete unit/integration checks: 183 files, 1480 passed, 1 skipped. Production dependency audit: 0 vulnerabilities.
- Existing desktop/mobile S8 menu/SSR and mappool-browser E2E: 4 passed. The additional historical S8 view checks use its actual card/compact-list markup. No full functional/header/remote or Safari coverage is claimed.

Only the disposable `oclr_s8_control_test` preview database is used for these screenshots. Unit/integration and browser fixtures use separate `oclr_s8_control_unit_test` and `oclr_s8_control_browser_test` databases. The fixture reuses the committed S8 archive and does not approve or publish any production data.

Formatting and `git diff --check` passed. The dedicated preview and test PostgreSQL were stopped after verification. No migration, i18n extraction, deployment or production-data operation is part of this CSS-only fix.
