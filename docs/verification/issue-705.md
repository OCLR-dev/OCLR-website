# Collapsible administration sidebar (#705)

Implemented on `codex/collapsible-admin-sidebar`, based on main `c8e85667`.
The hamburger beside the breadcrumbs controls the entire sidebar, including
tournament selection. Desktop starts expanded and retains its choice during
client navigation; mobile starts collapsed and closes after sidebar navigation
or tournament selection. Escape from the mobile sidebar returns focus to the
toggle. Collapsing preserves mounted workspace content and unsaved input.

The existing three-language open/close labels and MainSheet button materials are
reused. Referee pages retain their existing full-width layout. No messages,
authorization, business data, storage preferences or migrations were added.

## Local verification — 2026-11-02 (Asia/Taipei)

Node.js 24.22.2, dependencies installed with `npm ci` and the committed lockfile.

- `npm run check`: passed (ESLint, Next route types, TypeScript).
- `npm run build`: passed (production compilation, types and page generation).
- `npm test`: 1,576 passed, 706 skipped; no isolated test database was supplied.
- `COMPONENT_TEST_PORT=31505 npm run test:components -- tests/components/staff-navigation.spec.ts --workers=2`:
  8 passed on desktop Chromium and mobile Chromium. Covers light/dark,
  keyboard operation, hidden controls leaving tab order, preserved input,
  content width recovery, selection/navigation, Escape and focus recovery,
  viewport changes, three locales and referee layout.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Prettier and `git diff --check`: passed.

The browser fixture uses actual components, styles and translations with
synthetic editions and simulated route changes. Representative expanded and
collapsed desktop/mobile screenshots were visually inspected. It does not
exercise server authorization or real account navigation. Full application/DB
E2E and the full appearance/browser matrix were not run.

The final commit and actual CI status are recorded on
[#705](https://github.com/OCLR-dev/OCLR-website/issues/705). Implementation and
local checks do not establish a deployment or release acceptance.
