# OCLR — osu! Chinese League Rookie

[English](README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md)

Official community tournament website for **osu! Chinese League Rookie (OCLR)**. OCLR is a community event and is not affiliated with or endorsed by osu!.

One Next.js App Router application built with TypeScript, React, Tailwind CSS, next-intl, PostgreSQL and Drizzle. PostgreSQL is the source of truth for tournament and account data.

## Features

- Tournament registration and staff review, captain drafts, and roster publication.
- Mappools and private staff Replays, fixtures, multiplayer imports, and reviewed results.
- Public schedules, brackets, standings, player profiles, historical archives, and OBS views.
- Simplified Chinese, Traditional Chinese, and English, with independent color mode and appearance preferences.

## Quick start

Use **Node.js 24 LTS** (minimum 22.13.0) and npm. Choose a setup for the task:

- [Local demo with Docker](docs/development.md#local-frontend-database-and-demo-content) for synthetic tournament pages.
- [Local development with PostgreSQL](docs/development.md#local-development) for database-backed workflows and OAuth setup.
- [Remote frontend](docs/remote-development.md#fresh-frontend-checkout) for read-only development against an existing OCLR backend.

## Checks

Run `npm run check` for lint and types. See [local verification](docs/development.md#checks-and-hosting) for isolated database tests, builds, and localization checks, and [CI coverage](docs/ci.md) for browser suites.

## Documentation

See the [documentation index](docs/README.md) for tournament operations, API contracts, design, and historical data.

## Production deployment

Follow the [deployment runbook](docs/deployment.md#simple-deployment-and-update) for Rocky Linux 10 with systemd and existing separate PostgreSQL and Nginx hosts.

## Collaborators

- [Sonoaoi](https://osu.ppy.sh/users/9755808)
- [Tensorera](https://osu.ppy.sh/users/19204569)
- [Shi Thi](https://osu.ppy.sh/users/3094900)
- [qi_e](https://osu.ppy.sh/users/6963321)
- [\[SHK\]ShandenYMD](https://osu.ppy.sh/users/13413713)
- [Muziyami](https://osu.ppy.sh/users/7003013)

## Acknowledgments

Thank you to the following projects for providing data to OCLR.

- [Elitebotix](https://github.com/Eliteronix/Elitebotix)
- [SkillIssue](https://github.com/JustRoxy/SkillIssue)
- [o!TR](https://github.com/osu-tournament-rating/otr)

## License

Project code is licensed under the [MIT License](LICENSE). Adapted yumu-bot components retain their [Apache-2.0 license](LICENSES/yumu-bot-Apache-2.0.txt) and [attribution](docs/yumu-rating.md).

Country flag artwork: [Twemoji](https://github.com/discord/twemoji) by Twitter and
other contributors, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The SVGs are used without modification; see [source, licenses and asset inventory](docs/country-flags.md).
