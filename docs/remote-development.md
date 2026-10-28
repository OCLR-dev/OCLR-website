# Remote frontend development (#270–#272)

Use the existing Next.js application against a separate OCLR backend. The agreed
**saved-read frontend** needs no local PostgreSQL, migrations, seed, OAuth app,
provider credentials, Python or upload directory. Backend data and authorization
remain authoritative. Database mode remains available for developing commands and
running the existing synthetic workflows.

## Fresh frontend checkout

Tournament rules are displayed on each current or historical edition's overview
at `#rules`. Legacy `/tournaments/{edition}/rules` links only redirect to that
edition's overview or a recognized chapter there; they are not a separate content
page. Anonymous and Developer reads use the same publication boundaries.

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
create short-lived access bound to the exact local origin. Paste it once into the
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

An operator must separately provide a configured OCLR backend with saved data,
its existing PostgreSQL and durable media storage where applicable. Apply the
existing migration history through `0043_contributor_directory` for this batch,
including `0037_developer_api_access`. #271–#272 add no migration. Provisioning that backend is
not part of a frontend checkout and does not authorize a deployment or real grant.

The full-site adapter requires read contract **1.2.0 or a newer additive v1
version**, exposed as `X-OCLR-Read-Contract`. The OpenAPI document reports the same
version. Missing/older/incompatible successful responses produce
`REMOTE_INCOMPATIBLE`, with no local fallback. The backend operator must allow the
exact local origin in `OCLR_DEVELOPER_ORIGINS`; a proxy must preserve the contract
and CORS headers. See [Developer access](developer-api.md).

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

The existing public, historical and private components are reused: public
information/news/wiki/privacy, every tournament section, saved profiles/ratings,
global administration and edition workspaces, the actual subject's dashboard,
registration/team/Captain pages, and approved OBS/presenter snapshots. Historical
statistics and MP reviews consume saved source evidence. Current edition profiles
keep their existing `/players/{osuId}?edition=...` links; the nested historical
profile and staff routes retain their original archive-only behavior.

Missing, unreleased or unavailable records keep the existing empty/not-recorded
or authorization state. A Captain room without an actual appointment remains
denied. No read creates records, setup state, locks, imports, cached provider
claims or publications. Commands, uploads, reactions and provider refreshes are
disabled; forms retain their existing structure with read-only controls. Developer
plus Admin/Mappooler/Referee roles still cannot write through this channel. Ordinary
database-backed sessions keep their independent original capabilities.

Local locale, theme and appearance preferences remain separate cookies. Connection
POST/DELETE is local credential management, not a business write. Use the backend
site for real login/logout and credential management. None of these mechanisms
bypass edition appointments or publication boundaries.

Bundled public assets under `/branding/`, `/archive/`, `/fonts/`, `/mascot/` and
`/themes/` are served by the local frontend in remote mode. The four registered
season designs use their shipped `/themes/` images without a backend read or a
Developer connection. Asset requests still pass the exact-host, cross-site,
read-only method and credential checks; unknown page/API routes retain their
existing restrictions. Regression tests derive the season image inventory from
the four production stylesheets and check GET/HEAD against the actual files.

## Request and credential lifecycle

The BFF stores the credential only in a bounded process-memory map behind a random
HttpOnly, SameSite=Strict local cookie. At most 50 connections exist per process;
access expires within one hour and no later than the backend token/parent session.
The connection endpoint accepts at most 1 KiB and 20 connection attempts/minute.
Reconnect rotates the ID and reloads the application. Disconnect, expiry, backend
auth rejection or process restart removes access. Never put tokens in files,
environment variables, URLs, browser storage, React props, screenshots or logs.

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
whole route repeatedly; checks back off to 60 seconds, or honor `Retry-After` for
429. Recovery refreshes once to clear server-rendered errors. Individual page read
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

| Result                                            | Action                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Disconnected / process restarted                  | Open `/remote` and reconnect or explicitly select anonymous mode.                                |
| 401 / expired or revoked                          | Issue fresh access on the backend; check the parent login session.                               |
| 403                                               | Check the live Developer grant, requested scopes, bound origin and actual edition appointment.   |
| `REMOTE_INCOMPATIBLE`                             | Update the separate backend to read API 1.2.0+ within v1 and preserve its contract header.       |
| Missing saved profile / historical “Not recorded” | These are saved-data states; a GET cannot refresh or invent a profile.                           |
| 409 collection changed                            | Discard the whole collection and restart; the adapter retries one complete read.                 |
| 413                                               | Narrow a supported filter; no truncated response is accepted.                                    |
| 429                                               | Respect `Retry-After` (currently 60 seconds); do not bypass issuance/read quotas.                |
| 5xx / invalid response                            | Check backend availability, migration/configuration and request ID; no local DB fallback occurs. |
| CORS / preflight denied                           | Allow the exact local origin; use `credentials: "omit"` for direct browser Bearer reads.         |

## Verification and remaining external gates

The isolated acceptance harness runs a real database-backed backend separately
from a frontend with empty database/OAuth/storage configuration and a PostgreSQL
connection trap. After building the backend, run:

```sh
PLAYWRIGHT_CHANNEL=chrome TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/oclr_test \
  npm run test:e2e:remote
```

Tests use a dedicated disposable backend database; never use the demo/production
DB. The full-site browser test emits per-page/read-route evidence. Integration
tests cover every domain resource, saved MP/replay evidence, subject/role/scope
boundaries, unchanged business data and denied mutations. Transport tests cover
version mismatch, invalid/oversized data, redirects, session isolation, expiry,
revocation and unavailable upstreams. The ordinary database-mode browser suite and
production audit remain part of batch verification.

The frontend server and browser workers inherit the same monitor file; workers
never truncate it. Its self-test proves that an attempted PostgreSQL connection
is recorded and blocked before connecting. Large browser workloads wait for the
backend's real read windows and use normal token issuance limits; acceptance
does not disable or raise quotas. These waits are part of the test duration.

Commit-specific local results and actual CI status are recorded on #271/#272.
Synthetic local evidence does not establish a real OAuth login, real grant,
external backend deployment or organizer acceptance of new Chinese wording. The
previous organizer-attested #10 rehearsal remains completed independently.
