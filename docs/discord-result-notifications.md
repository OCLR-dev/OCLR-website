# Discord result notifications (#1479)

In **Tournament settings → Discord result notifications**, an administrator with
configuration permission for that edition can paste an Incoming Webhook URL from
a Discord text channel, choose the message language, and enable notifications.
Each edition has its own destination. An empty URL field preserves the saved
destination. Select **Remove the saved webhook** and save to clear it and turn
notifications off. Replacing a destination cancels its pending deliveries.

Once a reviewed match result is published, the website queues a Discord message
containing the public season, round, match, teams, score and link. The site
process polls for committed work every ten seconds. It edits the same message
when a correction is published. A result withdrawal removes the score from
the message. A newly enabled destination starts receiving future publications.

## Configure the site

Set `OCLR_DISCORD_RESULT_KEY` to a stable 64-character hexadecimal value in
the site's private runtime environment. Generate the key with
`openssl rand -hex 32` and transfer it directly to the environment or secret
manager. The site uses `APP_URL` for the links in Discord messages. Apply the
release migration before starting the release. The normal Node site process
runs the delivery worker when both the key and site origin are configured.

Webhook credentials are encrypted with this key in PostgreSQL. Keep the key
stable across restarts and releases. If it must be replaced, enter each webhook
again. The tournament settings expose the delivery outcome and number of
deliveries needing review. A server-side Discord outage never reverses a
published result.

## Check delivery

Use a dedicated staging edition and Discord test channel. Submit and approve a
result, then publish it. Compare the Discord score and match link with the public
page. Publish a correction, then withdraw the result. Check that Discord updates
the same message. Disable or replace the destination and confirm that waiting
messages for the old channel are cancelled.

The worker retries safe transient failures and respects Discord's retry interval.
When a request might have succeeded without a response, the delivery requires
review. Check the channel before posting a replacement manually. If a prior
message is gone or its webhook can no longer edit it, use Discord moderation
tools to reconcile that message. Replace the webhook in tournament settings if
the active credential is invalid.

See [competition workflows](competition-operations.md) and
[Discord's webhook endpoint](https://docs.discord.com/developers/resources/webhook).
