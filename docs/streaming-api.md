# Streaming read API (#540)

The website provides edition-bound, read-only access for an explicitly granted
Streamer. Overlay integration is deferred until its upstream update; this change
does not modify OCLR-stream-overlay, tosu, OBS or official results.

## Operator workflow

Sign in on the website and open **Streaming tasks → Streaming API access**
(`/streaming/{edition}`). Choose the exact local origin and create access. Copy the
credential once into the local application's server-side credential input. Never
put it in an OBS URL, browser storage, source code, screenshots or logs. The page
lists only the current user's credentials for that edition and supports revocation.

The account menu entry (`/streaming`) opens the current accessible, published
edition directly, preferring a live edition and then an upcoming edition, as on
the homepage. Completed historical editions are excluded from this entry. If
none is available for the user's Streamer grant, it shows the existing empty
state. Explicit edition URLs keep their own authorization checks.

A live edition-scoped or global `streamer` grant is required. Admin, Developer and
repository access alone do not qualify. The credential has only `streaming:read`,
is bound to one edition and cannot access other Developer resources or mutations.

Access uses a **one-hour idle lease**, not a fixed one-hour lifetime. A successful
Streaming GET, including an empty next-fixture response, renews it. HEAD, OPTIONS,
invalid queries, failed authorization, serialization errors and rate limits do not.
Activity writes are coalesced to at most one per minute, so the persisted idle
boundary can precede the last successful GET by less than one minute. Normal
15-second polling keeps it active. Renewal can never exceed the original browser
session expiry. Expired access cannot be revived; create a new credential.
Revocation, role withdrawal and logout take effect on subsequent requests.
The displayed expiry is a snapshot; reload the access page for the latest lease.

Credential issuance/list/revocation uses the existing same-origin browser session:
`POST /api/streaming/tokens` with `{ editionSlug, origin }`,
`GET /api/streaming/tokens?edition=...`, and
`DELETE /api/streaming/tokens/{tokenId}`. No bearer credential can issue or revoke
credentials. Owners can revoke their own access even after losing Streamer.
Credential hashes and audit metadata are stored separately from business records;
raw tokens are never stored. Issuance is limited to 5/minute and 10 active tokens
per subject; reads use the existing process-local 120/minute credential budget.

## Read contract

`GET /api/v1/streaming/tournaments/{edition}/next?afterFixtureId={uuid}`

Requires `Authorization: Bearer <credential>`. The response uses saved-read
contract **1.4.0**, `X-OCLR-Read-Contract`, `Cache-Control: no-store` and the existing
`{ data, meta: { apiVersion: "1", requestId } }` envelope. HEAD has the same checks
and no body; OPTIONS is read-only preflight. Writes return 405 `READ_ONLY`.

`data` has exactly three properties:

