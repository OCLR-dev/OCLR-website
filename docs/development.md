# Development guide

Use Node.js 24 LTS (minimum 22.13.0), npm, and the checked-in lockfile. Choose an existing local database, the Docker demo, or the [read-only remote frontend](remote-development.md). For live hosting, see the [deployment runbook](deployment.md).

## Local development

With an existing local PostgreSQL instance, keep any existing environment file and configure the connection in `.env.local` from [`.env.example`](../.env.example):

```sh
npm ci
test -f .env.local || cp .env.example .env.local
# Set DATABASE_URL for your local development database before migrating.
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Configure OAuth below when testing sign-in or account workflows. Keep database credentials, environment files, uploads, and dumps outside version control.

## Local frontend database and demo content

For a fresh checkout with Docker and no `.env.local`, unset exported database URLs and run:

```sh
npm ci
npm run db:local
npm run db:migrate
npm run db:seed:dev
npm run dev
```

`db:local` creates PostgreSQL 17 in `oclr-frontend-postgres` on `127.0.0.1:55434`, with database `oclr_frontend_test` and Docker volume `oclr-frontend-postgres-data`. It creates a private `.env.local` (mode 0600) and preserves any existing file. Use `docker stop oclr-frontend-postgres` to stop the container and `npm run db:local` to restart it with the same data.

The seed requires the demo host, port, and database name, with matching `DATABASE_URL` and `OCLR_DEVELOPMENT_DATABASE_URL`. It accepts the legacy matching `TEST_DATABASE_URL` for existing demo configurations. The seed refuses production mode and preserves saved demo edits. Open `/tournaments/dev-s11` or `/tournaments/dev-archive` for synthetic data. Use a separate database for automated fixtures. They explicitly reject this preview database.

## Phone and LAN preview

On a trusted network, start the dev server with the host's private IPv4 address as `APP_URL`. Open that same origin on the phone so asset loading and same-origin writes use the correct host.

```sh
APP_URL=http://192.168.100.31:3000 npm run dev
```

Restart after changing `APP_URL` or `next.config.ts`. The server exposes development source and preview data to reachable devices. Restore the loopback origin after previewing. Sign-in requires an OAuth callback registered for the exact LAN origin. Remote mode requires loopback and production requires HTTPS outside loopback.

If a cached 308 causes `ERR_TOO_MANY_REDIRECTS`, try a private browser window or clear that origin's cached data. If the page reloads without a redirect and the console shows `HMR hash mismatch`, stop the dev server, clear its generated `.next` build directory, and restart.

## osu! authentication and PostgreSQL

Set `APP_URL`, `DATABASE_URL`, `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`, the verified bootstrap `ADMIN_OSU_IDS`, and one approved Admin's numeric ID as `PRIVACY_CONTACT_OSU_ID`. Register exactly `APP_URL/auth/osu/callback` with the [osu! OAuth application](https://osu.ppy.sh/docs/index.html#authentication). The app requests `identify` and uses database-backed sessions. Sign-in and enrollment require a valid privacy contact. See the [privacy contact cutover](deployment.md#privacy-contact-setup) and [production proxy guidance](deployment.md#existing-separate-nginx-example-configuration).

Drizzle loads Next.js environment files through `drizzle.config.ts`. An exported `DATABASE_URL` takes precedence. After schema changes, use `npm run db:generate`, review the SQL and snapshots, and commit them together. Run `npm run db:migrate` before starting code that depends on the new schema.

## Checks and hosting

For application changes, use the checks below. For Markdown-only changes, check links, factual consistency, formatting, and `git diff --check`.

```sh
npm run check
npm run build
npm audit --omit=dev
```

For database-backed tests, export `TEST_DATABASE_URL` for a separate disposable PostgreSQL database named with a distinct `test` segment, such as `oclr_test`. The role needs `CREATEDB` for migration-upgrade fixtures. Keep demo, staging, and production targets out of this setup.

```sh
: "${TEST_DATABASE_URL:?Export an isolated test database URL first}"
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
DATABASE_URL="$TEST_DATABASE_URL" npm test
```

For message changes, run `npm run i18n:extract` and `npm run test:i18n` as described in [localization](localization.md). For the CI production audit gate, browser prerequisites, and suites run on request, see [CI coverage](ci.md#local-verification).

After changing a read schema or resource registry, or rebasing or merging `main`, regenerate the [read API contracts and inventory](read-api.md#generating-and-checking-contracts) and commit the result with the source changes. Run `npm run read-api:check` before pushing and regenerate any conflicts in these files.

## Choosing and maintaining tests (#869)

| Behavior                                                                     | Owning test layer                            |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| Calculations, parsers, validation, catalog keys, and ICU parameters          | Unit tests                                   |
| Permissions, publication, transactions, conflicts, and idempotency           | Integration tests with an isolated database  |
| Client state, out-of-order responses, focus, and dialogs                     | DB-free component tests with controlled HTTP |
| Core registration, roles, draft, result publication, or credential workflows | Representative E2E journeys                  |
| Browser-specific interaction, accessibility, or layout regressions           | Focused browser tests                        |

Before adding E2E coverage, explain the missing observable behavior and why it needs a real browser and server. Reuse fixtures for unrelated prerequisites, wait for observable state, and use the viewport supplied by the browser project. Sample shared presentation boundaries once and keep catalog completeness in i18n tests. Merge duplicate checks in both core and full. Record removed cases, surviving coverage, and comparable counts and timings. See the [#869 cleanup record](verification/issue-869/README.md).

## CI browser isolation and execution time

See [CI coverage](ci.md) for the current suite matrix, job isolation, and timing evidence. Run Playwright locally only for requested or browser-specific verification. The DB-free component suite (`npm run test:components`) uses real components and synthetic HTTP responses. It covers client behavior such as the message board, statistics identity handling, and avatar previews under the app's CSP.

## How pages read data

Public server components and API handlers share read services and their authorization checks. PostgreSQL holds edition configuration, profiles, rosters, pools, fixtures, results, and appearance settings. Historical statistics read typed `archive_rel_*` relations while source JSONB and revisions are retained. Authored content lives under `src/content`. See [service and Next.js boundaries](next-service-boundaries.md), [competition service modules](service-modules.md), and [archive storage](archive-relational-queries.md).

Database mode without a configured URL returns an empty tournament list. A configured but unavailable or unmigrated database can fail queries. `/api/health` checks database connectivity. Review the [release checks](deployment.md#deploy-a-reviewed-commit) for migration and launch verification.

## Remote frontend without a local database

Use the [remote setup](remote-development.md) for the loopback-only frontend and compatible OCLR backend. Use the [saved-read contract](read-api.md) and [Developer access](developer-api.md) for direct API clients.

## API performance measurement

Use the [isolated API baseline](api-performance-baseline.md) to compare HTTP, PostgreSQL driver, and Node.js process timings on synthetic data.

## Design and content

Use the [MainSheet reference](design/mainsheet-light/README.md), shared tokens in `src/app/globals.css`, and the [localization and appearance guide](localization.md). See the [season theme designs](design/season-themes/README.md) and [S11 Nebula Bloom](design/nebula-bloom.md) for artwork and implementation notes. Reference dates, rules, and statistics are illustrative.

## Liru tournament chat

After applying the normal PostgreSQL migrations, set `OCLR_CHAT_BASE_URL` (for example `https://provider.example/v1`), `OCLR_CHAT_MODEL` (for example `example-chat`) and the provider's server-side `OCLR_CHAT_API_KEY`. The endpoint must support streaming Chat Completions. An HTTP loopback endpoint can be used for local models, and the key can be omitted for a provider that needs none. Remove the base URL or model and restart the app to disable chat. Use the normal approved runtime environment for service configuration.

Open a published tournament overview and select **Ask Liru**. Visitors sign in with the existing osu! flow and return to that edition. The assistant uses the same public sources for every signed-in account. The browser keeps the conversation in memory. Each request sends up to four recent questions and selected public excerpts to the configured provider. The app stores no conversation transcripts. The API allows eight requests per account per minute per server process, limits questions to 1,500 characters, and cancels model generation on disconnect or after 30 seconds.

Rules are split into overlapping excerpts with links to the original chapters. The edition-specific index in `chat_rule_indexes` is rebuilt on demand when the current published source fingerprint changes. To rebuild from scratch, delete that edition's derived row in a maintenance session. Its next question recreates it from the published page data. Fixtures, published scores and mappools are read at request time. Retrieval uses multilingual keywords and requires no embedding service. Chat is disabled in remote development mode.
