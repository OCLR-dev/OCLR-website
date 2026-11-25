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
approved live team results where available. It needs the public API origin and
Discord application configuration. Each query reads the current public projection. Individual
registration progress is available through the player's signed-in website
workspace.

## Create the Discord application

Create a Discord application named **Liru** and install it in the intended
server using **Guild Install**. Select `applications.commands` and `bot`.
Liru requires zero guild permissions and zero privileged intents. Copy the
**Application ID**, **Public Key**, and Discord server ID. Have the app's Bot
Token ready when you register `/oclr`.

## Run on the OCLR server

1. On the Rocky application host, create `/etc/oclr/liru-bot.env` as root.
   Use the actual values below and protect the file with mode `0600`.

   ```ini
   LIRU_DISCORD_APPLICATION_ID=YOUR_APPLICATION_ID
   LIRU_DISCORD_GUILD_ID=YOUR_SERVER_ID
   LIRU_DISCORD_PUBLIC_KEY=YOUR_PUBLIC_KEY
   LIRU_OCLR_ORIGIN=https://oclr.example.com
   LIRU_BOT_HOST=192.0.2.20
   LIRU_BOT_PORT=9312
   # Optional for sudo oclr bot register:
   # LIRU_DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
   ```

   Set `LIRU_OCLR_ORIGIN` to the public OCLR site origin. With separate Nginx,
   set `LIRU_BOT_HOST` to the Rocky host's private IP and permit the port only
   from the Nginx host. For Nginx on the same host, use the default listener
   `127.0.0.1:9312`.

2. Run the reviewed [OCLR installer](deployment.md#simple-deployment-and-update).
   Fresh installs use `sudo bash scripts/oclr.sh deploy`. On an existing site
   running an older root-owned installer, use `sudo bash scripts/oclr.sh update`
   from a trusted checkout that contains the daemon setup. The installer creates
   and enables `oclr-liru-bot.service` when it first provisions the unit.
   Subsequent `sudo oclr update` runs switch it with the website's
   `/opt/oclr/current` release. Systemd skips startup until the environment
   file and bot entry point are present. If the environment file is added after
   deployment or the site is already serving the same release, start the unit
   with `sudo systemctl start oclr-liru-bot.service`.
3. On the existing Nginx host, route `POST /interactions` to the daemon on its
   private address and port, preserving the raw request body and both Discord
   signature headers. Use the optional location in the
   [Nginx example](examples/oclr-nginx.conf). In the Discord Developer Portal,
   save the public HTTPS address as **Interactions Endpoint URL**. For the
   OCLR public host, enter `https://oclr.org/interactions`. Discord verifies
   the endpoint with a signed PING.

Use `sudo systemctl status oclr-liru-bot.service` and
`sudo journalctl -u oclr-liru-bot.service` to check the daemon. Use
`sudo systemctl disable --now oclr-liru-bot.service` to disable automatic
startup and stop it. The installer retains existing unit and enablement choices.

## Register the slash commands once

After Discord verifies the endpoint, run this on the OCLR application host.

```sh
sudo oclr bot register
```

The command reads the Application ID and Guild ID from `/etc/oclr/liru-bot.env`
and registers or updates `/oclr` in that server. It uses `LIRU_DISCORD_BOT_TOKEN`
from the same file when configured. Otherwise it prompts once with input hidden.
The token goes to the one-time registration process. The systemd daemon excludes
it from its environment.

If the host has Liru Bot but an older `oclr` command, run
`sudo bash scripts/oclr.sh install-command` from the reviewed installer checkout
that includes `bot register`, then run the registration command. Refreshing the
command this way does not require a site update or restart.

On a development machine with dependencies installed, you can also run
`npm run bot:liru:register` with the two IDs and token in the environment.

For local development, use the same serving variables with
`npm run bot:liru` and forward a public HTTPS test URL to the listener.
`LIRU_OCLR_ORIGIN` also accepts loopback HTTP for a local API stub.

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
and stop or disable the daemon.

See [Discord application commands](https://docs.discord.com/developers/interactions/application-commands)
and [Discord interaction setup](https://docs.discord.com/developers/interactions/overview).
