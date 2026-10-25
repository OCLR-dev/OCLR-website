# Development guide

Local setup, developer checks, design references, authentication, and database development. For live hosting, production migrations and rollback, use the [deployment runbook](deployment.md).

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

The explicit `db:seed:dev` command accepts only this loopback port and database name, requires matching `DATABASE_URL` and `TEST_DATABASE_URL`, and refuses production mode. It inserts data transactionally and preserves existing demo edits on subsequent runs. It creates two clearly labeled synthetic editions, 28 identities (24 accepted, four pending), four teams, 12 mappool entries, three fixtures and one synthetic published result. Visit `/tournaments/dev-s11` for the populated edition and `/tournaments/dev-archive` for the completed-edition layout. The seed never runs automatically when serving pages and does not modify the real `s11` bootstrap edition. Dates are relative to the first seed run. Profile snapshots are synthetic; no osu! API credentials or real participant records are copied.

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
supplies the saved-data contract, and #270 adds the [remote core-page frontend](remote-development.md).
Full-site coverage and overall acceptance remain in #271–#272.

`npm run check` runs ESLint, generated route types and TypeScript. `npm run build` creates the production build; `npm start` serves it on a conventional Node.js host. CI runs the same checks. No Vercel services are required.

## Design and content

The committed `docs/design/oclr-website-concept.webp` is a visual reference only. Its dates, statistics, format, identities and expanded tournament name are placeholders. The correct name is **osu! Chinese League Rookie**. Registration is individual; teams are formed through the staff-appointed captain draft.

