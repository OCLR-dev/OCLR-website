# Service and Next.js boundaries

The website continues to run on Node.js and PostgreSQL. #1012 separates
request and cache adapters from services.

| Responsibility | Previous dependency | Current boundary |
| --- | --- | --- |
| Domain errors and site origin policy | Services imported `http.ts`, which loads `NextResponse`. | `http-error.ts` owns the shared error class. `app-url.ts` resolves the configured origin. HTTP error serialization and bounded request parsing stay in `http.ts`. |
| Staff identity and permission | The staff service imported browser session resolution. | `auth/staff-request.ts` resolves a session through `auth/user.ts` and passes its actor to `auth/staff.ts`. The service still reads current roles and honors edition and channel boundaries. |
| Backup identity and permission | The backup service loaded the browser session itself. | The page and API use `auth/backup-request.ts` to resolve the session. The service accepts the resolved actor and checks current global Admin access. Remote and delegated read requests are rejected before session resolution. The operator still receives the authenticated actor and database identity over its configured socket. |
| Result publication and cache | The result route directly invalidated the public tournament layout inside its error handler. | The route awaits the committed command and uses its `publicChanged` signal to invalidate the same layout through `next-revalidation.ts`. If scheduling throws, the adapter logs a fixed diagnostic and the route returns the saved receipt. The existing command key lets a retry request the same invalidation without a duplicate audit event. |

The lint rules protect service and DB modules from importing Next.js or the
HTTP, browser auth and cache adapters. Route handlers use
`next-revalidation.ts` for path invalidation.

## Cache invalidation after writes

Route handlers await the saved result before requesting invalidation. Each
path is attempted independently, so a scheduling failure preserves the
response and does not prevent subsequent paths from being requested. Next.js
revalidates a marked path on the next visit. Preview and rejected commands
skip invalidation.

| Write | Paths requested after success |
| --- | --- |
| Tournament configuration and unused draft deletion | Root layout |
| Registration removal and restoration | Admin, players and selected public tournament layouts, plus dashboard |
| Mappool, fixture, result import and round referee policy commands | Selected Admin and public tournament layouts |
| Mappool workbench commands | Selected Admin workbench page |
| Streaming task changes | Selected Admin tournament layout |
| Player practice and availability | The corresponding player page |
| Schedule requests | Selected public and Admin tournament layouts |
| Result review | Selected public tournament layout when `publicChanged` is true |

## Remote reads and profile refresh

`next-frontend-request.ts` reads the opaque remote connection cookie at the
Next.js entry point. Server components and metadata share a React-cached
context for one render. A route handler creates its own context. Nested
entry points reuse the current context. The read services verify the connection
within this scope and share its pending read promises. The context carries
the connection ID and request-local cache. The remote session
vault retains credentials. The next request verifies its connection again.

The player page and legacy profile route supply the local session's subject
and Next.js `after` to the profile service. The service owns refresh
deduplication, claims and backoff. The scheduled callback returns the
refresh promise. Callers without a scheduler, or with a scheduler that
throws, await the refresh while returning the selected stale snapshot.
Remote and delegated reads continue to use saved snapshots.

## Same-origin extraction

Keep pages, cookies, OAuth and the existing URLs in the Next.js adapter while
moving one backend domain at a time behind an internal service endpoint. Start
with saved reads, then move the read and write handlers of a domain together
when its contracts and transaction tests pass. Treat the existing loopback
Developer channel as read-only.

The backend receiving a browser operation must resolve the existing session
against its authoritative store, honor revocation on the next authorization
check, and look up current roles and edition grants. Identity and channel come
from trusted authentication at the entry point. Request JSON remains domain
input. Writes, audit entries and publication state commit under one transaction.
Keep the current migration runner as the sole schema owner when both processes
are running.

The Next.js adapter remains responsible for frontend cache invalidation after a
committed response. Preserve the saved receipt if invalidation scheduling fails.
Before moving another route, compare the same contract, status and authorization
results through both entry points. Roll back by routing that domain back to its
original in-process handlers on the same schema, preserving committed changes
and existing sessions.
