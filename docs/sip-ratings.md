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

The existing `oclr.service` runs SIP at the
[daily rating refresh](deployment.md#daily-rating-refresh). Set
`SIP_API_TOKEN` in the protected `/etc/oclr/runtime.env`. The provider
receives it in the `source` header on the fixed `https://skillissue.app`
origin, and the client rejects redirects.

The runtime database role needs read access to published S11 registrations
and edition settings, plus SELECT, INSERT and UPDATE on `sip_rating_cache`.
Check the public S11 list after the first successful run. The job reports
only counts for pending, updated, missing and failed lookups and whether it
stopped early.

For local verification with an isolated database, export its `DATABASE_URL`
and use `npm run db:refresh-sip-ratings -- --dry-run`. This counts pending
players without contacting Skill Issue or writing. `--apply` additionally
requires the provider token and should be used only on the intended database.
