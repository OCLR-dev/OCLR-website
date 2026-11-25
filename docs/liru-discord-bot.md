# Liru Discord Bot (#1462)

Liru lets members of the configured Discord server query published OCLR records
with `/oclr profile`, `/oclr history`, `/oclr tournament`, and `/oclr mra`.
Player arguments accept an osu! username, numeric ID, or canonical osu! player
URL. Season arguments use the last segment of the OCLR tournament URL, such as
`s11`. Replies are visible to the invoking member and include links to the source.
Discord uses the member's language for English, Traditional Chinese, and
Simplified Chinese. Other languages receive the site's Simplified Chinese default.

Liru runs as a separate Node.js process. It uses the website's anonymous
[saved-data API](read-api.md), including the same [MRA v4 snapshot](background-player-analytics.md)
as the website. Season-specific history reads published archive scores or
approved live team results where available. It needs only the public API origin and Discord application
configuration. Each query reads the current public projection. Individual
registration progress is available through the player's signed-in website
workspace.

## Configure a Discord test server

1. Create a Discord application named **Liru** and install its application
   commands in the intended test server. Use the `applications.commands`
   scope. Liru processes signed HTTP interactions and requires zero guild
   permissions and zero privileged intents. Configure the application for
   server installation.
2. Install the locked dependencies with `npm ci`. Set the following values
   in the process environment or secret manager used to launch the service.

   | Variable                      | Used for                 | Value                                                        |
   | ----------------------------- | ------------------------ | ------------------------------------------------------------ |
   | `LIRU_DISCORD_APPLICATION_ID` | Serving and registration | Application ID from Developer Portal                         |
   | `LIRU_DISCORD_GUILD_ID`       | Serving and registration | ID of the test server                                        |
   | `LIRU_DISCORD_PUBLIC_KEY`     | Serving                  | Application public key from Developer Portal                 |
   | `LIRU_OCLR_ORIGIN`            | Serving                  | Public site origin, including scheme and excluding `/api/v1` |
   | `LIRU_BOT_HOST`               | Serving                  | Listener address, default `127.0.0.1`                        |
   | `LIRU_BOT_PORT`               | Serving                  | Listener port, default `9312`                                |
   | `LIRU_DISCORD_BOT_TOKEN`      | Registration only        | Bot token from Developer Portal, supplied as a secret        |

3. Run `npm run bot:liru`. Forward the test HTTPS endpoint's
   `POST /interactions` to the listener, preserving the raw request body and
   both Discord signature headers. Set that URL as **Interactions Endpoint
   URL**. Discord verifies it with a signed PING. For a local API stub,
   `LIRU_OCLR_ORIGIN` also accepts loopback HTTP.
4. With the registration environment, run `npm run bot:liru:register`.
   This registers or updates only the `/oclr` command in the configured server.
   Store the bot token in the registration environment only. The serving
   process uses Discord's per-interaction token to edit the original reply.

The listener checks Ed25519 signatures with Discord's `discord-interactions`
library. It acknowledges valid queries before access to OCLR. One process
permits six queries per member per minute, at most 90 starts per minute and
12 active queries. Failed and missing API reads produce distinct localized
messages. Completed work logs the command, duration, outcome, and whether the
reply was delivered.

## Verify

Run `npm test -- tests/unit/liru-discord-bot.test.ts` for the signed
interaction tests and the mock API acceptance cases. A live test server check
covers all four commands, the three Discord languages, reply visibility,
date rendering and the destination links. Compare a current and archived
player plus a pending MRA with the same records on the running OCLR site.
To remove access in the test server, remove the application from that server
and stop the listener.

See [Discord application commands](https://docs.discord.com/developers/interactions/application-commands)
and [Discord interaction setup](https://docs.discord.com/developers/interactions/overview).
