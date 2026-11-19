# Remote frontend development (#270–#272)

Use the existing Next.js application against a separate OCLR backend. The agreed
**saved-read frontend** needs no local PostgreSQL, migrations, seed, OAuth app,
provider credentials, Python or upload directory. Backend data and authorization
remain authoritative. Database mode remains available for developing commands and
running the existing synthetic workflows.

## Fresh frontend checkout

Use Node.js 24 LTS (minimum 22.13) and the existing npm lockfile:

```sh
npm ci
export APP_URL=http://127.0.0.1:3000
export OCLR_DATA_SOURCE=remote
export OCLR_API_BASE_URL=https://YOUR_OCLR_BACKEND
npm run dev -- --hostname 127.0.0.1
```

Do not copy an environment file or run any `db:*` command for this mode. For an
already configured checkout, preserve its environment files; exported empty
`DATABASE_URL`, `TEST_DATABASE_URL`, `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET` and
`OCLR_MEDIA_DIR` can isolate this frontend process from existing local services.
The database pool refuses remote mode even if a URL is accidentally present.

`APP_URL` is the exact local loopback origin. `OCLR_API_BASE_URL` is a separate
backend origin without credentials, path, query or fragment. HTTPS upstream is
required except for an explicit loopback test backend. Only `next dev` supports
remote mode; production entry points reject it. `.next-remote` keeps development
output separate from the ordinary production build.

Open `/remote`. Sign in on the **backend**, then use its `/developer` page to
create short-lived access that includes your local port. Paste it once into the
local password input. Request `identity:read` and `tournaments:read`; add
`tournaments:private:read` for staff workspaces and `profiles:read` for other saved
private profile snapshots. The subject's own saved profile/applications/team and
appointed Captain room use `identity:read`. A live explicit Developer grant is
required; Admin status or repository access does not imply that grant.

Alternatively choose **Browse public data anonymously**. This explicitly selects
public-only reads. Failed Developer access never silently becomes anonymous.
Local `/login` and `/developer` show connection management. Real OAuth, issuance
and revocation stay on the backend's existing paths.

## Backend prerequisites and compatibility

Use a configured OCLR backend with saved data, its reviewed release's committed migrations, and durable media storage where applicable.

The full-site adapter requires read contract **1.2.0 or a newer additive v1
version**, exposed as `X-OCLR-Read-Contract`. The OpenAPI document reports the same
version. Missing/older/incompatible successful responses produce
`REMOTE_INCOMPATIBLE`, with no local fallback. The local port must be included
in the Developer token and, if configured, the backend `OCLR_DEVELOPER_PORTS` policy (legacy `OCLR_DEVELOPER_ORIGINS` is also
supported). `localhost` and `127.0.0.1` are equivalent at the same port. A proxy
must preserve the contract and CORS headers. See [Developer access](developer-api.md).

## Read coverage and authority

Read API 1.3 adds [known UID profiles and persistent name evidence](player-identity.md).
The frontend negotiates that capability from the current verification response.
Compatible 1.2 backends retain complete cross-edition public aggregation and the
subject's zero-participation identity; persistent provenance needs backend 1.3 and
migration 0049. Failed authorization or transport never selects a fallback.

[The coverage inventory](remote-coverage.json) enumerates all current pages,
layouts/metadata, GET routes and client fetch/poll modules. Its
`requiredVerification` entries state required checks, not test results. See
[coverage implementation and evidence](remote-coverage.md) for service mappings.

Public and published historical pages, saved staff workspaces, the actual subject's dashboard, registrations and team, appointed Captain rooms, and approved OBS/presenter snapshots share their existing authorization and publication rules. The [Player workspace's](player-workspace.md) practice records and season timetable require a direct browser session.

The frontend disables business commands, uploads, reactions, and provider refreshes, including for accounts that also hold Admin or staff roles. Locale, color mode, appearance, and connection management are local. Sign in and manage credentials on the backend.

The frontend serves bundled public assets and generated appearance CSS locally. Protected team avatars and Replays use authorized backend reads through the same local URLs. See [coverage and service boundaries](remote-coverage.md) for routing, resource scope, and inventory.

## Request and credential lifecycle

