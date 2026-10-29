# Development guide

Local setup, developer checks, design references, authentication, and database development. For live hosting, production migrations and rollback, use the [deployment runbook](deployment.md).

See [CI coverage and acceptance](ci.md) for required checks, full regression,
main protection and the feature-branch workflow.

## Local development

Use Node.js 24 LTS (minimum 22.13) and npm. Run `npm ci`. For database-backed features, copy `.env.example` to `.env.local`, configure `DATABASE_URL`, and run `npm run db:migrate` before starting the app. Run `npm run dev` and open http://localhost:3000. Never commit secrets.

One Next.js App Router application uses strict TypeScript, React and Tailwind CSS. Shared tokens and responsive patterns live in `src/app/globals.css`. Static tournament information works without external services; authentication, registration, teams and live draft data require PostgreSQL. Empty production content stays unpublished until approved by organizers.

## Local frontend database and demo content

For frontend work without an organizer database, use the existing Docker installation:

```sh
npm run db:local
npm run db:migrate
npm run db:seed:dev
npm run dev
```

`db:local` creates a dedicated PostgreSQL 17 container named `oclr-frontend-postgres`, bound only to `127.0.0.1:55434`, with the isolated database `oclr_frontend_test`. It generates private credentials and writes `.env.local` with file mode `0600`; it never reads or overwrites an existing file. An already configured checkout should use its existing connection instead. Exported database URLs must be unset before using the local setup command. Running the command again starts the same container without changing its credentials or data.

Database files live in the Docker volume `oclr-frontend-postgres-data`, outside the repository. `.env.local` is ignored by Git. Never commit database dumps, storage files, local configuration or credentials. Stop this database with `docker stop oclr-frontend-postgres`; restart it with `npm run db:local`. This does not change any other database or running demo/production container.

The explicit `db:seed:dev` command accepts only this loopback port and database name, requires matching `DATABASE_URL` and `OCLR_DEVELOPMENT_DATABASE_URL`, and refuses production mode. It inserts data transactionally and preserves existing demo edits on subsequent runs. It creates two clearly labeled synthetic editions, 28 identities (24 accepted, four pending), four teams, 12 mappool entries, three fixtures and one synthetic published result. Visit `/tournaments/dev-s11` for the populated edition and `/tournaments/dev-archive` for the completed-edition layout. The seed never runs automatically when serving pages and does not modify the real `s11` bootstrap edition. Dates are relative to the first seed run. Profile snapshots are synthetic; no osu! API credentials or real participant records are copied.

The local database is for UI preview. Database-backed automated tests may truncate their target; use a different isolated test database for the full suite. OAuth, account access and real registration still require the organizer-approved configuration described below. No development authentication bypass is added.

## How pages read data

Public App Router pages are server components. For example, `src/app/page.tsx` calls `publicNewsContext()` in `src/lib/public-news.ts`. It reads published editions via `readTournaments(true)` in `src/lib/tournaments.ts`; this queries `edition_state` through `db()` in `src/db/index.ts`. `db()` wraps the shared `pg.Pool` in Drizzle. The server loads `DATABASE_URL` from exported environment variables or `.env.local`; it is never a `NEXT_PUBLIC_` browser variable. The Drizzle CLI loads the same configuration through `@next/env` in `drizzle.config.ts`.

The main sources are:

| Page content                                                       | Source                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Tournament name, branding, registration windows, rules, milestones | `edition_state.configuration` (JSONB), with versions in `edition_revisions`       |
| Participant directory and profiles                                 | `users`, accepted `registrations`, `user_profile_cache`                           |
| Captains, teams and rosters                                        | `captains`, `teams`, `memberships` and their publication flags                    |
| Mappools and beatmap metadata                                      | `tournament_rounds`, `mappools`, `mappool_entries`                                |
| Fixtures, brackets and approved results                            | `tournament_stages`, `fixtures`, `match_results`, `result_revisions`              |
| Appearance default                                                 | `site_settings`                                                                   |
| Authored announcements and historical source material              | Repository JSON under `src/content`; explicit import/configuration where required |

