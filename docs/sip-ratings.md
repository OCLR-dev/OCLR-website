# Daily S11 SIP ratings

The S11 player directory and saved read API use the total `rating.value` from
Skill Issue's `GET /ratings/{osuId}`. The worker checks the returned
`playerId`, then stores only the osu! ID, the finite rating and the fetch time
in PostgreSQL. It looks up accepted registrations in the published S11 edition.
Page loads, filters and remote frontend reads make no requests to Skill Issue.
Existing SIP CSV rows are retained for history; they no longer supply this score.

The daily job sends requests serially, with at least one second of delay before
each request. A PostgreSQL session lock prevents simultaneous jobs on the same
database. Successful and missing ratings are checked at most once per UTC day;
a manual rerun can finish players skipped after a failure. Timeouts, invalid
payloads and other temporary errors preserve the last good rating. A 404 or a
valid response with a null rating records a missing rating. A 401, 403 or 429
stops the run without retries. Run a single worker schedule for this token;
independent databases using the same token do not share the lock.

## Operator setup

After the normal reviewed deployment and migration, confirm that the approved
worker DB role can read registrations and edition settings and can select,
insert and update `sip_rating_cache`. Store `SIP_API_TOKEN` in a root-owned
`/etc/oclr/sip-ratings.env` with mode 0600. Keep it out of the web service
environment and source control. The service sends it only in the `source`
header to `https://skillissue.app` and rejects redirects.

The optional [service](systemd/oclr-sip-ratings.service) and
[timer](systemd/oclr-sip-ratings.timer) follow the Rocky deployment layout.
Review the Node and release paths for the intended host. From a trusted
installer checkout, an authorized operator can run:

```sh
sudo install -o root -g root -m 0644 docs/systemd/oclr-sip-ratings.service /etc/systemd/system/
sudo install -o root -g root -m 0644 docs/systemd/oclr-sip-ratings.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/oclr-sip-ratings.{service,timer}
sudo systemctl daemon-reload
sudo systemctl start oclr-sip-ratings.service
sudo systemctl enable --now oclr-sip-ratings.timer
sudo systemctl list-timers oclr-sip-ratings.timer
sudo journalctl -u oclr-sip-ratings.service -n 20 --no-pager
```

The first run populates the cache; afterward the timer runs daily at 04:00 UTC
(12:00 Asia/Taipei). Count-only output reports pending, updated, missing and
failed lookups and whether the worker stopped early. Check that the public S11
list shows ratings after this run. ETX continues to use the Admin CSV import.

For local verification with an isolated database, export its `DATABASE_URL`
and use `npm run db:refresh-sip-ratings -- --dry-run`. This counts pending
players without contacting Skill Issue or writing. `--apply` additionally
requires the provider token and should be used only on the intended database.
