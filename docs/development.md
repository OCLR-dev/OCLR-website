# Development guide

Use Node.js 24 LTS (minimum 22.13.0), npm, and the checked-in lockfile. Choose an existing local database, the Docker demo, or the [read-only remote frontend](remote-development.md). For live hosting, see the [deployment runbook](deployment.md).

## Local development

With an existing local PostgreSQL instance, install [pgvector](https://github.com/pgvector/pgvector#installation) for that server version. The migration enables the extension when the migration role has permission. Otherwise, have the database administrator run `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;` on the OCLR database first. Keep any existing environment file and configure the connection in `.env.local` from [`.env.example`](../.env.example):

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

`db:local` creates PostgreSQL 17 with pgvector in `oclr-frontend-postgres` on `127.0.0.1:55434`, with database `oclr_frontend_test` and Docker volume `oclr-frontend-postgres-data`. It creates a private `.env.local` (mode 0600) and preserves any existing file. Use `docker stop oclr-frontend-postgres` to stop the container and `npm run db:local` to restart it with the same data.

The seed requires the demo host, port, and database name, with matching `DATABASE_URL` and `OCLR_DEVELOPMENT_DATABASE_URL`. It accepts the legacy matching `TEST_DATABASE_URL` for existing demo configurations. The seed refuses production mode and preserves saved demo edits. Open `/tournaments/dev-s11` or `/tournaments/dev-archive` for synthetic data. Use a separate database for automated fixtures. They explicitly reject this preview database.

### Upgrade an existing Docker preview to pgvector

For the preview created with `postgres:17`, stop it and keep it under a different name. Start the PostgreSQL 17 pgvector image with the same initialized volume. The database credentials and `.env.local` stay in place. Use these commands only for the local preview.

```sh
docker pull pgvector/pgvector:0.8.7-pg17-bookworm
docker stop oclr-frontend-postgres
docker rename oclr-frontend-postgres oclr-frontend-postgres-before-pgvector
docker run --detach --name oclr-frontend-postgres \
  --label org.oclr.local-database=frontend-test-v1 \
  --publish 127.0.0.1:55434:5432 \
  --mount type=volume,source=oclr-frontend-postgres-data,target=/var/lib/postgresql/data \
  pgvector/pgvector:0.8.7-pg17-bookworm
npm run db:local
npm run db:migrate
```

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

For database-backed tests, export `TEST_DATABASE_URL` for a separate disposable PostgreSQL database named with a distinct `test` segment, such as `oclr_test`. Install pgvector on that test server. Migration-upgrade fixtures create their own databases, so the test role needs `CREATEDB` and permission to enable pgvector there, or the test server's default database template must already have pgvector enabled. Keep demo, staging, and production targets out of this setup.

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

To route model requests through a forward proxy, add `OCLR_CHAT_PROXY_URL='http://127.0.0.1:7890'` to the server’s `.env.local` or to `/etc/oclr/runtime.env` on Rocky Linux, then restart the app. Keep the provider’s API address in `OCLR_CHAT_BASE_URL`. The proxy must support HTTP CONNECT. Both HTTP and HTTPS proxy addresses are supported. For Basic authentication use `https://user:password@proxy.example:8443` and percent-encode special characters in the username and password. A blank setting uses the existing connection. If the configured proxy fails, the model request fails without a direct retry.

On any published tournament overview, the Liru button at the bottom right opens the assistant-ui chat window. Closing and reopening it preserves the conversation on that page. Visitors sign in with osu! and return to the open window for that edition. The dedicated `/tournaments/[edition]/chat` page is also available. The assistant uses the same public sources for every signed-in account. The widget and dedicated page share the latest 20 completed question/answer pairs and their citations in local browser storage, keyed by signed-in osu! ID and edition. Clear removes this history for the current account and edition. Reloading restores it without contacting the chat provider. An unavailable local store leaves the active conversation usable. After the account rate limit and edition check, recognizable off-topic requests, direct attempts to change or reveal internal instructions, and long repetitions of one character receive a local scope reminder before retrieval. Blocked turns still count toward the site’s request limit. The next model request omits those messages from its history. Other turns use the configured Chat Completions endpoint. Each request includes the current question, up to three previous questions and their available completed answers, and selected public excerpts. Each previous answer is limited to its first 2,000 UTF-16 code units. Only text is included in the conversational context. Standalone greetings send only the current greeting. The server stores no conversation transcripts. Retrieval uses the current question and the latest eligible prior question. For references to earlier replies, index search can also use the latest eligible answer as search terms. The model uses recent turns to resolve references and checks facts against current public evidence. The API allows eight requests per account per minute per server process, limits questions to 1,500 characters, and cancels model generation on disconnect or after 30 seconds.

The site shell shows the chat launcher when chat is configured and a public edition is available. Tournament pages and a public player profile's edition parameter take precedence. Other pages use the active, upcoming or latest completed public edition. The full chat page and OBS output have their own layouts. Visitors following the launcher’s sign-in link return to the same site page and reopen chat.

Chat reads the current rules, timeline, fixtures and mappools alongside the background season index. Named player questions use the same public identity and saved profile services as the OCLR profile page. A resolved profile needs no vector document or provider refresh. The model receives the selected season’s published participation separately from other seasons and links to the profile. Only the index worker writes the search index. Chat is disabled in remote development mode.

The backend follows the provider and streaming separation used by the [Vercel Chatbot template](https://github.com/vercel/chatbot). The `/api/chat` route checks the osu! session, origin, rate limit and request, then retrieves published evidence for that edition. `chat-answer.ts` turns this evidence into an AI SDK UI message stream for assistant-ui. Both generation and embeddings use `chat-provider.ts` for the configured endpoint, key and proxy.

### Sitewide Liru chat settings

After migration 0121, a global Admin can set the custom prompt under **Site settings → Liru chat settings**. The field accepts up to 3,000 characters, and clearing it restores the built-in behavior. A saved change applies on the next request that generates an answer. The custom prompt supplements the built-in instructions for tone, presentation and terminology, and is sent to the configured model with those instructions. Migration 0123 adds the per-reply output limit in the same form. It defaults to 2,048 tokens for new and existing installations. A global Admin can choose an integer from 1 to 16,384 within the configured model’s own output and context limits. The next chat request uses the saved value. The independent generation timeout still applies. Keep credentials and private information out of the prompt. The site audit records the actor, revision, prompt lengths and output limits while the prompt itself is available in the settings editor.

### Tracing a chat answer

Inspect the browser Network entry for `POST /api/chat`. Both streaming and JSON responses include an `X-OCLR-Chat-Request-Id`. Use it to find the same turn on the application host.

```sh
sudo journalctl -u oclr.service --since '15 minutes ago' -o cat --no-pager | grep -F 'PASTE-REQUEST-ID'
```

`request_rejected` and `request_failed` identify the stage and HTTP status before streaming. `evidence_ready` records the public edition, retrieval time, source count and evidence kind (`greeting`, `verified_count`, `published` or `none`). `embedding_fallback` records when vector search falls back to keywords. `question_blocked` records a fixed reason for locally filtered turns; it contains no message text. `prompt_ready` records the settings revision and whether a custom prompt was present.

`upstream_start` records the provider host and whether the chat proxy is configured. `upstream_http` records the provider HTTP status, response format and time until headers. `upstream_transport_error` includes a recognized network code when available. `first_text` records time to the first text, and `answer_received` records the finish reason, answer length and citation count. The website can return HTTP 200 before the upstream responds.

For HTTP 400, look for an accompanying `invalid_request` event with a recognized `code` or `param`. OpenAI Chat Completions uses `max_completion_tokens` on `api.openai.com`. Other compatible endpoints retain the SDK token limit field `max_tokens`. If the upstream returns 401/403, check the provider key and its model permissions. For 404 check the base URL and model ID, and for 429 check the provider quota and rate limits. If there is no upstream HTTP status, check proxy connectivity and the provider's request history at the same time. An HTTP 200 followed by `empty_answer` or `upstream_error` calls for inspecting the provider's streaming Chat Completions response. `timeout` marks the generation deadline and `cancelled` marks a client disconnect. Logs record structured metadata only. They omit prompt and answer text, request bodies, API keys, proxy credentials and raw provider errors.

The website calculates verified totals for accepted registrations (or players in a historical roster), published teams, fixtures, published results, upcoming fixtures with a scheduled start, mappools and map slots. It sends the exact total, scope and qualifications to the model and attaches the authoritative public source. Repeated beatmaps count once per slot. The model uses a limited greeting prompt for standalone greetings and is instructed to explain missing evidence or ask for clarification when needed. If the provider is unavailable, the client shows the existing retry state. Background embedding jobs use the separate `oclr-chat-index.service` journal.

Examples of questions with verified totals:

| Example                                                    | What is counted                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 一共幾隊？ / How many teams are there?                     | Published teams                                                                                  |
| 賽程還剩幾場？                                             | Upcoming fixtures with a scheduled start                                                         |
| 比賽結果有幾場？                                           | Published match results                                                                          |
| 圖池裡有幾張圖？                                           | Public slots, including repeated beatmaps                                                        |
| 有幾張不重複的譜面？ / How many unique beatmaps are there? | Distinct known difficulty IDs, excluding missing IDs                                             |
| 圖池裡有幾張HD圖？ / How many TB slots are there?          | Slots in the specified NM, HD, HR, DT, FM, TB or historical ACE category                         |
| 已公布的選秀紀錄有幾筆？ / How many draft picks are there? | Picks in the released draft or historical pick list. A final-tier roster alone has no pick count |

### Similar beatmaps and player practice in Liru

Open Liru on a published season. Ask “跨季找 BID 3786810、MOD NM 的相似譜面” or “查 S9 和 S10 的 UID 10260284 技術強弱與練習推薦”. Name one season, a list of seasons, or “本屆” to narrow the scope to the seasons named or currently open. “跨季”, “歷屆”, and a query without a season reference cover all published seasons. The same requests work in Simplified Chinese and English. An explicit follow-up such as “改查 S10” can change the previous technical question's scope.

The server uses the same pgvector ranking and same-game comparison rules as the [#1582 prototypes](verification/issue-1582/README.md). It uses the current public archive or live mappools, matching a similarity seed and candidates within the requested scope. For played scores it uses released archive statistics or the live published result revision and participant checks shared with the public season series. Live scores also have to match the reviewed pool and a currently published slot before they count as comparable. The numeric answers and sources are generated by the server using the existing chat stream.

Similarity reports the unique candidate count and the number of comparable difficulties present in each season. A difficulty used in more than one season can appear in each season's coverage count. Player replies show per-season score coverage, supported strengths and practice priorities, and candidate reasons with references to public results, fixtures and pools. A season without published scores can still contribute published training maps. Missing input, an unpublished or unknown season, unverified difficulty snapshots, and insufficient peer samples are shown as data gaps. Eligible seasons continue to contribute when another selected season lacks data or is withdrawn. The CLI practice snapshot and its optional S9→S10 evaluation remain reproducible.

### Season search and embeddings

The index worker reads the public, edition-scoped projections for overview dates, rules, players, teams, draft picks, matches and results, mappools, statistics, brackets/standings, awards, staff and public predictions. Configure `OCLR_CHAT_EMBEDDING_MODEL` with a model ID supported by the provider’s `/embeddings` endpoint. The worker and queries share the chat base URL, key and proxy. The chat generation model is configured separately. A blank embedding model builds a keyword-only index.

Chat defaults to the open season. Mention a season (for example, “第七屆有幾隊？”) or paste its OCLR page link to select another published edition. “歷屆” and equivalent requests search across published editions with a single query embedding, while keeping the original season labels and validating results against their current public read models. Cross-season count requests provide verified counts per season. Named player questions can use the public profile’s cross-season participation and team results independently of the index.

The players collection uses the same public directory as `/tournaments/[edition]/players`. It indexes individual player records and directory summaries, including saved osu!standard global rank and PP, plus o!TR, SIP and ETX where the directory publishes them. The players index also stores the current public profile’s ETX stars by mod and SIP overall, mod and skillset indicators (rating, SR, PP, global and country rank, model accuracy and combo shares). Missing breakdowns are omitted. Accepted S11 CSV ratings are scoped to S11 and use the same fallback rules as the profile. These are saved profile observations, including on archived rosters. The existing chat index timer picks up changes to the saved data. The [daily rating refresh](deployment.md#daily-rating-refresh) continues to populate the rating caches separately.

The playerMods collection indexes OCLR match history from the profile’s public score sources. Each season’s record keeps actual mod use, slot appearances and mappool-category performance separate. Direct profile questions use the same saved archive statistics and approved live results. MOD draft recommendations compare the requested pool category across public seasons for database-eligible players, with at least three rated maps required for a historical ranking. Effective rating is the player’s score divided by the map average, weighted by rated-map count across seasons. SIP remains separate evidence.

Pasting the selected edition’s player directory URL or asking for a roster ranking reads the complete, current public directory. The answer uses a bounded roster sample or top entries, reports how many players have the requested metric and links to the directory. Whole-directory comparisons use the saved values even when embeddings are unavailable.

After migration 0119, run `npm run chat:index` for the initial backfill. The worker batches changed passages, removes obsolete ones and resumes after a provider outage. Changing the embedding model or provider regenerates the vectors. PostgreSQL indexes multilingual search terms with GIN, stores normalized numeric arrays and performs exact cosine search within the selected edition and model. Before sending a hit to the model, the server matches its fingerprint against the current public projection. Chat uses keyword matches when embeddings are unavailable.

Draft recommendations start with the chosen season’s released pool. A read-only PostgreSQL query verifies current draft-pool membership and accepted, available registration. It excludes appointed captains, active team captains, active roster members and effective draft picks before loading saved ratings. The public pool limits which names can reach chat, and unpublished reasons stay private. Candidate ranking can use a saved SIP skillset such as High AR or a mod such as Hidden (HD). A recommendation does not need vectors or wait for the index timer. General profile and ranking questions can still include captains.

The teams, draft and schedule collections index public page overviews and individual team, pick and match records. Pasting one of these pages from the selected edition reads the current public projection without waiting for the next index run. Unreleased team rosters and draft snapshots are withheld, and schedule evidence uses the match time zones and the start times and results shown on the public schedule. An archived final-tier roster remains distinct from a published pick history.

The mappool collection indexes the public page overview and each published beatmap slot, including the map name, difficulty and saved attributes. Pasting the selected edition’s mappool URL supplies its current overview. Explicit background-image questions use the selected season without requiring a mappool link. The current or preceding mappool URL supplies context for shorthand, and a clarification such as “我說的就是譜面背景” carries forward the preceding visual subject. Verified captions remain usable for keyword matching before their next embedding pass.

After migration 0120, set `OCLR_CHAT_VISION_MODEL` to an image-input Chat Completions model to enable beatmap background search. It may be the same model as `OCLR_CHAT_MODEL` if image inputs are supported. The timer checks up to 16 distinct images per published edition per run, including completed historical seasons. It prioritizes missing descriptions, oldest attempt first, and reserves a check for previously indexed images when available. If a historical slot has only a difficulty ID, the worker uses the public mappool page’s official osu! metadata lookup to resolve the cover. That fallback uses the existing server-side osu! API credentials. The worker analyzes the archived artwork or representative set cover and caches a multilingual description by image, content hash and model. Descriptions cover visible characters, including their hair, clothing, accessories and actions. The embedding model indexes the description. Searches such as “有哪些背景圖有美少女” return matching published maps with those details and sources. The timer regenerates earlier captions in batches and can serve the previous caption from the same provider and model while its image is unchanged and the refresh is pending. Cover art can differ from the original difficulty background. Empty or unavailable images produce no new description. Changes and retries are picked up by later runs. Leave the vision setting empty to disable image requests and artwork results.

Each refresh emits one JSON line with `event: "chat_artwork_progress"` per published season. Counts are per public mappool slot, so two slots can share one image analysis. For active indexing, `completed` counts slots with a saved description and a vector from the configured embedding model, `pending` counts slots still awaiting processing, and `failed` counts slots with a missing cover reference, a failed image or description attempt, or a failed embedding batch this run. `unresolvedSlots` counts the subset of failures without a resolvable cover reference. The worker retries available inputs on subsequent timer runs. With an empty embedding model, successful descriptions are searchable by keywords and remain pending for vectors. A disabled vision configuration logs `status: "disabled"`. A season that cannot be read logs `status: "error"`.

```sh
sudo journalctl -u oclr-chat-index.service -o cat --since today --no-pager | grep chat_artwork_progress
```

On Rocky Linux install the reviewed timer and service from the release and enable the timer as an operator. The first run starts after boot or timer activation. Subsequent refreshes begin 15 minutes after the preceding run finishes. Review the Node path in the unit for the deployed host.

```sh
sudo install -o root -g root -m 0644 docs/systemd/oclr-chat-index.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now oclr-chat-index.timer
sudo systemctl start oclr-chat-index.service
sudo journalctl -u oclr-chat-index.service -n 20 --no-pager
```
