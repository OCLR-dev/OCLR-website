# Remote saved-read coverage (#271)

The authoritative inventory is [remote-coverage.json](remote-coverage.json).
It enumerates every current page, layout, GET/HEAD route and client fetch/poll
module. Each row records its existing authority, operation IDs, adapter, media
boundary and required verification. `requiredVerification` describes the check
that must run; the inventory itself is not a claim that a check passed.

The existing pages and presentation components are reused. Domain read services
choose the remote adapter only when `OCLR_DATA_SOURCE=remote`; database mode uses
the same existing implementation. The finite registry is
[`extended-read-resources.json`](../scripts/extended-read-resources.json).
The server dispatches only those resource paths. It never accepts a service name,
SQL, provider URL or file path from a caller. Backend actor/user arguments come
from the live bearer principal. `/me/...` cannot select or impersonate a different
user; Captain views still require that subject's actual edition appointment.

The two v1 route files are explicitly classified as **backend-only**: their
contract and CORS are tested against the separate backend. The DB-free frontend
rejects local `/api/v1/...` URLs with 403 and uses existing legacy read URLs or its
local BFF instead. It does not initialize another backend or authenticate a local
business session.

Coverage includes public information/news/wiki/privacy/navigation, current and
historical tournament sections, saved profiles and ratings, global administration,
edition workspaces, the actual subject's dashboard/registration/team/Captain
pages, and the existing approved OBS/presenter snapshots. Static repository
content remains static. Missing or unreleased data retains the existing empty,
not-recorded or authorization response; a read never creates a session, record,
import, result, lock or snapshot to populate a screen. Historical MP reviews use
stored source evidence. Reactions and commands remain disabled. Preferences and
local connection management keep their separate local mechanisms.

Read-only controls reuse `StaffReadOnlyContext` and the existing native fieldsets.
The remote context cannot be overridden by an independent Admin or edition staff
role. The backend read channel also denies write capabilities, and business reads
run in a repeatable-read READ ONLY transaction. Provider requests are rejected on
that channel. Ordinary database-backed browser roles retain their original scopes.

Protected team images and replay downloads use fixed, bounded binary resources.
The local legacy URLs use the remote transport, so components keep their existing
relative links. Images recheck publication or private read authorization. Replays
recheck edition/entry/replay membership and permission, then validate token access
again after file reading. MIME, `nosniff`, sandbox and download headers are retained;
no storage path or guessed public URL is exposed. Polls stop and discard private
snapshots after 401/403; reconnecting reloads the application.

Regenerate the contracts and inventory after changing a read service or route:

```sh
node --import tsx scripts/generate-extended-contracts.ts
node --import tsx scripts/read-api-spec.ts
node --import tsx scripts/generate-remote-matrix.ts
```

The contract generator uses the existing TypeScript compiler with checked array
indexing, so a missing first database row remains nullable in JSON. It rejects
`any`, functions, Map/Set, Buffer and unsupported wire types. Shared structural
JSON Schema definitions feed runtime Zod validation and OpenAPI; Date metadata
restores Dates only at the existing service boundary. Unknown audit/answer JSON
retains its existing bounded, authorized projection. There is no extra SDK.

`tests/integration/extended-read.test.ts` exercises every registered domain model,
actual subject binding, role combinations, denied commands, binary resources and
unchanged business data. `tests/remote-e2e/full-site.spec.ts` renders every page row
and historical deep links on desktop/mobile and records a per-page artifact.
`interactions.spec.ts` separately verifies read-only forms, actual Captain/OBS
polling, media and revocation so those checks can be rerun independently. `frontend.spec.ts` covers connection UI, complete directories,
appearances, locales, independent sessions and expiry/revocation. All use the
separate backend/frontend harness in `playwright.remote.config.ts`; the frontend
has empty database/OAuth configuration and a PostgreSQL connection trap.

See [remote development](remote-development.md) for setup and
[read API](read-api.md) for the HTTP contract. Acceptance evidence belongs to the
commit-specific issue/CI report. Synthetic local evidence does not establish a
real OAuth login, role grant, remote deployment or organizer release acceptance.
