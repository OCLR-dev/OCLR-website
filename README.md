# OCLR — osu! Chinese League Rookie

[English](README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md)

Official community tournament website for **osu! Chinese League Rookie (OCLR)**. OCLR is a community event and is not affiliated with or endorsed by osu!.

One Next.js App Router application built with TypeScript, React, Tailwind CSS, next-intl, PostgreSQL and Drizzle. PostgreSQL is the source of truth for tournament and account data.

## Features

- Individual registration, configurable questions and eligibility, staff review and staff-assisted enrollment.
- Captain/team setup, live drafting, spectator/OBS views and separately published rosters.
- Mappool editing and official beatmap metadata, plus private staff Replay attachments with a selection lock and Showcase deadline.
- Fixtures, multiplayer imports, reviewed and approved results, brackets, standings, statistics and weekly player awards.
- Tournament archives, news, accepted-player directories, osu! profile snapshots and community information pages.
- Simplified Chinese (default), Traditional Chinese and English; independent light/dark and default, cute-pastel or swiss-minimal appearance choices.

Permissions and publication are enforced on the server. Drafts, private registration answers and Replay files do not become public merely because an edition or mappool is published. See the guides below for each workflow's release rules.

## Quick start

Use **Node.js 24 LTS** (minimum supported version: 22.13.0) and npm. CI uses PostgreSQL 17. With an existing local PostgreSQL database:

```sh
npm ci
cp .env.example .env.local
# Configure DATABASE_URL and any credentials needed for the features you are testing.
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Configure `APP_URL`, `DATABASE_URL`, `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`, `ADMIN_OSU_IDS` and the approved `PRIVACY_CONTACT_OSU_ID` as described in [.env.example](.env.example) and the [development guide](docs/development.md). The osu! OAuth callback must be exactly `APP_URL/auth/osu/callback`. Authentication and registration need the corresponding services and configuration; there is no development login bypass.

### Frontend development without a local database

Use an existing OCLR backend with read API 1.1.0+ within v1:

```sh
npm ci
export APP_URL=http://127.0.0.1:3000
export OCLR_DATA_SOURCE=remote
export OCLR_API_BASE_URL=https://YOUR_OCLR_BACKEND
npm run dev -- --hostname 127.0.0.1
```

Open `/remote` and connect with short-lived Developer access, or explicitly choose
anonymous public reads. A fresh frontend checkout needs no local database,
migration, seed, OAuth secret or media directory. Public/historical pages, saved
staff workspaces, your own applications/team and appointed Captain views retain
the existing publication/identity boundaries. Business writes and provider
refreshes are disabled. See [remote setup and troubleshooting](docs/remote-development.md),
[coverage matrix](docs/remote-coverage.json) and [read API/OpenAPI](docs/read-api.md).
Backend provisioning and real grants remain separate operator responsibilities.

For a fresh frontend checkout with Docker and no existing `.env.local`, the optional local demo workflow is:

```sh
npm ci
npm run db:local
npm run db:migrate
npm run db:seed:dev
npm run dev
```

This creates a dedicated loopback-only PostgreSQL container and synthetic demo content at `/tournaments/dev-s11` and `/tournaments/dev-archive`. An existing configured checkout should keep its current settings. Automated tests need a **different isolated database** because their fixtures can truncate data. See [local demo setup](docs/development.md#local-frontend-database-and-demo-content).

Team images and private Replays require durable storage configured through `OCLR_MEDIA_DIR`; Replay validation also needs **Python 3 with standard-library LZMA support**. See [Replay deployment requirements](docs/deployment.md#private-mappool-replay-storage-185). Never commit local environment files, credentials, uploaded files or database dumps.

## Checks

```sh
npm run check        # ESLint and TypeScript
npm run test:i18n    # Localization checks
npm run build        # Production build
npm audit --omit=dev # Production dependency audit
```

For unit/integration and desktop/mobile Playwright tests, explicitly export `TEST_DATABASE_URL` for a disposable database whose name includes a separate `test` segment, such as `oclr_test`. Do not use the demo or production database:

```sh
: "${TEST_DATABASE_URL:?Export an isolated test database URL first}"
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
DATABASE_URL="$TEST_DATABASE_URL" npm test
npx playwright install chromium
DATABASE_URL="$TEST_DATABASE_URL" npm run test:e2e
```

Playwright serves the production build on loopback port 3100. Use `PLAYWRIGHT_CHANNEL=chrome` with an installed Chrome if needed. See [development](docs/development.md) for test prerequisites. Local checks do not establish the current release's CI or production deployment status.

## Documentation

- [Documentation index](docs/README.md) — all guides and design references
- [Development](docs/development.md) — local setup, checks, OAuth, PostgreSQL and design notes
- [Tournament administration](docs/tournament-management.md) — editions, registration, staff roles and audits
- [Competition workflows](docs/competition-operations.md) — captains, teams, drafting, fixtures and results
- [Mappools](docs/mappools.md) — beatmap metadata, mod slots, publication, editing and private Replays
- [Public features](docs/public-features.md) — news, player directory/profiles, standings and public views
- [Rating model](docs/yumu-rating.md) — yumu-bot attribution, formulas and OCLR adaptations
- [Localization](docs/localization.md) — English, Simplified/Traditional Chinese and appearance
- [Deployment and operations](docs/deployment.md) — Rocky Linux, production updates, migrations, backups and recovery

## Production deployment

The deployment target is **Rocky Linux 10 with systemd**, an **existing separate PostgreSQL server** and an **existing separate Nginx HTTPS proxy**. The scripts do not install replacement database/proxy services. Prepare the approved `/etc/oclr/runtime.env` and follow the [production deployment runbook](docs/deployment.md). From a reviewed installer checkout, use `sudo bash scripts/oclr.sh deploy` for first installation and `sudo oclr update` for subsequent releases.

Use a reviewed commit with passing CI. Updates build a separate release, verify a private backup, apply pending migrations, activate the release and check the exact local/public release. Advanced updates use `bash scripts/update.sh --ref FULL_REVIEWED_COMMIT_SHA --apply` from the documented operator environment. `npm run production:start` serves a prebuilt release without migrations. Never build over the serving release or run development schema push/test fixtures against production.

Use `sudo oclr cleanup` to preview old release cleanup, then `sudo oclr cleanup --apply` to remove eligible versions. The newest 3 releases and the `current`/`previous` targets are retained. See the runbook for retention options and upgrading the installed command.

Artwork and tournament dates shown in [design references](docs/design/) are examples, not approved competition data.

## Collaborators

- [Sonoaoi](https://osu.ppy.sh/users/9755808)
- [Tensorera](https://osu.ppy.sh/users/19204569)

## Contributors

- [qi_e](https://osu.ppy.sh/users/6963321)
- [Muziyami](https://osu.ppy.sh/users/7003013)

## License

Project code is licensed under the [MIT License](LICENSE). Adapted yumu-bot components retain their [Apache-2.0 license](LICENSES/yumu-bot-Apache-2.0.txt) and [attribution](docs/yumu-rating.md).
