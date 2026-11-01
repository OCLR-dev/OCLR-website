# #694 local verification — 2026-11-02 (Asia/Taipei)

Base: `8da7605d3cd4426d92f8596b8c5989ec400a9b3e`, branch
`codex/694-osu-country-flags`. See [asset source and integration inventory](../../country-flags.md).

- Node.js **24.22.2**, npm, existing lockfile; `npm ci` completed.
- `npm run check` passed. Lint and typecheck were also run after the final test configuration additions.
- Fresh isolated PostgreSQL 17 database `oclr_694_test`, migrated explicitly on loopback port 25494. No existing local environment or database was used.
- `npm test`: **264 files passed; 2,280 tests passed, 2 skipped**.
- `npm run build`: passed with Next.js 16.4.2.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Focused Chromium component tests: 4 passed (desktop/mobile error and geometry cases before adding the appearance matrix).
- Final `npx playwright test --config playwright.country-flags.config.ts --project desktop-chromium --project desktop-webkit --project mobile-webkit`: **9 passed**. Covers `en`/`zh-Hans`/`zh-Hant`, light/dark, 1280px desktop and 320px/375px mobile, default/cute-pastel/swiss-minimal, inert invalid codes, blocked external requests, asset-error fallback, re-render without retry, code changes and long player names.
- **Firefox remains unverified:** all 3 cases failed before page creation because the installed browser reported `Could not find profile folder.` Retried with `/private/tmp` for the temporary profile and with a fresh task-local Firefox 157.0 (Playwright v1555) download; the same launch error persisted. This is not a passing Firefox run.
- Served the production build on a separate loopback port and requested **all 259 flags**: each returned HTTP 200, SVG MIME type, the expected public static cache policy and its original SHA-256. This verifies packaged local assets without external flag hosts.
- Verified the downloaded upstream tarball against its pinned SHA-512; unit tests verify every committed SVG against the public SHA-256 manifest and native 36×36 viewBox.
- `git diff --check`: passed. No interface message keys/catalogs changed; the full test run includes existing i18n checks.

These are local synthetic checks, not deployment or organizer acceptance. Full-site browser regression was not run. Commit-specific CI is recorded in the issue after pushing.

## Representative screenshots

The fixtures render the actual `CountryFlag`, `PublicPlayerIdentity` and
`CaptainPlayerCard` with synthetic identities, blocked external avatar URLs and
real application styles. The compact sample panel checks rectangular,
nonrectangular and special-region artwork; it does not claim new country fields
exist in directory or leaderboard contracts.

[Desktop, light, Chromium](desktop-light.png) · [320px mobile, dark, WebKit](mobile-dark.png)
