# Tournament branding options (#356)

Local synthetic verification on 2026-10-28 (Asia/Taipei), based on main
`d5ca25b2fb569e2deba76b0a2826b956d01a6f6d`.

## Result

- Logo and key-visual selectors now use localized season prefixes. The requested
  S3/S4/S5 labels are consistent, and S5 retains its β identity. The same raw
  S1/S2 prefixes present on this main revision are localized too. Tournament
  names, historical prose and text inside the original images are unchanged.
- The existing S8/S9/S10 assets can be selected as key visuals as well as logos.
  The edition schema, generated extended saved-read contracts and generated
  OpenAPI document accept the same paths. No arbitrary URL/path is admitted.
- Selected workbook artwork uses its own intrinsic dimensions even when the
  edition has a different historical source. S10 remains square. Existing
  `object-fit: contain` previews and historical public images retain all content.
- Saving, configuration revisions, authorization, publication and automatic
  audits use existing services. No migration, asset replacement or automatic
  tournament-setting update is performed.
- **No edition artwork** still saves a null explicit selection. Historical
  source supplementation remains unchanged; a recognized archive may continue
  displaying its existing source image after the explicit choice is cleared.

## Reused assets

These are the same files already used by `src/lib/archive-key-visual.ts`, not new
images derived from their filenames. Their natural dimensions were checked with
Sharp and in the browser. S10's source and unchanged transparent PNG are recorded
in [the S10 archive guide](../../s10-archive.md#original-s10-thumbnail-166).

| Season | Existing public path         | Natural dimensions |
| ------ | ---------------------------- | ------------------ |
| S8     | `/archive/s8/thumbnail.jpg`  | 1920×1080          |
| S9     | `/archive/s9/thumbnail.png`  | 1920×1080          |
| S10    | `/archive/s10/thumbnail.png` | 1024×1024          |

## Browser evidence

All screenshots use synthetic edition settings and the existing built-in images.
The mobile viewport is 320 CSS pixels wide; the desktop viewport is 1440px.
Device pixel ratio can make the PNG itself wider than its CSS element. Public
screenshots include synthetic counts and use an unauthenticated browser context.

| Check                             | Desktop                                  | Mobile                                                                   |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| S5 β labels, Traditional Chinese  | [Preview](desktop-beta-zh-Hant-1440.png) | [Preview](mobile-beta-zh-Hant-320.png)                                   |
| S10 selection / complete previews | [Light](desktop-branding-light-1440.png) | [Dark](mobile-branding-dark-320.png)                                     |
| Saved S8 public visual            | [Light](desktop-public-s8-light.png)     | [Light](mobile-public-s8-light.png)                                      |
| Saved S9 public visual            | [Light](desktop-public-s9-light.png)     | [Light](mobile-public-s9-light.png)                                      |
| Saved square S10 public visual    | [Light](desktop-public-s10-light.png)    | [Light](mobile-public-s10-light.png), [Dark](mobile-public-s10-dark.png) |

The same β selectors in [Simplified Chinese](desktop-beta-zh-Hans-1440.png) and
[English](desktop-beta-en-1440.png) show the three-language naming convention.

## Verification

Node.js 24.22.1, the existing npm lockfile and a new loopback-only PostgreSQL 17
cluster. `oclr_test_356` is isolated from `oclr_test_356_browser`; no demo or
production database, OAuth credential or real tournament record is used.

- `npm ci`: passed (local npm cache, existing lockfile).
- `npm run check`, `npm run build`: passed.
- `npm test`: 169 files passed; 1,352 tests passed, one skipped.
- `npm run i18n:extract` / `npm run test:i18n`: passed, four locale tests.
- `npm audit --omit=dev`: zero vulnerabilities.
- `npm run test:e2e:core`: 28 desktop/mobile tests passed.
- `npm run test:e2e -- tournament-branding.spec.ts`: four desktop/mobile tests
  passed; final screenshot collection also passed all four scenarios.
- Formatting, local evidence links and `git diff --check`: passed.

The new unit tests verify actual asset dimensions, branding validation, configured
artwork on an unrelated historical source, preserved clearing/source fallback,
and refusal of unapproved paths/URLs. Existing drift checks verify that generated
read contracts/OpenAPI match runtime source.

Browser checks cover both selectors' S1–S5 labels in all three locales; S8–S10
previews at 1440/390/320px in light/dark; explicit saves and reloaded values; the
extended Admin workspace and public v1 DTO contracts; anonymous public images
with correct dimensions and containment; an existing S11 selection and clearing.
The original synthetic archive payload remains unchanged after each save.

PR CI runs the ordinary core lanes under [the CI policy](../../ci.md). Its actual
commit-specific status is recorded on the PR/issue; local checks do not establish
full matrix CI, organizer acceptance or deployment.

## Chinese wording review

The following new prefixes apply to both artwork labels through existing
next-intl catalogs. Chinese wording awaits organizer review. The β marker is
preserved as Season 5, without renaming any tournament or source document.

| English prefix      | 简体中文              | 繁體中文              |
| ------------------- | --------------------- | --------------------- |
| OCLR Season 1 —     | OCLR 第 1 赛季 —      | OCLR 第 1 賽季 —      |
| OCLR Season 2 —     | OCLR 第 2 赛季 —      | OCLR 第 2 賽季 —      |
| OCLR Season 3 —     | OCLR 第 3 赛季 —      | OCLR 第 3 賽季 —      |
| OCLR Season 4 —     | OCLR 第 4 赛季 —      | OCLR 第 4 賽季 —      |
| OCLR Season 5 (β) — | OCLR 第 5 赛季（β） — | OCLR 第 5 賽季（β） — |
