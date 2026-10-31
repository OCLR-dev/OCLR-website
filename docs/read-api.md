# Versioned saved-data read API (#269–#272)

The saved-read API serves the existing OCLR frontend through one versioned
resource contract. The [full-site remote adapter](remote-development.md) needs no
local database, migrations, seed or OAuth secret. Its minimum compatible contract
is 1.2.0 within v1, returned in `X-OCLR-Read-Contract` and the OpenAPI version.

The machine-readable OpenAPI 3.1 document is served, without authentication or a
DB connection, at `/api/v1/openapi.json`. It is a raw OpenAPI document; all business
resources below use the standard envelope. The checked-in copy is
[read-api.openapi.json](read-api.openapi.json). Each GET/HEAD/OPTIONS operation has
a stable `operationId` and `x-oclr-issues`. The document is generated, never
hand-edited; `npm run read-api:generate` refreshes it together with the other
generated contracts, and `npm run read-api:check` verifies it before a push (see
[generating and checking contracts](#generating-and-checking-contracts)).

## Resources and authorization

| GET resource (relative to `/api/v1`)     | Anonymous | Bearer scope               | Data                                                                     |
| ---------------------------------------- | --------- | -------------------------- | ------------------------------------------------------------------------ |
| `/me`                                    | No        | `identity:read`            | Current token subject, scopes and expiry                                 |
| `/site`                                  | Yes       | `tournaments:read`         | Public site name, default appearance, supported locales, privacy contact |
| `/tournaments`                           | Yes       | `tournaments:read`         | Published tournament summaries                                           |
| `/tournaments/{edition}`                 | Yes       | `tournaments:read`         | Published information and public overview                                |
| `/tournaments/{edition}/players`         | Yes       | `tournaments:read`         | Complete public directory via bounded collection pages                   |
| `/tournaments/{edition}/players/{osuId}` | Yes       | `tournaments:read`         | Public participation and saved profile for that edition                  |
| `/staff/tournaments`                     | No        | `tournaments:private:read` | Saved tournament summaries, including unpublished editions               |
| `/staff/tournaments/{edition}`           | No        | `tournaments:private:read` | Whitelisted saved tournament configuration and archive metadata/counts   |
| `/staff/profiles/{osuId}`                | No        | `profiles:read`            | Saved osu! profile snapshot only                                         |

The full resource/operation list is the generated OpenAPI document. Additional
resource families use the same authorization/envelope and existing domain models:

| Resource family                                                                                                                                                     | Scope / behavior                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/site/staff`, `/site/news?locale=...`                                                                                                                              | Public-only published identities/news; explicit interface locale.                                                                                                |
| `/tournaments/{edition}/configuration`                                                                                                                              | Published configuration and saved revision; archive fields are available only for a published edition; questions and staff eligibility settings remain excluded. |
| `/tournaments/{edition}/competition`, `/bracket`, `/teams`, `/captains`, `/mappools`, `/draft`, `/draft/broadcast`, `/ratings`, `/awards`, `/statistics`            | Existing publication boundaries and saved snapshots; optional mappool UUID filter.                                                                               |
| `/tournaments/{edition}/matches/{id}`, `/matches/{id}/ratings`, `/players/{osuId}/messages`                                                                         | Edition-scoped published records.                                                                                                                                |
| `/staff/tournaments/{edition}/configuration`, `/workspace`, `/captains`, `/teams`, `/draft`, `/mappools`, `/fixtures`, `/awards`, `/statistics`, `/streaming`       | `tournaments:private:read`; full saved workspaces, with commands disabled. Historical statistics use a recorded fixture key.                                     |
| `/staff/tournaments/{edition}/matches/{id}`, `/matches/{id}/ratings`, `/matches/{id}/review`, `/mappool-entries/{id}/replays`                                       | `tournaments:private:read`; existing authorized saved evidence and replay metadata.                                                                              |
| `/staff/tournament-workspace`, `/staff/roles`, `/staff/site-settings`, `/staff/registrations`, `/staff/registrations/{id}`, `/staff/audit`                          | `tournaments:private:read`; existing bounded filters/redaction. Selectors reuse the versioned private summary collection; there is no sensitive batch export.    |
| `/me/staff-access`, `/me/profile`, `/me/applications`, `/me/registrations`, `/me/tournaments/{edition}/team`, `/captain`, `/draft`, `/eligibility`, `/registration` | `identity:read`; the backend supplies the actual subject, with real Captain appointment checks and saved-only eligibility/profile data.                          |
| `/media/teams/{id}/avatar`                                                                                                                                          | Published WebP; unpublished identities also require private scope and live staff read authorization.                                                             |
| `/staff/tournaments/{edition}/mappool-entries/{id}/replays/{replayId}/file`                                                                                         | `tournaments:private:read`; authorized binary download, never a storage path or provider proxy.                                                                  |

The global contributor directory uses `/site/contributors` for the published
name/osu! ID projection and `/staff/contributors` for the saved private workspace
under `tournaments:private:read`. `/players/{osuId}/participations` supplies public
participation for the dashboard profile link, with an optional edition filter.
These reuse the existing #275/#277 models without a local database fallback.

Badge review reads at `/staff/tournaments/{edition}/registrations/{id}/bws` additionally require both `tournaments:private:read` and `profiles:read`; only `mode=osu` is supported. They read saved snapshots and reviews without a provider refresh.

Binary resources return their bytes directly, with matching MIME, bounded length,
`nosniff`, sandbox and safe attachment filename headers. WebP is limited to 1 MiB;
replays to 8 MiB. CORS exposes the download/contract/request headers. All binary
reads revalidate access after reading. Public JSON resources still never expose
private records merely because a Bearer token is supplied.

An explicit Authorization header is always validated, including on public routes.
Invalid credentials never fall back to anonymous access or a browser session.
A valid token on a public route still gets only the public projection; it cannot
expose an unpublished edition. Private routes recheck the current Developer grant,
parent session, token, scope and bound browser origin on every request. An Admin
without a Developer grant cannot use them. The global Developer read grant does
not confer edition staff capabilities or authorize mutations. See
[developer-api.md](developer-api.md) for issuance, revocation, quotas and exact-origin
CORS configuration. Use `credentials: "omit"` in local browser requests.

Both profile resources accept only `mode=osu|taiko|fruits|mania`, default `osu`.
IDs are positive safe integers and edition slugs use the existing edition schema.
Site, identity and core tournament detail accept no query parameters. Unknown/repeated
parameters return 400; technical values, authored text, names, metadata and URLs
are never translated by the API. Timestamps retain their stored values; display
formatting uses the returned tournament `timeZone`.

## Envelopes, nulls and bounded collections

Success: `{ data, meta: { apiVersion: "1", requestId, pagination? } }`.
Error: `{ error: { code, message, requestId } }`. Match errors by `code`, with
localized display text in the client; do not parse the message. All responses are
`no-store`. HEAD runs the same authorization/query/projection checks and returns
the same status/headers without a body. OPTIONS is unauthenticated and returns
only CORS/method headers. Mutation methods return 405 `READ_ONLY`.

The versioned summary/player collection resources accept `q` (trimmed, at most 100 characters), `page` (default 1),
`pageSize` (default 50, maximum 100), and `version`. `meta.pagination` contains
`page`, `pageSize`, `total`, `totalPages`, `nextPage`, and `collectionVersion`.
The version is a SHA-256 of the full filtered ordered projection, including saved
statistics and source revision/time. Later pages **require** the first page's
version. A concurrent change returns 409 `COLLECTION_CHANGED`: discard partial
results and restart at page 1. An empty collection has `totalPages: 0` and
`nextPage: null`. A page beyond the end is empty. Keep the same filters and page
size while traversing. At most 10,000 matching records are supported; larger
collections return 413 rather than truncating. Narrow `q` if necessary.

Public tournaments sort by season (numeric, descending), then slug. Private
summaries retain the existing updated-at descending, slug order. Current players
retain username then osuId order; archives/preview retain source order. The
existing SSR players page consumes the full common model and remains a single
complete list; transport pagination does not introduce UI pagination.

```ts
import type {
  PublicPlayer,
  ReadApiResponse,
} from "../src/lib/read-api-contract";

async function publicPlayers(backend: string): Promise<PublicPlayer[]> {
  const result: PublicPlayer[] = [];
  let page: number | null = 1;
  let version: string | undefined;
  while (page !== null) {
    const query = new URLSearchParams({ page: String(page), pageSize: "100" });
    if (version) query.set("version", version);
    const response = await fetch(
      `${backend}/api/v1/tournaments/s11/players?${query}`,
      { credentials: "omit" },
    );
    if (!response.ok) throw await response.json(); // Handle codes/restart in the UI.
    const body: ReadApiResponse<PublicPlayer[]> = await response.json();
    result.push(...body.data);
    const pagination = body.meta.pagination!;
    version = pagination.collectionVersion;
    page = pagination.nextPage;
  }
  return result;
}
```

This illustrates the collection contract. The application adapter implements
whole-collection restart and bounds; do not silently accept a partial list. The shared Zod schemas, serializable TypeScript types and envelopes live
in `src/lib/read-api-contract.ts`; operation definitions live in
`src/lib/read-api-operations.ts`. Runtime responses and generated OpenAPI use the
same schemas. Database, provider clients and credentials are server-only.

## Authority and publication

Common query models in `src/lib/public-read-models.ts` serve the existing
tournament list/overview/player SSR and v1 routes. `source.kind` distinguishes
`database`, `historical_archive`, `preview`, and `saved_profile`, with nullable
`revision`, `updatedAt`, `capturedOn`. An archive keeps its recorded identity,
role, Tier and source order; present-day profiles never replace archive statistics.
Only the existing development-only `dev-s11` preview selector can produce preview
data. It is explicitly marked and disabled in production.

The current directory includes accepted minimal identities, published
Captain/team/roster information under their independent release boundaries, and
independently published coach identities required by #149. `participation` and
`role` distinguish these. Pending/rejected/withdrawn applications, private answers,
notes and internal audit fields are excluded. An explicitly public introduction
uses the existing opt-in projection (#204); it does not expose the answer object.
Captain is literally `Captain` (Tier 0). Other players receive Tier N only from a
released authoritative draft whose matching revision establishes valid round N;
unknown/withheld/irregular order remains null. BWS uses the existing calculation
on the saved profile, never a new stored eligibility decision.

Player statistics distinguish `fresh`, `stale`, `missing`, `not_recorded` and
`preview` (or `unavailable` for a failed cache read); unranked global rank is null, valid PP zero is 0. Saved profile models
whitelist the normalized osu! profile fields and verify osuId/mode against the
cache key. An optional `profile.rankHistory` carries the requested ruleset's
daily global ranks (oldest first, unranked days omitted) for the players-page
rank chart; rows saved before it was retained, and older v1 backends, return
`null`. `statistics.globalRankPercent` (0..1) is the share of the ranked
population above the player, used for the tiered rank colours; it is `null` for
rows saved before it was retained and for older v1 backends. Error/stale cache state remains explicit. Missing or malformed saved
profiles return 404 `PROFILE_SNAPSHOT_NOT_FOUND` on the standalone staff resource.
A published participant without a profile still returns 200 with identity and
`snapshot: null`; missing directory statistics have state `missing`. Historical
participants always have `snapshot: null`, directory statistics state
`not_recorded`, and no current BWS. The requested mode is returned explicitly; a
missing mode-specific profile does not erase saved standard-mode directory stats.

Overview modules retain existing fail-soft behavior: `overview.unavailable`
identifies unavailable secondary modules without returning database errors or
pretending a failed read is authoritative empty data. Missing rules/dates remain
null/empty as configured. The core summary/overview/player schemas exclude application questions and
internal configuration. The published configuration resource additionally serves the approved archive.
Application questions and automatic/staff eligibility settings remain excluded
from anonymous configuration. The subject-bound registration form supplies the
existing published questions only while registration is open. Submitted answers,
review notes and unpublished configurations remain private.

## Read-only behavior and compatibility

V1 business reads use a PostgreSQL repeatable-read, READ ONLY transaction with a
five-second statement timeout. Existing domain services reuse that connection;
services with savepoints run serially. V1 GET/HEAD never fetch a provider, claim a
cache refresh, write a registration decision, import, publish or change business
versions. Token authentication and process-local request limits remain separate.
JSON responses are bounded at 256 KiB for `/me`, 2 MiB for other v1 resources/spec;
oversized data returns 413 `RESOURCE_TOO_LARGE`, never a partial success.

Legacy `/api/players/...` and existing authenticated refresh workflows retain
their established behavior, including provider-backed refresh where previously
allowed. They share the normalized saved-profile projection where applicable.
The ordinary SSR directory can still schedule its existing bounded background
refresh after rendering and recheck publication; the v1 common model never runs
that callback. OAuth, profile/edition deep links and staff write APIs are unchanged.

Typical errors: 400 `INVALID_REQUEST` / `COLLECTION_VERSION_REQUIRED`, 401 invalid
or missing bearer, 403 origin/scope/grant rejection, 404 unpublished/missing
resource or `PROFILE_SNAPSHOT_NOT_FOUND`, 409 `COLLECTION_CHANGED`, 413
`RESOURCE_TOO_LARGE`, 429 with `Retry-After`, and sanitized 5xx. No database
configuration yields 503 `DATA_UNAVAILABLE`; unexpected query/serialization
failures return sanitized 500. The OpenAPI document describes operation-specific
responses and the shared error envelope.

Local verification uses a named isolated `TEST_DATABASE_URL`, synthetic provider
fixtures and desktop/mobile browsers. It establishes contract, publication,
collection completeness and read-only behavior, not real OAuth, organizer grants
or a production deployment. No migration is added by #269, #271 or #272.

## Shared request/response schemas and issue mapping

`src/lib/read-api-queries.ts` supplies the exact request schemas also used by
registration/audit/streaming services. OpenAPI query types, enums, defaults, UUIDs,
dates and limits come from those schemas. The finite resource registry maps
operationId to its existing service. `generate-extended-contracts.ts` generates
strict response JSON Schemas from the same TypeScript return types, including
nullable first-row results, tuples, normalized profiles and saved snapshots.
Runtime Zod validation and OpenAPI share those definitions. JSON dates are ISO
strings; the existing SSR service adapter restores Dates using schema metadata.
Unknown audit/answer JSON keeps its existing authorized, bounded projection.

Every operation has `x-oclr-issues`; GET operations also identify the query model,
read-only behavior and [page/module matrix](remote-coverage.json). The matrix links
operation IDs to services, pages and required tests. `read-api-dx.test.ts` checks
source drift and every OpenAPI reference; `extended-read.test.ts` checks all domain
responses and unchanged stored state.

Rate counters are shared across Next route bundles, while each bundle constructs
its own error instances. `developer-api-bundles.test.ts` reloads the module graph
against the same exhausted counters and verifies HTTP 429, `RATE_LIMITED` and
`Retry-After: 60`; route bundling must not turn throttling into an internal error.

## Generating and checking contracts

Three files are generated from source and checked in:

| Generated file                         | Generator                                |
| -------------------------------------- | ---------------------------------------- |
| `src/lib/extended-read-contracts.json` | `scripts/generate-extended-contracts.ts` |
| `docs/read-api.openapi.json`           | `scripts/read-api-spec.ts`               |
| `docs/remote-coverage.json`            | `scripts/generate-remote-matrix.ts`      |

Refresh all three with one command, then verify them without writing:

```sh
npm run read-api:generate
npm run read-api:check
```

Run `read-api:generate` whenever you change a shared read schema or the resource
registry (`src/lib/read-api-contract.ts`, `src/lib/read-api-operations.ts`,
`src/lib/osu-profile-model.ts`, `scripts/extended-read-resources.json`), and
whenever a rebase or merge of `main` changes those sources. Commit the regenerated
files in the same commit as the source change. Do not hand-edit them and do not
resolve a merge conflict in them by picking either side: let the rebase/merge
finish, then regenerate and commit the result.

Run `npm run read-api:check` before pushing. It needs no database or build and
runs the same drift checks as CI: `node --import tsx scripts/generate-extended-contracts.ts --check`,
`node --import tsx scripts/generate-remote-matrix.ts --check` (the OpenAPI
document has no `--check` flag, so the unit tests compare it against the runtime
specification) and `tests/unit/read-api.test.ts` plus `tests/unit/read-api-dx.test.ts`.
A stale contract is not only a documentation problem: `src/lib/extended-read-resources.ts`
uses the generated contract as the runtime response schema, so drift makes HTTP
reads fail with `INTERNAL_ERROR` and shows up as failing `verify` and `e2e` jobs.
When the change affects stored responses, also run
`npx vitest run tests/integration/extended-read.test.ts` against an isolated
`TEST_DATABASE_URL`.

## Browser Bearer and existing Next SSR/BFF examples

For a separate browser frontend, keep the short-lived credential in memory and
let the browser supply Origin/preflight. Do not send backend session cookies:

```ts
async function savedProfile(backend: string, osuId: number, token: string) {
  const response = await fetch(
    `${backend}/api/v1/staff/profiles/${osuId}?mode=osu`,
    {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    },
  );
  const body = await response.json();
  if (!response.ok) throw body.error; // Match code; respect Retry-After on 429.
  return body.data; // Validate with the shared SavedProfile schema.
}
```

For this Next application, use its existing service boundary in a server component:

```tsx
import { publicMappools } from "@/lib/mappools";
import { MappoolBrowser } from "@/components/mappool-browser";
export async function SavedPools({ edition }: { edition: string }) {
  const pools = await publicMappools(edition);
  return (
    <>
      {pools.map((pool) => (
        <MappoolBrowser key={pool.id} slug={edition} pool={pool} />
      ))}
    </>
  );
}
```

With `OCLR_DATA_SOURCE=remote`, that service calls only the registered BFF resource;
database mode runs the existing backend service. Client polling continues to use
its same-origin legacy read URL, such as `/api/tournaments/{edition}/draft`, and
receives no Bearer token. The application BFF, not a browser bundle, stores the
credential. Local connection/preferences are independent of business writes.

A missing/older successful contract header produces `REMOTE_INCOMPATIBLE`; a new
additive 1.x minor remains compatible. New optional fields must preserve existing
v1 projections; incompatible meaning/authorization changes require a new major
contract. See the setup/troubleshooting guide for backend prerequisites and the
separate local-versus-real-deployment acceptance boundary.

## Streaming projection (#540, contract 1.4)

The shared `nextStreamingRead` model is available to an appointed Streamer through
`/me/tournaments/{edition}/streaming/next` with Developer `identity:read`, and to an
independent streaming credential through `/streaming/tournaments/{edition}/next`.
Both paths return the identical fixture/stage/mappools schema. The latter accepts
only the edition-bound streaming audience and grants no other Developer reads.
See [Streaming API](streaming-api.md) for selection, idle expiry and transport.

### Contract 1.7.0: repeated Mod Bans

Referee policies add optional `banCategoryRules: { allowRepeats, repeatExceptions }`.
It applies per team to active Ban selections across phases. Omission preserves
legacy allowed-repeat behavior. Exceptions accept NM/HD/HR/DT/FM only; TB can
never be banned. The field travels with the saved policy and session basis;
existing revision/history protections remain unchanged. Desktop consumers using
a strict policy schema must update their shared model before consuming the new
field; it must not be stripped while claiming to enforce this policy.

### Contract 1.6.0: round referee policies

The saved `mappoolWorkspace` adds optional `refereeRules`, containing each round's
stable ID, saved policy/revision and configured series. The field is optional for
older backend compatibility; it is never a write capability. Round management
uses these saved records for the policy editor and preserves the read-only
Developer/remote channel. The generated OpenAPI and runtime contracts share the
same additive projection. S11 templates are unsaved UI drafts, not saved API data.

### Contract 1.5.0: team configuration

The saved edition configuration adds optional `coachesEnabled`; newly created
editions store `false`. S11 without an explicit value defaults to disabled, while
other existing editions retain coaching. The staff team workspace projects the
effective setting. Staff fixture management includes active unpublished team
choices marked `unpublished`, solely for authorized private configuration.
Public fixture/result and group publication still require official finalized,
published teams. Remote frontends need this backend contract for these controls;
older backends do not supply the new setup behavior.


## Historical metadata additions (v1.13.0, #610)

Optional `placingRange` on public participation retains start/end, official and
tied facts. Optional match-game `excludedReason` provides the reviewed enum (or
unknown) without exposing reviewer evidence. Authorized statistics workspaces
add optional structured adjudication, excludedGames, reviewedBy/reviewedAt and
evidenceUrl. Existing technical notices stay boolean presentation flags; they are
derived from structured snapshots. See [archive metadata](archive-metadata.md).
These additions do not grant read tokens any business write capability.
