# Interface languages and tournament appearance

Interface language follows a valid manual `oclr-locale` preference first, then the browser's `Accept-Language`, with organizer-selected Simplified Chinese (`zh-Hans`) as the final fallback (#330). English (`en`) and Traditional Chinese (`zh-Hant`) are available in the header on public, player and staff pages. The header uses a compact custom language menu with native language names, a checked active option and keyboard/touch controls. Arrow keys, Home/End, Escape and outside-click dismissal follow the account-menu pattern; changing language refreshes the current route and blocks repeat activation while pending. Selecting even the currently detected language saves an explicit preference. The cookie lasts up to one year, is same-site and uses Secure over HTTPS. This cookie carries no identity or permission; every existing server authorization/publication check remains required.

Missing or invalid cookies allow environment detection. Supported language ranges are matched in descending `q` weight (default 1), with header order breaking ties; malformed ranges/weights, `q=0`, wildcards and unsupported languages are skipped. English region variants map to `en`. Chinese `Hans`/`Hant` scripts take precedence over region; without a script, TW/HK/MO map to `zh-Hant` and other Chinese regions or bare `zh` map to `zh-Hans`. Other explicit Chinese scripts are unsupported. Missing headers or no supported match fall back to `zh-Hans`. Detection reads the request only and never writes a preference cookie, so later requests can follow a changed environment until the visitor makes a manual selection. No client-side language detection or geolocation is used.

URLs stay unchanged. Locale prefixes, redirects and rewritten OAuth callbacks are intentionally absent: bookmarks, API routes and `APP_URL/auth/osu/callback` retain their existing meanings. Language preference survives the OAuth round trip. The server renders the selected language, `<html lang>`, page metadata and `Content-Language` on the first response using the same resolver. Pages remain request-rendered (`force-dynamic` in the root layout) with Next.js private/no-store caching; forward `Accept-Language` as well as cookies and do not cache language-personalized HTML at Nginx/CDN, including for visitors without cookies. No alternate-language URLs exist, so no misleading `hreflang` variants are advertised.

`next-intl` supplies server/client messages and ICU interpolation/plurals. Interface code uses `useAppTranslations()` in synchronous/shared components or `await getAppTranslations()` in asynchronous server components. Its small source-message adapter also handles existing English domain errors and controlled status/navigation labels where explicitly rendered. Do not apply it indiscriminately to database strings.

To add a message, write `tr("English source with {name}", { name })`, then run `npm run i18n:extract`. The command registers stable content-derived IDs in `messages/en.json` and adds empty target entries. Fill the corresponding Simplified and Traditional Chinese messages; preserve all ICU parameters and meaningful consent/security wording. `npm run test:i18n` checks key completeness, nonempty messages, ICU syntax/parameter parity and registered source calls. The same tests run in CI. For ambiguous English labels, use an explicit context key (for example `navigation_home` versus the fixture’s “Home”, or `draft_module` versus a draft publication state) in all three catalogs. Ordinary technical names (osu!, OCLR, NM/HD/DT/HR/FM/TB, BPM and IDs) retain their spelling.

Dates and numbers use the selected interface locale. Display dates still use the tournament/fixture’s configured IANA time zone, with that zone explicitly shown; wall-clock inputs and stored UTC instants are unchanged. English service error strings/status codes remain stable on the wire and are translated at their existing interface display points.

Tournament names, descriptions, rules, eligibility disclosures, application questions, team/player identities, staff explanations, authored announcements and beatmap metadata are displayed literally. They have no automatically translated variants. Generated publication/news templates are localized with original names and values interpolated. Any future localized organizer content must be explicitly approved; do not infer rules or consent across languages. The organizer approved the current Chinese wording on 2026-10-22 under #72, explicitly including privacy/consent and competition terminology. Traditional Chinese initially used OpenCC with subsequent targeted wording review. Future substantive copy changes still require organizer review; automated catalog and screenshot checks do not replace that review.

Light/dark follows the visitor's system `prefers-color-scheme` by default (#358). The header's color mode menu offers Follow system, Light and Dark. Only a manual Light or Dark choice is saved, in the independent `oclr-theme` cookie for up to one year; existing saved `light`/`dark` choices stay manual. Choosing Follow system deletes that cookie, and missing or invalid values also follow the system. The chosen mode (`data-theme-preference`) is kept separate from the brightness in effect (`data-theme`); detected brightness is never saved as a manual choice. A small nonce-bearing script in `<head>` resolves `data-theme` before first paint, and while following the system the page updates immediately when the system changes, without a reload. It also records the last observed system brightness in the non-preference `oclr-system-theme` cookie so later server renders and route refreshes start from the right theme. Environments without `matchMedia` support, or with no detectable preference, fall back to light. Switching changes CSS tokens without reloading or changing tournament state. Public, login, Admin, Player and Captain pages share the same preference and design tokens. OBS transparent/opaque output and presenter mode retain their isolated broadcast appearance. Theme classes never grant authorization or change publication boundaries. Do not invert artwork or duplicate page layouts to add colors.

Public News categories use the exhaustive `publicNewsKind` mapping in `src/lib/public-news-model.ts`; never render an internal kind with `toUpperCase()`. Generated titles/summaries translate their surrounding template while retaining authored pool/round/team names. The terminology glossary is Mappool(s) → 图池 / 圖池; Mappooler → 选图 / 選圖; Player pool → 选手池 / 選手池. Unit tests cover every event kind, future labels, glossary consistency and interpolation; browser fixtures cover list/detail/metadata and published-result boundaries in all three locales.

Standard osu! mod names are non-translatable domain labels in every locale: NM — No Mod, HD — Hidden, DT — Double Time, HR — Hard Rock, FM — FM / Free Mod / Force Mod, TB — Tie Breaker. Render them from `categoryNames` / `fmModeNames`; translate surrounding help and errors. Preserve these names inside catalog sentences too. This organizer-approved terminology update is #83; it does not change gameplay settings or the 图池 / 圖池 and 选手池 / 選手池 glossary.

## Staff role terminology

The organizer confirmed the following Chinese role labels on 2026-10-29:
Pooler / Mappooler → 选图 / 選圖; Replayer → 打图录像 / 打圖錄像;
Tester → 图池测试 / 圖池測試; Streamer → 直播; Referee → 裁判.
Staff uses 工作人员 / 工作人員 and Developer uses 开发者 / 開發者.
Translate both directory headings and saved role labels through the same catalogs;
keep stored role codes and authored names unchanged.

## Season theme selection policy (#445)

Visitors and whole-site settings may select only the nine cross-season designs
in `publicAppearances`. Season themes remain registered and available only to an
authorized Admin in the edition's existing **Default tournament appearance**
setting. The explicit public visitor choice still overrides the current edition
default, which overrides the public site default. Light/dark/system is independent.

Old or manually forged season-valued `oclr-appearance` cookies are ignored on the
server and client, then expired by the client provider. A legacy season-valued
site setting renders as `default`; its stored value, revision and audit history
remain unchanged until a global Admin explicitly saves a public design. The site
settings form shows the effective fallback and allows that explicit repair.
The existing database constraints and read contracts continue accepting old
registered values so history and older backends remain readable; new site-setting
writes reject them. No migration or automatic data rewrite is required.

Edition defaults apply only to the current published/authorized edition,
including the edition context on player profiles. Leaving it restores the public
site default or visitor choice; inherited themes never become personal cookies.
Private editions and OBS/presenter output retain their existing boundaries.
This policy supersedes earlier instructions offering season designs in the
Header or as site-wide defaults; historical design verification is not current
selection-policy evidence.