An HttpOnly, SameSite=Strict cookie points to a process-local connection. At capacity (50 connections), the server reclaims the least recently used anonymous connection, or returns HTTP 503 if all slots belong to Developer connections. Replacing a connection reuses its slot, rotates its ID, and reloads the app. Connection requests are bounded at 1 KiB and 20 attempts per minute. See [credential retention](#remote-credential-retention-465) for storage and expiry.

Each request verifies `/me`; domain reads recheck token, parent session, origin,
scopes and live Developer grant. Request-local memoization deduplicates repeated
SSR/layout reads; route handlers have a separate AsyncLocalStorage cache limited
to one request, so actor checks and polling do not repeat `/me` within that request.
Neither request cache shares private data between requests or sessions. Fetches
still use `no-store`; the development HMR fetch cache remains disabled so it cannot
cache authorization checks.

For UI development, each local connection additionally keeps an **explicit public
snapshot cache** for five minutes. It covers site settings/staff/news/contributors,
tournament summaries/overviews/configuration, public player directories/profiles/
participation and historical statistics. An allowlist excludes private and personal
resources, live draft/OBS, fixtures, messages and binary downloads. A cache hit still
requires current connection verification and the resource's scope; it never turns
failed Developer access into anonymous access. Identity verification itself is not
cached. The public snapshot may lag publication/configuration changes by up to five
minutes; it is a development preview, not a live authority.

Snapshots are isolated per connection, local/backend origin, contract and normalized
resource/query. Each connection retains at most 128 entries / 4 MiB of serialized
JSON and 128 tracked in-flight reads (at most 50 connections). Concurrent identical
reads share one load; returned objects are independent. The in-memory connection
store survives normal HMR, but a server restart requires reconnecting. No snapshots
or credentials are written to files, browser storage or a database. Disconnect,
replacement, expiry and observed revocation discard the corresponding snapshots.
Paginated reads still require an exact total/version; a 409 clears the connection's
public cache and restarts the complete collection, including request-local reads.

Open `/remote` and select **Refresh** to clear your public snapshots and reload;
the next page fetches fresh resources as needed, without issuing a new credential.
This is local cache management, not a backend business write. Changing theme or
appearance remains local; page navigation and server HMR can reuse snapshots.
This is resource caching, not a delta-sync or ETag/304 protocol.

Visible mounted pages check the connection on focus, restoration and every 15
seconds. Checks do not overlap, and focus cannot bypass the minimum interval or
backoff. Transient failures hide page content conservatively but do not refresh the
whole route repeatedly; checks back off to 60 seconds, or honor `Retry-After` for 429. Recovery refreshes once to clear server-rendered errors. Individual page read
errors also provide **Try again**. On 401/403, checks hide content and stop until
reconnection; protected resource reads still enforce their existing authorization.

Only registered relative resources and query keys reach the fixed backend origin.
`/api/v1/...` belongs to that backend; the local remote frontend rejects those
URLs and uses its existing legacy read URLs/local BFF instead.
No browser Cookie/Authorization headers are forwarded. Redirects are refused.
JSON reads have an eight-second timeout and 2 MiB streamed body bound. Complete
player/tournament collections retain consistent versions, exact totals and a
10,000-record/100-page bound, restarting once after 409. Partial lists never render.

Team avatars use the existing local URLs with bounded WebP responses (1 MiB).
Replay downloads retain their authorized local URLs, MIME, filename, sandbox and
`nosniff` headers (8 MiB). Access is checked per request and again after binary
reading. Neither credentials nor storage paths become public asset URLs. No local
storage or provider service supplies missing remote data.

## Troubleshooting

| Result                                            | Action                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Disconnected / process restarted                  | Open `/remote` and reconnect or explicitly select anonymous mode.                                                 |
| 401 / expired or revoked                          | Issue fresh access on the backend; check the parent login session.                                                |
| 403                                               | Check the live Developer grant, requested scopes, allowed ports and actual edition appointment.                   |
| `REMOTE_INCOMPATIBLE`                             | Update the separate backend to read API 1.2.0+ within v1 and preserve its contract header.                        |
| Missing saved profile / historical “Not recorded” | These are saved-data states; a GET cannot refresh or invent a profile.                                            |
| 409 collection changed                            | Discard the whole collection and restart; the adapter retries one complete read.                                  |
| 413                                               | Narrow a supported filter; no truncated response is accepted.                                                     |
| 429                                               | Respect `Retry-After` (currently 60 seconds); do not bypass issuance/read quotas.                                 |
| 5xx / invalid response                            | Check backend availability, migration/configuration and request ID; no local DB fallback occurs.                  |
| CORS / preflight denied                           | Include the local port in the token and server policy; use `credentials: "omit"` for direct browser Bearer reads. |

## Verification and remaining external gates

See the [CI suite matrix](ci.md#events-and-scope) and [isolated browser commands](ci.md#local-verification). The remote harness uses a separate database-backed backend and a frontend with empty database, OAuth, and storage configuration. A shared monitor records and blocks attempted frontend PostgreSQL connections. The full-site suite records per-page and read-route evidence. Backend read limits and token issuance limits remain active.

See [coverage verification](remote-coverage.md) for which tests own each boundary. Report the commit and CI result separately from operator evidence for live OAuth, grants, and deployment.

## Remote credential retention (#465)

The frontend must present the original Bearer credential for every backend read;
`/me` revalidation cannot replace that credential. Connection entries retain only
AES-256-GCM ciphertext, with a random process-only key held separately in a closure.
Plaintext is reconstructed for the active request and is never written to disk,
logs, browser storage or the session cookie. This reduces accidental connection-map
dump exposure; a complete heap dump or arbitrary code execution can still recover
credentials and must be treated as a compromise.

Developer connections expire with the backend credential, without an additional
15-minute frontend cutoff. Explicit anonymous browsing has no timed expiry; its
cookie lasts for the browser session. The local connection endpoint returns
`expiresAt: null` for anonymous access and the backend expiry for Developer access.
A minute timer removes expired Developer entries even while idle; disconnect,
replacement and backend 401/403 clear the cache and overwrite the sealed credential
buffer. Capacity eviction also clears the reclaimed anonymous entry's cache;
anonymous entries have no idle timer. HMR replaces the cleanup timer with the
current module's callback while retaining connections and the vault key. Keeping an old callback can apply an
obsolete expiry policy to new connections (#971).
JavaScript cannot guarantee erasure of transient plaintext strings.
Restarting the frontend discards connections and the process key. Connect again
after a restart or backend token expiry; backend revocation and scopes continue to
be checked via `/me`. An expired Developer connection never falls back to anonymous.

The backend currently issues Developer tokens for at most one hour, capped by the
original login session. This is also a database constraint; removing the local
cutoff does not renew or extend a backend credential. For sustained public UI work,
explicit anonymous browsing needs no token and can remain connected for the browser
session while the local process runs, subject to the capacity policy above.