Client interactions call the corresponding `/api/...` route, which reuses the same services and server-side permission checks. Initial page rendering can query these services directly without making a browser API request. The homepage combines database events with authored announcement JSON; it does not scrape the live website. In database mode, a missing `DATABASE_URL` produces an empty tournament list, while a configured but unreachable/unmigrated database can fail queries. Explicit remote mode instead uses the adapter and connection states described below; it never falls back to local database reads. `/api/health` returns HTTP 200 only when a database query succeeds; it does not verify schema migrations or demo content.

## Checks and hosting

Developer API authentication and local cross-origin reads are documented in
[Developer API access](developer-api.md). #268 supplies token management, #269
supplies the saved-data contract, and #270–#272 add the [full saved-read remote frontend](remote-development.md), coverage inventory and consolidated verification.
Check the issues for commit-specific local results, actual CI and organizer review.

`npm run check` runs ESLint, generated route types and TypeScript. `npm run build` creates the production build; `npm start` serves it on a conventional Node.js host. CI runs the same checks. No Vercel services are required.

`npm run test:components` runs the player-message board's desktop/mobile browser
regressions without PostgreSQL or a Next.js build. Install the configured
Playwright Chromium first (`npx playwright install chromium`). The loopback-only
test host bundles actual client components and translations; tests intercept HTTP
with synthetic responses to control request completion order. This checks client
state recovery, not backend authorization or full application E2E. It is a
separate local command and does not expand the fixed core CI browser allowlist.

## Design and content

The committed `docs/design/oclr-website-concept.webp` is a visual reference only. Its dates, statistics, format, identities and expanded tournament name are placeholders. The correct name is **osu! Chinese League Rookie**. Registration is individual; teams are formed through the staff-appointed captain draft.