Public tournament editions now follow the organizer-supplied [MainSheet Light reference](design/mainsheet-light/README.md): lavender surfaces, horizontal section navigation, artwork-led overview, match card/compact views, visual mappools with map details, team browsing and an indexed rules handbook. Admin, private Player/Captain tools and OBS retain their existing layouts. Reference sample teams, dates, scores and rules are never production tournament content. Localization is tracked separately in [#72](https://github.com/PhoenixEmik/OCLR-website/issues/72).

Global Admins set the site default at `/admin/settings`. Visitors can follow that default or select the original, cute-pastel, swiss-minimal, claymorphism or retro-arcade appearance in the header, independently of light/dark. Explicit personal choices take priority; “Use site default” clears the override. Settings are stored in the singleton `site_settings` row with optimistic revisions; transactional `site_setting_events` appear in the central audit browser, visible only to global Admins. The next server request reads the saved default without redeployment; a database outage falls back to the original design for public rendering. A whitelisted `oclr-appearance` cookie restores the choice during server rendering across public and private pages; OBS remains isolated. The pastel palette, local Quicksand font and selected presentation styles are adapted from `style/cute-pastel-ui` (9d95608). Tournament defaults follow the current edition as described in docs/deployment.md; no automatic preference cookies, stage-completion inference or mappool workflow changes are introduced.

The optional Swiss minimal design adapts style B (Swiss / Editorial) from the organizer-provided osu! Cup preview: black/white materials, thin rules, square controls, large headings and a red accent. `src/app/swiss-theme.css` scopes the design to `.themed-site`, including both brightness modes; broadcast output is isolated. It uses the existing local sans stack without third-party font requests. Migration `0027_swiss_minimal_appearance` expands only the site setting/audit appearance check constraints; existing defaults and history remain valid. Apply migrations before selecting Swiss as a site default. An older application does not understand the new value: select a supported site/tournament default before a deliberate rollback; do not delete audit history or down-migrate a live database.

The optional Claymorphism design (#237) adapts style E from the organizer's second osu! Cup preview batch: warm putty surfaces, 24px panels and 18px controls, a raised clay material on the hero, real buttons and popovers, pressed-in wells for inputs, progress and selection tracks, and a small-area mint selected state. Tables and repeated rows stay flat. Its palette is deliberately warmer than cute-pastel so the two remain distinct preferences. Borders, dashed disabled edges and focus rings carry every state without shadows; the dark variant builds depth from darker drops and a faint rim light instead of inverting the pinks. `src/app/clay-theme.css` scopes the design to `.themed-site`; real buttons pick up the material through the optional `--site-button-shadow` token, which every other appearance leaves unset. Headings reuse the bundled Quicksand; there are no remote font requests. Migration `0038_claymorphism_appearance` expands only the site setting/audit appearance check constraints, with the same rollback guidance as Swiss.

The optional Retro arcade design (#236) adapts style D from the organizer's first osu! Cup preview batch: a dark cabinet in both brightness modes (black in dark mode, a slightly brighter deep indigo in light mode), yellow, cyan and magenta, square corners, 4px frames, hard offset shadows, pixel type and neon segmented section dividers. Each colour has one job so they never compete: yellow fills the primary action and draws the 4px marquee rule under the header, cyan is the selection cursor, links, focus, the 4px hero frame and the dividers, and magenta is decoration only (hard shadows and small labels). Success, warning and danger keep their own colours. Primary keys use 2px borders with a 4px hard shadow; panels and cards use 2px edges, and table rows stay thin. All text is pixel type: page and section headings combine the unmodified Press Start 2P for Latin with Fusion Pixel 12px for Chinese, and everything else (navigation, buttons, labels, body copy, tables, form fields and authored titles) uses Fusion Pixel. Small text snaps to its native 12px and body copy runs at 16px. Both fonts are SIL OFL 1.1 and bundled in `public/fonts/`, and each page loads only its locale's Fusion file. There are no full-screen scanlines, flashing or looping animation; faint static scanlines appear only in empty states and the footer band. `src/app/arcade-theme.css` scopes the design to `.themed-site`, including the homepage header when the design is selected. Migration `0039_retro_arcade_appearance` expands only the site setting/audit appearance check constraints, with the same rollback guidance as Swiss.

## osu! authentication and PostgreSQL

Set `APP_URL`, `DATABASE_URL`, `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`, `PRIVACY_CONTACT_OSU_ID`. Register **exactly** `APP_URL/auth/osu/callback` as the osu! callback, with no extra trailing slash. Follow the [official osu! OAuth documentation](https://osu.ppy.sh/docs/index.html#authentication). Only `identify` is requested. Designate one verified Admin using a positive numeric osu! ID in private `.env.local`; do not copy the bootstrap allowlist. Existing sessions and identities remain intact, but new sign-in and registration fail closed until a valid designated privacy contact is configured. See [privacy contact setup](deployment.md#privacy-contact-setup) when upgrading from the email setting. Neither OAuth access nor refresh tokens are stored; identity is refreshed on login. No password accounts or production test-auth route exist.

Run `npm run db:migrate` after pulling database changes and before starting the updated app. The Drizzle configuration uses Next.js environment loading, including `.env.local`; an explicitly exported `DATABASE_URL` takes precedence. CLI commands default to development environment files; set `NODE_ENV=production` when using production files. Migration `0017` adds `staff_roles.about_published`; missing it causes Staff Management queries to fail. Existing staff stay private after migration. Generate reviewed SQL changes with `npm run db:generate`, commit the migration and snapshots, then apply migrations before deploying application code. Use separate databases and OAuth apps for staging/production, an explicit PostgreSQL transport choice from the deployment guide and HTTPS on the canonical origin. Session cookies are HTTP-only, SameSite=Lax, host-only, and Secure with `__Host-` names on HTTPS. Raw 256-bit session tokens never enter the database; only SHA-256 hashes do. Sessions expire after seven days; logout revokes the current session. OAuth state is one-use, browser-bound and expires after ten minutes. Reverse proxies must redact callback query strings and never log Authorization or Cookie headers.

Database-backed tests require **an isolated database whose name contains `test`**, passed explicitly as `TEST_DATABASE_URL`. Apply migrations there first, then run `TEST_DATABASE_URL=... npm test`. Migration-upgrade tests create and drop isolated temporary databases, so the test role needs `CREATEDB`; never use a production/runtime role. Provider HTTP responses are mocked only inside test files; callbacks, state consumption and sessions use real PostgreSQL. Live osu! consent/token exchange requires organizer-owned credentials and remains unverified until staging login/logout with two real accounts is performed.

The versioned saved-data API is documented in [read-api.md](read-api.md), with
[credential/origin setup](developer-api.md) and a generated
[OpenAPI document](read-api.openapi.json). Stage #269 supplies shared backend
read contracts; #270 adds remote core-page development. Full-site coverage and
overall DB-free acceptance remain in #271–#272.

For the stage #270 core-page remote frontend mode, see
[remote-development.md](remote-development.md). It uses `next dev`, a separate
backend origin and an in-memory Developer connection or explicit anonymous mode;
it needs no local database, migration, seed or OAuth secret. The coverage table
identifies remaining #271–#272 work. Production entry points reject this mode.

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
