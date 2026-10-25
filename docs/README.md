# OCLR documentation

The repository root README ([English](../README.md) / [简体中文](../README.zh-Hans.md) / [繁體中文](../README.zh-Hant.md)) contains the project overview, a quick start and common commands. Detailed technical and operational material is organized here by responsibility.

| Guide                                                            | Contents                                                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Development](development.md)                                    | Local setup, checks, authentication, PostgreSQL, design notes                                |
| [Tournament administration](tournament-management.md)            | Edition settings, registration lifecycle, roles, staff reviews and audits                    |
| [Competition workflows](competition-operations.md)               | Captains, teams, draft engine, fixtures, multiplayer import and result review                |
| [Mappools](mappools.md)                                          | Beatmap metadata, slot/order management, publication rules and private staff Replays         |
| [Public features](public-features.md)                            | News, About, players, published profiles, bracket and standings                              |
| [Rating model](yumu-rating.md)                                   | yumu-bot attribution, formulas and OCLR adaptations                                          |
| [Localization and appearance](localization.md)                   | Locale messages, Simplified/Traditional Chinese and appearance preferences                   |
| [Deployment and operations](deployment.md)                       | Host setup, release scripts, database migrations, backup and rollback                        |
| [Design references](design/)                                     | Artwork and UI references (illustrative only)                                                |
| [Appearance design backlog](design/appearance-backlog/README.md) | Unimplemented reference styles, P3 issues, extracted CSS and detailed MainSheet design notes |

**Where to start:** use [Development](development.md) to work locally, [Tournament administration](tournament-management.md) to understand enrollment and permissions, and [Deployment](deployment.md) for running or updating production. Never use production credentials or personal registration records in tests.

## Developer read API and remote frontend

- [Remote setup and troubleshooting](remote-development.md) — fresh frontend without a local DB/OAuth secret.
- [Full coverage and service boundaries](remote-coverage.md), [generated page/module inventory](remote-coverage.json).
- [Read API contract and browser/SSR examples](read-api.md), [OpenAPI](read-api.openapi.json).
- [Developer grant, short-lived access and exact-origin CORS](developer-api.md).

Local synthetic acceptance and actual CI are recorded per commit on #271/#272;
real grants/OAuth/deployment and new Chinese wording acceptance remain separate.