| Property      | Source and semantics                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nextFixture` | Existing `PublicFixture` from `publicCompetition`, or null. Only published fixture/identity projections, never staff assignment history.                                                                        |
| `stage`       | `{ id, kind, round: { id, name, position, scoringRules } }`, or null. `id`/`kind` are the existing tournament stage; `round` is the fixture's exact tournament round. No group configuration or private policy. |
| `mappools`    | Existing `publicMappools` projection for the fixture's explicitly linked, published pool. Empty when absent/unpublished; never another pool in the round.                                                       |

Stage has no independent display name in the current database. Round names remain
literal. `scoringRules` is the existing nullable scoring model: `first_to.wins` or
`fixed_maps.count` is authoritative; clients must not infer BO from round names.
Existing timestamps and map metadata remain unchanged. Read schema/OpenAPI are
generated from the shared TypeScript models.

For Developer parity, `GET /api/v1/me/tournaments/{edition}/streaming/next` uses
exactly the same generated response schema and service. It requires the ordinary
Developer token with `identity:read` **and** the subject's live Streamer grant;
it does not accept streaming tokens or renew their leases. PublicFixture and
Mappool objects also retain the shape of their existing Developer resources.

## Selection and consistency

Selection is restricted to the subject's current assignments in the requested
published edition. Candidates must have a public scheduled timestamp. Past-time
unfinished fixtures remain eligible (delays); sorting is timestamp, fixture
position, then ID. Cancelled fixtures, approved-result fixtures and fixtures whose
saved referee event projection has completed the series are excluded, including
before results are publicly released. No private completion details are returned.
Unpublished direct team identities withhold a fixture through the existing public
projection; published TBD progression slots retain their existing semantics.

`afterFixtureId` is an optional read-only anchor in this ordered, public, assigned
set, including a completed/cancelled anchor with a schedule. Invalid, unpublished,
unscheduled, foreign-edition or reassigned anchors return 404; they do not fall
back to the first fixture. The anchor does not complete a fixture or save progress.
Without an anchor an ongoing match can remain the first unfinished assignment.

No next fixture returns `nextFixture: null, stage: null, mappools: []`. A missing
public pool does not suppress an otherwise visible fixture. The three projections
are read in one read-only repeatable-read transaction, using the existing services.
Only credential lease bookkeeping writes after a successful response is prepared;
no business record, provider cache or published result is modified by this API.

## Transport and future Overlay adapter

The preferred client is the Overlay's Node service. It sends no browser cookies
and keeps the token server-side. Server requests without Origin are authenticated
normally. Direct browser reads additionally require an allowed loopback
origin and `credentials: "omit"`. With `OCLR_STREAMING_ORIGINS` unset, any canonical
HTTP/HTTPS loopback origin with a valid effective port (1–65535) is accepted:
`localhost`, `127.0.0.1` and `[::1]`. Operators can restrict this using
`OCLR_STREAMING_ORIGINS` (comma-separated, up to 20 origins). Explicitly empty
or invalid lists fail closed. Both the allowlist and credential binding treat
`localhost` and `127.0.0.1` as equivalent when protocol and effective port match.
HTTP/HTTPS, different ports and IPv6 `[::1]` remain distinct. Existing credentials
gain the localhost/IPv4 alias behavior without rewriting their stored origin.
No wildcard or null origins, credentials, paths, trailing slashes, queries or fragments.
Browser CORS returns only the validated request origin, never a wildcard.
Upstream transport must be HTTPS outside explicit local test environments.

```js
// Token supplied in memory by the operator; never a URL or logged configuration.
const response = await fetch(
  `${backend}/api/v1/streaming/tournaments/${edition}/next`,
  {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  },
);
// Validate the contract header and OpenAPI response before applying any data.
// Production clients must additionally bound streamed response bytes (2 MiB).
```

Poll every 15 seconds with one request in flight. Respect 429 `Retry-After`; back
off on network/5xx failures. Stop and clear protected source data on 401/403; never
fall back to anonymous access. An operator-confirmed local match may remain on
screen, marked stale, but polling must not overwrite its teams, BP, scores, stage
corrections or referenced maps. Applying the next fixture is an explicit local
operator action. Empty data never imports historic-season defaults.

Errors retain `{ error: { code, message, requestId } }`; use `code`, not text.
400 is invalid query, 401 expired/revoked/wrong credential family, 403 missing
Streamer/edition/origin/scope, 404 hidden/missing edition or anchor, 413 oversized
response, 429 throttling and sanitized 5xx service failure. Invalid Bearer access
never falls back to cookies or anonymous reads.

## Deployment and verification

Apply migration `0061_streaming_api_access` through the approved operator workflow
before using the API. It adds dedicated credential/audit tables; existing Developer
tokens and expiry policies are unchanged. This implementation does not grant real
roles, issue real credentials or deploy. Synthetic database/browser evidence and
commit-specific CI are recorded on #540; real Overlay/OBS integration is pending.

## Connect directly from Overlay (#616)

The companion Overlay console can open
`/streaming/{edition}/connect?origin={configured-loopback-origin}&state={nonce}`.
Sign in with osu!, then authorize the displayed edition and local console. The
credential returns automatically to the initiating window; copying remains
available at `/streaming/{edition}` and as a fallback on the connect page.
The Overlay update and this website update must both be installed before automatic
connection works. This change does not deploy either application.

The same loopback policy applies to connect, OAuth return, token creation and CORS.
When an operator configures `OCLR_STREAMING_ORIGINS`, only entries matching that
policy are accepted, including the localhost/IPv4 alias equivalence.
Valid local console addresses denied by that policy show an explanation and next
step on the connect page; malformed connection requests still return not found. The connect
page and Overlay exchange messages with exact origins and window references; the
Overlay also consumes its own one-time, ten-minute state. Credentials travel in
message/JSON bodies, never URLs, browser storage or logs. After the console
acknowledges receipt, the website clears the temporary token and closes the window.
If a browser blocks the popup or loses its opener, restart from the console or use
manual copying. The website still requires an explicit authorization click and
rechecks the live browser session and Streamer grant when issuing access.

OAuth preserves only this validated same-site connect path in a ten-minute
HttpOnly cookie bound to the consumed OAuth state hash. Callback handling
revalidates the origin configuration and clears the cookie on success or failure.
Ordinary login and desktop authorization retain their existing destinations.
No database migration, new role, scope or business write is introduced.

### Custom console ports (#1093)

The website accepts custom console ports without changing server configuration
when `OCLR_STREAMING_ORIGINS` is unset. The manual access page accepts the full
console origin (for example `http://127.0.0.1:3011`), and the connect page's manual
fallback link carries that origin forward. The credential remains bound to the
selected protocol and port; switching between `localhost` and `127.0.0.1` on that
same protocol/port does not require a new credential. Changing protocol or port
does require new access. Browser `postMessage` targets and source/window checks
still use the initiating console's actual origin, because browser origins remain
distinct even when the server's authorization policy considers them equivalent.

Existing installations that explicitly set the old 3001-only list retain that
restriction. To enable arbitrary valid local ports, the website operator must
remove `OCLR_STREAMING_ORIGINS` from the deployed environment and restart through
the normal deployment workflow; alternatively add the intended origins to
the existing list. The application never silently discards an explicit restriction.
Existing credentials, expiry/revocation and edition-scoped Streamer grants are unchanged.

For the documented Rocky installation, edit `/etc/oclr/runtime.env`. Remove the
entire assignment to allow custom local ports, or keep an explicit list such as:

```dotenv
OCLR_STREAMING_ORIGINS=http://localhost:3001,http://localhost:3011
```

Each entry also allows `127.0.0.1` on the same protocol and port. Do not replace
the assignment with an empty value. Deploy this website change
and restart the service through the normal operator workflow. Editing the
repository's `.env.example` alone does not update an existing installation.

This website change does not implement the Overlay launcher port setting tracked
in [OCLR-stream-overlay #36](https://github.com/OCLR-dev/OCLR-stream-overlay/issues/36).
Website-only synthetic verification and outstanding real integration checks are
recorded in [#1093 verification](verification/issue-1093/README.md).

The Overlay reads a page of up to five assignments by following `afterFixtureId`
serially, refreshing every 15 seconds. Its task picker changes the preview only;
using a task is a separate local action. More tasks are available through the next
page, and no task is marked complete by browsing or choosing it. Missing scoring
rules must remain explicitly unconfirmed; they do not prohibit selecting a task
or justify inferring BO from round names.
