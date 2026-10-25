# Remote frontend development (#270)

Stage 3 supplies the data adapter and core pages. Full page coverage belongs to
#271; consolidated DB-free acceptance belongs to #272.

## Core read inventory

| Entry                                          | Existing dependencies                                                                        | Remote source / behavior                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Root layout / Header / navigation              | session, staff grants, site setting, edition appearance, featured edition                    | `/me`, `/site`, full `/tournaments`; explicit bearer read scopes, no staff write roles     |
| Home / `/tournaments`                          | public editions, registration state, cards                                                   | full public summaries, recorded registration state                                         |
| Tournament layout / metadata / overview        | edition, draft, teams, pools, staff, fixtures                                                | published `/tournaments/{edition}` and its overview projection                             |
| `/rules`                                       | edition eligibility/rules; historical rulebook                                               | same detail, historical rulebook                                                           |
| `/players`                                     | full identities, saved ranks/PP, public introductions; refresh callback, messages, reactions | full versioned player collection; no refresh; unsupported interactive widgets identified   |
| Existing profile links and `/api/players/{id}` | saved/provider profile, membership, BWS, round ratings                                       | edition-scoped saved profile; historical identity remains recorded; round ratings deferred |
| Historical overview / rules / players / player | archive selection, counts, key visual, rulebook, identities                                  | recorded projections; no present-day profile overlay                                       |
| Internal tournament list / saved configuration | Developer authorization, private edition settings                                            | scope-gated `/staff/tournaments` resources; no admin write roles                           |
| Private media / other routes                   | storage, staff services and further publication models                                       | explicitly unsupported in stage 3; no local storage/DB fallback                            |

The connection page and unsupported-route notice remain accessible without a
connection. No browser/metadata/core SSR path may query local PostgreSQL in remote
mode. Local preference cookies are independent of the remote identity.

## Start without local PostgreSQL

Install the existing Node/npm dependencies with `npm ci`. Do not migrate, seed,
configure DATABASE_URL, or configure local OAuth credentials. In an exported local
development environment, set:

```sh
export APP_URL=http://127.0.0.1:3000
export OCLR_DATA_SOURCE=remote
export OCLR_API_BASE_URL=https://YOUR_OCLR_BACKEND
npm run dev -- --hostname 127.0.0.1
```

APP_URL is the exact local origin; OCLR_API_BASE_URL is the backend origin only,
without a path, query, fragment or credentials. HTTPS upstream is required except
for an explicit loopback test backend. Remote mode works only with `next dev` on
a loopback APP_URL. Production setup/start/update and production Next commands
reject it. Database mode remains the default. `.next-remote` isolates the local
remote development output from the ordinary production build.

Open `/remote`. On the specified backend, use the existing osu! login and
`/developer` to issue a short-lived token with `identity:read`, `tournaments:read`
and any required `tournaments:private:read` / `profiles:read`. The backend operator
must allow the exact local origin in OCLR_DEVELOPER_ORIGINS. Paste the token once
into the local connection form. No local OAuth app, bootstrap Admin or database
is required. Backend issuance still requires an explicit live Developer grant;
repository or Admin status is insufficient.

Alternatively, explicitly select **Browse public data anonymously**. This mode
reads only public projections and never acquires a private identity. It does not
silently replace a failed Developer connection. `/login` and `/developer` on the
local frontend show connection management; backend OAuth/callback paths remain
unchanged. Use the backend site to issue/revoke access, not the local frontend.

## Credential and request lifecycle

The BFF holds the token only in process memory, behind a cryptographically random,
HttpOnly, SameSite=Strict session cookie scoped to the local origin. At most 50
active connections exist per process. Entries expire within one hour and no later
than the backend token. The connection endpoint bounds input to 1 KiB and at most
20 connection attempts per minute per process; disconnect remains available. Reconnecting rotates the local ID; disconnect,
expiry, backend auth rejection or process restart removes access. Changing the
connection reloads the local app to discard previous client router payloads. A restart or an
expired/revoked connection requires reconnecting. Nothing writes the token to a
file, environment, browser storage, cookie, URL, HTML, React props or logs.

The local browser sends only its local session cookie. Its same-origin
`/api/remote/read/...` route allows only the registered v1 GET/HEAD resources and
query keys; there is no arbitrary proxy destination. The server sends only
Accept, the selected bearer when connected, and the configured local Origin.
It forwards no browser Cookie or Authorization headers and refuses redirects.
Each upstream fetch has an eight-second timeout and a 2 MiB streamed body bound;
returned envelopes/data are validated with the shared schemas. Errors are
sanitized to known machine codes and localized locally. Backend throttling keeps
429 / RATE_LIMITED and Retry-After; the adapter does not retry it automatically.

Server components, metadata, the frame and supported legacy profile read route
share `src/lib/frontend-data.ts`. Pagination is completed server-side, with a
10,000-record/100-request bound, consistent collection versions, exact totals and
one whole-collection restart on a concurrent change. No partial collection is
rendered. Memoization is request-local only. Fetches use `no-store`; the remote
Next development HMR cache is disabled so it cannot preserve revoked private
reads. There is no cross-session data cache. The live `/me` check precedes each
request's data access, and subsequent reads recheck current scopes/grants at the
backend. The mounted frontend also checks connection health on focus and every
15 seconds and on restored pages, hiding its content on failed checks and
rechecking the private-read scope for internal pages.

Local writes, OAuth/provider entry points, private media, unsupported API reads
and unimplemented pages are blocked before their local service logic. The local
DB pool also refuses remote mode as a defense in depth. Locale/theme/appearance
preferences still use their own existing local cookies. The header displays the
actual remote identity; it never turns the Developer read principal into an
Admin, Captain or other writable browser role. Internal tournament pages show
only saved configuration in this stage; other staff tools remain unsupported.

Supported legacy read URLs also use this adapter: `/api/me` retains its user
shape; `/api/tournaments`, `/api/tournaments/{edition}`, `/api/players`,
`/api/tournaments/{edition}/players`, and `/api/players/{id}` preserve their core
read projections. Player collections stay complete. The legacy tournament list
embeds all detail/rulebook documents and is bounded at 50 editions; larger lists
must use the v1 summary collection. No arbitrary legacy read is forwarded.

## Limits and verification

The API supplies current public data, saved profiles, released identities, source
metadata and historical projections. Missing/stale/zero values retain the v1
contract. The historical overview includes the authoritative optional rulebook
season so rules formatting survives serialization; older backend responses may
omit it. This is formatting metadata, not a replacement archive or invented rule.

Messages, reactions, round rating history, uploads/private media and other pages
are intentionally outside this stage. Their notices/coverage list identify the
limit; no local DB, provider refresh or synthetic fallback supplies missing data.
This is **core-page DB-free development**, not full-site completion.

Run the ordinary database checks against a separate named TEST_DATABASE_URL.
After building the backend, run the additional browser test:

```sh
PLAYWRIGHT_CHANNEL=chrome TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/oclr_test \
  npx playwright test --config playwright.remote.config.ts
```

It starts a real isolated database-backed backend and a separate `next dev`
frontend with empty DATABASE_URL / OAuth secrets. The frontend preloads a guard
that makes any pg connection fail and records attempted connections. Both browser
projects cover direct requests, reload/navigation, complete collections, saved
and historical profiles, local preferences, independent sessions, backend
revocation/expiry, readonly behavior and reconnection. Unit/integration transport
tests additionally cover unavailable/malformed upstreams, redirect rejection,
collection restart and bounded memory. Synthetic tokens/test accounts establish
local behavior, not real OAuth, organizer grants or deployment.
