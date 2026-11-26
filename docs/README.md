# OCLR documentation

Project overview and setup choices are available in [English](../README.md), [简体中文](../README.zh-Hans.md), and [繁體中文](../README.zh-Hant.md).

## Develop and operate the site

- [Development](development.md) covers local setup, synthetic data, OAuth, and isolated tests.
- [CI coverage](ci.md) describes the checks, core and full suites and how to verify a run.
- [Deployment](deployment.md) covers Rocky Linux, PostgreSQL, Nginx, migrations, updates, and recovery. [Backup operator](../operator/README.md) covers encrypted database exports and isolated restore.
- [Next.js and service boundaries](next-service-boundaries.md) and [competition service modules](service-modules.md) cover request handling, authorization, and transactions.
- [Performance baselines](api-performance-baseline.md) cover HTTP and database timing, with separate guides for [paginated collections](collection-pagination-baseline.md) and [background workers](worker-performance-baseline.md).

## Run a tournament

- [Tournament administration](tournament-management.md) covers editions, registration, roles, and audits.
- [Discord result notifications](discord-result-notifications.md) covers per-edition setup, delivery, and recovery.
- [Competition workflows](competition-operations.md) covers captains, teams, drafts, fixtures, and result review.
- [Mappools](mappools.md) covers beatmap metadata, slot order, candidates, and private Replays.
- [Beatmap similarity prototype](verification/issue-1582/README.md) compares feature vectors with star rating and BPM and reports published pool coverage.
- [Player workspace](player-workspace.md) and [schedule requests](schedule-requests.md) cover practice, availability, and rescheduling.
- [Referee MP sync](referee-mp-sync.md) covers provisional scores and reconciliation. See the [desktop integration design](referee-panel-integration.md) for proposed interfaces and the [rehearsal guide](referee-acceptance.md) for what to verify.
- [Streaming tasks](streaming.md), [Streaming API](streaming-api.md), and [draft broadcast access](draft-broadcast-access.md) cover assignments, Overlay access, and OBS/presenter permissions.

## Integrate with OCLR

- [Remote frontend setup](remote-development.md) describes read-only development against an existing backend. See [coverage and service boundaries](remote-coverage.md) and the [generated inventory](remote-coverage.json).
- [Developer access](developer-api.md) covers grants, credentials, and origins. See the [website permission audit](developer-permissions.md) for direct sessions and delegated reads.
- [Read API](read-api.md) and [OpenAPI](read-api.openapi.json) describe saved-data resources and browser/SSR clients.
- [Liru Discord Bot](liru-discord-bot.md) covers public slash commands and Discord test server setup.
- [Write API inventory and contracts](write-api.md) describes existing browser-session write routes.

## Public pages, design, and ratings

- [Public features](public-features.md) covers news, player profiles, and competition pages. See [player identity](player-identity.md) and [published match details](match-details.md) for data boundaries.
- [Localization and appearance](localization.md) covers language, theme selection, and compatibility. See the [MainSheet reference](design/mainsheet-light/README.md), [season themes](design/season-themes/README.md), [appearance backlog](design/appearance-backlog/README.md), and the proposed [Pick’em player page](design/pickem/README.md) for design work.
- [Country flag assets and attribution](country-flags.md) and [OCL Chess](ocl-chess.md) document their respective public features.
- [OCLR rating model](yumu-rating.md), [SIP ratings](sip-ratings.md), and [background player analytics](background-player-analytics.md) cover formulas, data sources, and saved ranking snapshots.

## Historical data and evidence

- [Season JSON transfer](historical-season-json.md) covers the shared format and transfer workflow.
- [Historical metadata](archive-metadata.md), [beatmap metadata](archive-map-metadata.md), and [historical statistics](historical-statistics.md) describe the saved fields and their public projections.
- [Relational archive reads](archive-relational-queries.md) and [the JSONB inventory](archive-jsonb-inventory.md) cover storage, backfill, and compatibility.
- Season records are available for [S1](s1-archive.md), [S2](s2-followup.md), [S4](s4-archive.md), [S5](s5-archive.md), [S6](s6-archive.md), [S7](s7-archive.md), [S8](s8-archive.md), [S9](s9-archive.md), and [S10](s10-archive.md). See also [S3 bracket reconstruction](s3-bracket-reconstruction.md), [S5 statistics publication](s5-statistics-publication.md), and [S6 match reconstruction](s6-match-reconstruction.md).
- [Issue verification records](verification/) contain evidence for specific changes. [Website release archive](website-release-archive.md) documents historical site captures.