Public tournament editions now follow the organizer-supplied [MainSheet Light reference](design/mainsheet-light/README.md): lavender surfaces, horizontal section navigation, artwork-led overview, match card/compact views, visual mappools with map details, team browsing and an indexed rules handbook. Admin, private Player/Captain tools and OBS retain their existing layouts. Reference sample teams, dates, scores and rules are never production tournament content. Localization is tracked separately in [#72](https://github.com/PhoenixEmik/OCLR-website/issues/72).

Global Admins set the site default at `/admin/settings`. Visitors can follow that default or select the original, cute-pastel, swiss-minimal, claymorphism, manga-halftone, glassmorphism, esports-broadcast, retro-arcade, Frutiger Aero appearance in the header, independently of light/dark. Explicit personal choices take priority; “Use site default” clears the override. Settings are stored in the singleton `site_settings` row with optimistic revisions; transactional `site_setting_events` appear in the central audit browser, visible only to global Admins. The next server request reads the saved default without redeployment; a database outage falls back to the original design for public rendering. A whitelisted `oclr-appearance` cookie restores the choice during server rendering across public and private pages; OBS remains isolated. The pastel palette, local Quicksand font and selected presentation styles are adapted from `style/cute-pastel-ui` (9d95608). Tournament defaults follow the current edition as described in docs/deployment.md; no automatic preference cookies, stage-completion inference or mappool workflow changes are introduced.

The optional Swiss minimal design adapts style B (Swiss / Editorial) from the organizer-provided osu! Cup preview: black/white materials, thin rules, square controls, large headings and a red accent. `src/app/swiss-theme.css` scopes the design to `.themed-site`, including both brightness modes; broadcast output is isolated. It uses the existing local sans stack without third-party font requests. Migration `0027_swiss_minimal_appearance` expands only the site setting/audit appearance check constraints; existing defaults and history remain valid. Apply migrations before selecting Swiss as a site default. An older application does not understand the new value: select a supported site/tournament default before a deliberate rollback; do not delete audit history or down-migrate a live database.

The optional Claymorphism design (#237) adapts style E from the organizer's second osu! Cup preview batch: warm putty surfaces, 24px panels and 18px controls, a raised clay material on the hero, real buttons and popovers, pressed-in wells for inputs, progress and selection tracks, and a small-area mint selected state. Tables and repeated rows stay flat. Its palette is deliberately warmer than cute-pastel so the two remain distinct preferences. Borders, dashed disabled edges and focus rings carry every state without shadows; the dark variant builds depth from darker drops and a faint rim light instead of inverting the pinks. `src/app/clay-theme.css` scopes the design to `.themed-site`; real buttons pick up the material through the optional `--site-button-shadow` token, which every other appearance leaves unset. Headings reuse the bundled Quicksand; there are no remote font requests. Migration `0038_claymorphism_appearance` expands only the site setting/audit appearance check constraints, with the same rollback guidance as Swiss.

The optional Manga halftone design (#238) adapts style F from the same batch, using the organizer's candidate palette: white paper, ink `#171515` and a magenta accent, with a pink screentone used only as decoration. Ink lines follow a hierarchy with 2px square corners: 3px for the hero banner and large sections, 2px for controls, menus, selection tracks and repeated cards, and 1px for table rows, whose headers become a black caption band. English display titles, page eyebrows and map slot labels use the bundled Bangers font (SIL OFL 1.1, Latin `unicode-range` only, no weight synthesis); Chinese stays on the system sans at 700. The edition overview is laid out as a manga page: the title, artwork and stage wheel are separate ink panels with narrow gutters, the title panel has a cut corner and its speech bubble breaks the panel frame. Balloons follow manga conventions: speech bubbles for page eyebrows and status notices, a shout burst for the current phase, thought balloons for empty states and a narration box for the rules contents. The artist's tools appear as decoration: size-graded halftone inside the title panel's cut corner (never over the artwork), line-tone hatching as the shade of tournament cards, a speed-line strip under page titles, a tapered G-pen stroke under section headings and a pen nib with a drop of ink on the footer rule; these never sit behind text and ignore the pointer. Selected tabs, the current header section and checked menu items are inverted ink cells, disabled controls are dashed and focus is a 3px ring with a 4px offset, so no state depends on the pink print offset. The source's rotated buttons and per-value heavy frames are not carried over. The dark variant draws with warm-white ink (`#e9dccb`) instead of pure-white frames. Like Claymorphism, the homepage header follows this design only when it is selected. `src/app/manga-theme.css` scopes the design to `.themed-site`; there are no remote font requests. Migration `0039_manga_halftone_appearance` expands only the site setting/audit appearance check constraints, with the same rollback guidance as Swiss.

The optional Glassmorphism design (#240) adapts style H from the same batch as layered glass. A fixed, vivid colour field (pink, orange, sky and violet orbs plus a few floating spheres) sits behind one frosted glass board that carries each page's content; lighter glass tiles sit on the board, and solid chips, inputs and menus sit on top. Every pane has a bevelled rim (bright top, dim bottom), a sheen and layered drop shadows, and a thinner sheet peeks out behind the board. Only the header, board and footer use `backdrop-filter`; tiles, tables and repeated rows never blur, and header menus stay solid because a blur nested inside the blurred header cannot see the page. The panes are 50–72% opaque, which deliberately departs from the 94–96% in the issue: contrast was instead checked against the field's most saturated colours, unblurred and with the saturate boost, so every text token stays ≥4.5:1 and control edges ≥3:1 with or without blur, and the sticky header was also checked over black and white content. Without `backdrop-filter` support, and under `prefers-reduced-transparency`, every pane falls back to a solid surface; forced colours hide the field and spheres and remove blur and shadows. Colours are ink text, indigo links and selection, and a glossy hot-pink primary with dark text; the dark variant is smoked glass over a deep field. `src/app/glass-theme.css` scopes the design to `.themed-site`; it uses the system sans stack at 500/600 with no remote fonts. Migration `0040_glassmorphism_appearance` expands only the site setting/audit appearance check constraints, with the same rollback guidance as Swiss.

The optional Esports broadcast design (#235) adapts style A from the organizer's first osu! Cup preview batch as an arena broadcast package. A black bar with fine pinstripes and a 3px magenta rule, ending in a cyan segment and yellow/black hazard tape, tops the page in both brightness modes (including the homepage, whose S11 header palette it replaces only for this appearance). The dark mode is a lit stage (magenta wash over an LED dot grid). The light mode is an independent palette that keeps a dark stage at the top of public pages and the login page: the breadcrumb and tournament navigation, the page title and, on the overview, the top half of the hero sit on a full-width dark band closed by a magenta rule, while content below stays light on the dot grid. The band is a `border-image` outset (no layout change or horizontal scroll) and is dropped under forced colours; private workspaces with sidebars do not get it. Magenta marks interaction and primary actions, which cast a hard offset plate (black in light, cyan in dark) and press into it; cyan marks data and the selected slot (tabs, mod filters, menu choice, map slot plates, scores and the black scoreboard strip of pool totals). Signal yellow appears only on black (hazard tape, the speed-slash tag after page eyebrows), and live red marks the current phase and slot 1 in bracket cards (slot 2 is cyan). Panels use 6px and controls 4px corners, with a magenta corner bracket drawn by the background. Slants, stripes and the hero's corner cut are decorative pseudo-elements with `pointer-events: none` or background layers; button text is never skewed, containers are never clipped and tournament artwork is never recoloured. Event titles use Barlow Condensed ExtraBold Italic, bundled locally under SIL OFL 1.1 (`public/fonts`, one 24 KB Latin woff2), with a Latin-only `unicode-range` so Chinese stays upright on the system sans; body text keeps the system sans at 16px/1.65 and scores use tabular figures. Table heads echo the bar with a magenta underline and alternate rows are shaded. Selected states map to `Highlight` under forced colours, and reduced motion removes transitions. `src/app/esports-theme.css` scopes the design to `.themed-site`; OBS/presenter output is unchanged. Migration `0041_esports_broadcast_appearance` expands only the site setting/audit appearance check constraints, with the same rollback guidance as Swiss.

The optional Retro arcade design (#236) adapts style D from the organizer's first osu! Cup preview batch: a dark cabinet in both brightness modes (black in dark mode, a slightly brighter deep indigo in light mode), yellow, cyan and magenta, square corners, 4px frames, hard offset shadows, pixel type and neon segmented section dividers. Each colour has one job so they never compete: yellow fills the primary action and draws the 4px marquee rule under the header, cyan is the selection cursor, links, focus, the 4px hero frame and the dividers, and magenta is decoration only (hard shadows and small labels). Success, warning and danger keep their own colours. Primary keys use 2px borders with a 4px hard shadow; panels and cards use 2px edges, and table rows stay thin. All text is pixel type: page and section headings combine the unmodified Press Start 2P for Latin with Fusion Pixel 12px for Chinese, and everything else (navigation, buttons, labels, body copy, tables, form fields and authored titles) uses Fusion Pixel. Small text snaps to its native 12px and body copy runs at 16px. Both fonts are SIL OFL 1.1 and bundled in `public/fonts/`, and each page loads only its locale's Fusion file. There are no full-screen scanlines, flashing or looping animation; faint static scanlines appear only in empty states and the footer band. `src/app/arcade-theme.css` scopes the design to `.themed-site`, including the homepage header when the design is selected. Migration `0042_retro_arcade_appearance` expands only the site setting/audit appearance check constraints, with the same rollback guidance as Swiss.

The optional Frutiger Aero design (#239) adapts style G from the organizer's second osu! Cup preview batch as a cross-season material language: a fixed sky-blue-to-mint gradient behind the page, a glossy bright header, 20px panels, capsule controls at least 44px tall, and short map slot codes in blue circles. The primary action is a glossy pink capsule with dark text; the progress bar is a mint capsule rendered explicitly rather than through `accent-color`. Tables and rules stay flat and readable: only panels, the header, the edition heading and the primary action carry a highlight, and repeated data cards and every table row use a plain surface. There is no blur and no floating bubble layer: the only background decoration is a fixed `pointer-events: none` gradient, and the edition heading highlight is a background gradient so it never covers text, the artwork or the focus ring. Text tokens were checked at ≥4.5:1 and control/focus edges at ≥3:1 in both modes, including the blue selected chip's dark label and the pink action. The dark variant is a deep sea-blue with the same pink action and mint progress; forced colours remove the sky, gradients and shadows, and reduced motion removes transitions. Rounded geometry carries the reference style without a new typeface: the system sans stack is reused and no remote font is requested, because the source Varela Round's licence and Chinese coverage were not verified for bundling. `src/app/frutiger-theme.css` scopes the design to `.themed-site`, including the homepage header when the design is selected. Migration `0044_frutiger_aero_appearance` expands only the site setting/audit appearance check constraints, with the same rollback guidance as Swiss.

The S10 Skyline Pop design (#195) is registered as `skyline-pop`, labelled **S10 · Skyline Pop** (晴空未来城／晴空未來城) in edition Admin settings. It uses the approved vivid coastal illustration with cream/sky-blue/pink MainSheet surfaces and an independent night-blue variant. `src/app/skyline-theme.css` and the public `/themes/skyline-pop/coast.webp` asset ship with the application. Migration `0045_skyline_pop_appearance` expands the site setting/audit constraints without changing existing defaults or tournament data. Apply it through the normal reviewed update workflow; rollback requires selecting older supported defaults first, without deleting history or down-migrating. The offline S10 gallery records the earlier design review and does not control the application menu.

## osu! authentication and PostgreSQL

Set `APP_URL`, `DATABASE_URL`, `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`, `PRIVACY_CONTACT_OSU_ID`. Register **exactly** `APP_URL/auth/osu/callback` as the osu! callback, with no extra trailing slash. Follow the [official osu! OAuth documentation](https://osu.ppy.sh/docs/index.html#authentication). Only `identify` is requested. Designate one verified Admin using a positive numeric osu! ID in private `.env.local`; do not copy the bootstrap allowlist. Existing sessions and identities remain intact, but new sign-in and registration fail closed until a valid designated privacy contact is configured. See [privacy contact setup](deployment.md#privacy-contact-setup) when upgrading from the email setting. Neither OAuth access nor refresh tokens are stored; identity is refreshed on login. No password accounts or production test-auth route exist.

Run `npm run db:migrate` after pulling database changes and before starting the updated app. The Drizzle configuration uses Next.js environment loading, including `.env.local`; an explicitly exported `DATABASE_URL` takes precedence. CLI commands default to development environment files; set `NODE_ENV=production` when using production files. Migration `0017` adds `staff_roles.about_published`; missing it causes Staff Management queries to fail. Existing staff stay private after migration. Generate reviewed SQL changes with `npm run db:generate`, commit the migration and snapshots, then apply migrations before deploying application code. Use separate databases and OAuth apps for staging/production, an explicit PostgreSQL transport choice from the deployment guide and HTTPS on the canonical origin. Session cookies are HTTP-only, SameSite=Lax, host-only, and Secure with `__Host-` names on HTTPS. Raw 256-bit session tokens never enter the database; only SHA-256 hashes do. Sessions expire after seven days; logout revokes the current session. OAuth state is one-use, browser-bound and expires after ten minutes. Reverse proxies must redact callback query strings and never log Authorization or Cookie headers.

Database-backed tests require **an isolated database whose name contains `test`**, passed explicitly as `TEST_DATABASE_URL`. Apply migrations there first, then run `TEST_DATABASE_URL=... npm test`. Migration-upgrade tests create and drop isolated temporary databases, so the test role needs `CREATEDB`; never use a production/runtime role. Provider HTTP responses are mocked only inside test files; callbacks, state consumption and sessions use real PostgreSQL. These synthetic tests do not establish live osu! consent/token exchange. The organizer separately confirmed the live OAuth and multi-account rehearsal under #10 on 2026-10-23; preserve that attested evidence without treating it as a test performed by this development session.

## Remote frontend without a local database

For the full agreed saved-read frontend, follow [remote development](remote-development.md):

```sh
npm ci
export APP_URL=http://127.0.0.1:3000
export OCLR_DATA_SOURCE=remote
export OCLR_API_BASE_URL=https://YOUR_OCLR_BACKEND
npm run dev -- --hostname 127.0.0.1
```

A fresh frontend checkout needs no environment file, PostgreSQL, migration, seed,
local OAuth secret or upload directory. An operator separately supplies a backend
with read contract 1.2.0+ within v1, saved data, allowed exact local origin and an
explicit Developer grant when private reads are needed. Connect at `/remote` with
short-lived access, or explicitly select anonymous public reads. Preserve an
existing checkout's local environment files and services.

The [coverage inventory](remote-coverage.json) includes public/historical pages,
staff workspaces, the actual subject's dashboard/registration/team/Captain views,
OBS/presenter reads, protected media and polling. Existing appointment/publication
boundaries remain enforced. Business commands, provider refreshes and uploads are
disabled. Preferences and local connection management remain available.

Use [read API](read-api.md), [OpenAPI](read-api.openapi.json) and
[credential/origin setup](developer-api.md) for direct browser Bearer or existing
Next SSR/BFF integration. This remote mode is separate from the local synthetic
database workflow above, which remains available for command development. The
isolated full-site acceptance harness requires its own disposable backend DB;
it is not a frontend developer prerequisite. Commit-specific results and current
CI are recorded on #271/#272; real grants/OAuth/deployment and Chinese wording
acceptance remain distinct organizer-owned evidence.

## CI browser isolation and execution time

CI builds the production app once after lint/types and unit/integration checks,
then restores that exact build into four Playwright shard jobs and a separate
remote-mode browser job. Each job migrates its own PostgreSQL service; browser
workers remain set to one because the fixtures truncate shared tables. Do not
increase workers against a shared database. Playwright shards whole test files
(`fullyParallel: false`), preserving file hooks and sequential test behavior.

Every regular browser project, including Firefox header coverage, remains in
the four shards. Remote-mode checks run independently so ordinary E2E failures
do not prevent that coverage. Per-shard failure traces/screenshots retain unique
artifact names. The aggregate `check` job requires verification, every shard and
the remote job to succeed; it fails if a dependency fails or is skipped. New
commits cancel superseded runs for the same branch or PR. Runner availability
and the slowest test file still affect elapsed time; compare completed CI runs
before claiming an actual speedup.

To reproduce a shard locally after building and migrating an isolated test DB:

```sh
DATABASE_URL="$TEST_DATABASE_URL" npm run test:e2e -- --shard=1/4
```

Run shards sequentially locally, or give each concurrent run a separate database,
server port and storage paths. The default full local command is unchanged.

S9 Glacier Blue (`glacier-blue`, #196) uses the approved Cirno ice-fairy illustration and crystal materials in `src/app/glacier-theme.css`. The footer displays localized Touhou fan-art attribution only with this appearance, including after client-side switching. Migration `0046_glacier_blue_appearance` expands site-setting/audit constraints without changing defaults or history. This historical migration preserves existing site/audit values; #445 permits new S9 choices only in tournament settings; select a supported default before rolling back to an older application.

S8 Sakura Circuit (`sakura-circuit`, #197) ships the approved half portrait, refined sakura illustration and user-supplied RULES banner under `/themes/sakura-circuit/`. `src/app/sakura-theme.css` scopes the design to ordinary `.themed-site` pages; the banner uses the existing rulebook cover position. Migration `0047_sakura_circuit_appearance` expands site-setting/audit constraints without changing any defaults or history. This historical migration preserves existing site/audit values; #445 permits new S8 choices only in tournament settings; choose a supported site/tournament default before an intentional older-version rollback.

S7 Graphite Arena (`graphite-arena`, #198) extends the season design with silver/graphite surfaces, fine hexagonal linework and competition-yellow accents. `src/app/graphite-theme.css` is scoped to ordinary `.themed-site` pages; complete original artwork and OBS/presenter isolation are preserved. Migration `0048_graphite_arena_appearance` expands only site-setting/audit appearance constraints. This historical migration preserves existing site/audit values; #445 permits new S7 choices only in tournament settings through the normal reviewed update workflow. Existing defaults, tournament configuration and audit history are unchanged. Before an intentional older-version rollback, choose a supported site/tournament default; never delete history or down-migrate a live database.

### S6 Orbital Pulse appearance (#346)

S6 Orbital Pulse (`orbital-pulse`) adds red/blue surfaces and a static horizontal segmented spectrum, derived from an attributed public music sample. `src/app/orbital-theme.css` is scoped to ordinary `.themed-site` pages; the complete original S6 artwork and OBS/presenter isolation are preserved. Migration `0050_orbital_pulse_appearance` expands only the site-setting/audit appearance constraints. This historical migration preserves site/audit compatibility; #445 permits new S6 choices only in tournament settings. It does not select a new site/tournament default, change publication or rewrite audit history. Before an intentional older-version rollback, choose a supported default; never down-migrate a live database or delete history. See [S6 design and verification](design/season-themes/s6/DESIGN.md).

### S5 Prism Overture appearance (#345)

S5 Prism Overture (`prism-overture`) uses lavender/ink surfaces, 110 irregular prismatic facets and an outlined EB Garamond Italic β embedded in the banner texture. `src/app/prism-theme.css` is scoped to ordinary `.themed-site` pages; the complete original OCLR β artwork and OBS/presenter isolation are preserved. The two static SVG textures and SIL OFL licence are bundled under `/themes/prism-overture/`; no font is loaded at runtime. Migration `0051_prism_overture_appearance` expands only the site-setting/audit appearance constraints. This historical migration preserves site/audit compatibility; #445 permits new S5 choices only in tournament settings. Existing site/tournament defaults, pending archive results and audit history are unchanged. Before an intentional older-version rollback, select a supported site/tournament default; never down-migrate a live database or delete history. See [S5 design and verification](design/season-themes/s5/DESIGN.md).

### S4 Azure Brush appearance (#344)

S4 Azure Brush (`azure-brush`) uses paper-white/ink-blue surfaces, 2–4px geometry and original azure Chinese ink-wash brushwork in the banner. `src/app/azure-theme.css` is scoped to ordinary `.themed-site` pages. The complete original 1728×1080 S4 AVIF and OBS/presenter isolation are preserved. The generated alpha-preserving WebP is bundled under `/themes/azure-brush/`; prompt and provenance are documented with the design. Migration `0052_azure_brush_appearance` expands only site-setting/audit appearance constraints, without changing existing defaults, archive review/publication or audit history. This historical migration preserves site/audit compatibility; #445 permits new S4 choices only in tournament settings. Before an intentional older-version rollback, select supported site/tournament defaults; never down-migrate a live database or delete history. See [S4 design and verification](design/season-themes/s4/DESIGN.md).

## Season theme selection policy (#445)

Season themes are available only in edition Admin settings. Header choices and
site-wide defaults accept only `publicAppearances`; valid public visitor choices
still override edition defaults. Old season cookies are ignored and expired;
legacy season-valued site settings render as `default` without rewriting data or
audit history. No migration is needed. See the [selection and compatibility
policy](localization.md#season-theme-selection-policy-445) for route inheritance,
explicit repair of old global values, remote reads and broadcast isolation.

S1 Chromatic Origins (`chromatic-origins`, #417) uses the approved ink-diffusion banner and independent light/dark MainSheet tokens. Migration `0054_chromatic_origins_appearance` expands only site-setting/audit constraints. Existing defaults and tournament data remain unchanged; select an older supported default before reverting application code. See [S1 design](design/season-themes/s1/DESIGN.md).

### S3 Frost Waltz appearance (#343)

S3 Frost Waltz (`frost-waltz`) uses snow-white/blue-grey surfaces and the approved crystalline snowflake waltz banner. `src/app/frost-theme.css` is scoped to ordinary `.themed-site` pages; original 995×621 artwork and OBS/presenter isolation are preserved. The two static SVG textures are bundled under `/themes/frost-waltz/`. Migration `0055_frost_waltz_appearance` only expands site-setting/audit constraints. This historical migration preserves site/audit compatibility; #445 permits new S3 choices only in tournament settings. Existing defaults and audit history remain unchanged. Before intentionally rolling back to older code, select defaults supported by that version; never down-migrate live data. See [S3 design and verification](design/season-themes/s3/DESIGN.md).

The DB-free component browser host also covers all six statistics views with
same-name player/team identities (#439), and the actual TeamEditor under the
application proxy's CSP (#440). Avatar checks assert successful image decoding
and object URL release on replacement, removal, cancel/Escape and unmount. The
host supplies only synthetic data and a minimal router context; these checks do
not replace authenticated application E2E, backend permissions or storage tests.
The fixed daily core browser allowlist is unchanged.


The persistent `oclr_frontend_test` preview is explicitly rejected by the shared
destructive-test guard, regardless of host alias or encoded database name (#454).
New `db:local` configurations write `OCLR_DEVELOPMENT_DATABASE_URL` as the seed
confirmation, never `TEST_DATABASE_URL`. Set `TEST_DATABASE_URL` only for a separate
disposable target such as `oclr_test`. Existing environment files are preserved:
the seed alone can still accept their legacy matching preview `TEST_DATABASE_URL`,
but automated tests reject that target before connecting. No preview database is
renamed, recreated or cleared by this change.

Registration CSV exports use one read-only repeatable-read snapshot for staff
scope, list/count, saved profile batches, answers and fixed submitted question
revisions (#452). The concurrency regression pauses real PostgreSQL reads at both
list-to-answer and answer-to-revision boundaries, commits a normal reapplication
on a separate connection, then checks complete old/new attempts without mixing.
