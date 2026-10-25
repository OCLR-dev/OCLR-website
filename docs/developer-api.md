# Developer API access (#268–#269)

An explicitly granted global Developer can open **Dashboard → Developer API access**
at `/developer`, choose an exact local origin and read scopes, and create or revoke
their own short-lived API access. Use the existing osu! login on the backend.
No role is granted by opening this page. Global Admin alone is not a Developer
grant; a bootstrap Admin with an explicit Developer grant can use this feature.

Token management and the versioned saved-data resources are implemented in
#268–#269; see [read-api.md](read-api.md) and `/api/v1/openapi.json` for their
contracts. The core-page remote frontend adapter is implemented in #270; see
[remote-development.md](remote-development.md) for its connection flow and coverage.
Complete page coverage remains in #271 and consolidated verification in #272.
**Only the documented core pages currently support development without a local database.**

## Credential policy

- A 256-bit opaque token has the distinct `oclr_dev_` prefix. Only its SHA-256 hash
  is stored. The raw value is returned once by the authenticated creation request
  and held in the browser's component state until hidden, revoked or navigated away.
  It is never server-rendered, put in a URL or copied into a configuration file.
- Access lasts at most one hour, capped by its original browser session's expiry.
  Every data request checks the token, that same live session and the current
  explicit global Developer grant. Logout deletes the parent session and cascades
  its tokens; expiration and role/token revocation apply on the next request.
- Tokens have only the selected `identity:read`, `tournaments:read`,
  `tournaments:private:read`, and `profiles:read` scopes. Public resources permit
  anonymous reads; an explicit bearer must have the resource's matching scope.
  `/me` requires `identity:read` and reports the token's scopes, not staff capabilities.
- Independent Admin/Mappooler/Referee/Captain grants still operate through the normal
  website session. They are never added to a bearer principal. An Authorization
  header cannot fall back to a cookie, authorize management, or reach legacy GET
  paths which might refresh provider caches.
- At most 10 unrevoked, unexpired tokens per user, serialized in PostgreSQL across
  concurrent sessions/processes. Management lists at most 50 recent entries.
  Revoking an already revoked token is idempotent. Creation and explicit revocation
  write transactional, secret-free events visible in the existing Audit browser
  under `developer_api`. Session cleanup cascades credentials and preserves events.

Migration `0037_developer_api_access` adds the credential/event tables, constraints
and indexes. Apply it to the intended backend using the existing reviewed migration
and backup/update procedures before enabling this release; `release:check` verifies
the columns. No production migration, role grant or deployment is performed by this
feature's local tests. A deliberate rollback must follow the deployment runbook;
do not down-migrate or erase authorization history.

## Origins and browser use

The backend's optional exported `OCLR_DEVELOPER_ORIGINS` is an exact comma-separated
allowlist. By default it includes `http://localhost:3000`, `http://127.0.0.1:3000`,
`http://localhost:4000` and `http://127.0.0.1:4000`. An explicitly empty value
disables issuance and browser CORS. At most 20 canonical HTTP/HTTPS loopback origins
are allowed; localhost, 127.0.0.1 and [::1], schemes and ports are distinct. Paths,
trailing slashes, credentials, `null`, suffixes and wildcard origins fail validation.
If the operator sets `OCLR_DEVELOPER_ORIGINS`, that exact list replaces the defaults
and must include each desired origin. The developer chooses one configured origin
when issuing access.

```js
// token is supplied privately at runtime and kept in memory.
const response = await fetch(`${backend}/api/v1/me`, {
  headers: { Authorization: `Bearer ${token}` },
  credentials: "omit",
});
const result = await response.json();
```

For v1 read resources, OPTIONS supports GET/HEAD and Authorization, Accept and
Accept-Language request headers. It requires no token and discloses no data.
Allowed origins receive matching CORS headers on success and errors, `Vary: Origin`
and exposed X-Request-Id/Retry-After/WWW-Authenticate headers. Credentialed cookies
are not enabled. Bearer browser reads require both the backend allowlist and the
token's exact bound origin. Anonymous public reads need only the backend allowlist. A private server/BFF request may omit Origin and must still
supply a valid bearer token and scope. CORS is a browser policy, not proof of identity.
All remote backend traffic uses HTTPS; APP_URL permits HTTP only on loopback.

GET/HEAD errors use `{ error: { code, message, requestId } }`; successes use
`{ data, meta: { apiVersion: "1", requestId } }`. Responses are no-store. HEAD has
identical status/headers and no body. Unknown authenticated v1 resources return
404; mutation methods return 405 READ_ONLY before business work. Invalid credentials
return 401, scope/grant/origin failures 403, and throttling 429 with Retry-After.
Internal errors never echo exception messages. `/me` accepts no query parameters.

Only the original same-origin browser session can use:

- `GET /api/developer/tokens`: private metadata and configured choices.
- `POST /api/developer/tokens`: bounded JSON `{ origin, scopes }`, one-time raw token.
- `DELETE /api/developer/tokens/{id}`: own credential revocation.

Management is outside the cross-origin/bearer surface. No batch private export,
provider refresh, import, upload, result/configuration write or publication is
authorized by the Developer API. Personal appearance/locale preferences remain
independent of this credential.

## Resource limits and verification

The single Node process enforces 600 v1 requests/minute (including preflight and
invalid requests), 120 reads/minute per token fingerprint, and 5 issuance
attempts/minute per user. Fixed windows use a process-local, 4096-entry bounded
map that fails closed when full; restart clears windows. The database quota of 10
active tokens remains authoritative across processes. Multiple Node processes
need an ingress/shared aggregate request limit; the application does not claim
distributed rate limiting. Do not trust arbitrary forwarded IP headers as identity.

Management JSON is limited to 4096 bytes; `/me` responses to 256 KiB and other
v1 resources/specification to 2 MiB. Credential transactions and read-only data
queries use a five-second PostgreSQL statement timeout. Provider traffic is never
part of a v1 read. Test fixtures require an isolated database explicitly
named with a `test` segment; synthetic browser/transport tests do not establish
real organizer authorization, live OAuth or a production deployment.
