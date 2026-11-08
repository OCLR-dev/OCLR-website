# Service and Next.js boundaries

The website continues to run on Node.js and PostgreSQL. This first change for
#1012 separates error, staff request and result publication boundaries.

| Responsibility | Previous dependency | Current boundary |
| --- | --- | --- |
| Domain errors and site origin policy | Services imported `http.ts`, which loads `NextResponse`. | `http-error.ts` owns the shared error class. `app-url.ts` resolves the configured origin. HTTP error serialization and bounded request parsing stay in `http.ts`. |
| Staff identity and permission | The staff service imported browser session resolution. | `auth/staff-request.ts` resolves a session through `auth/user.ts` and passes its actor to `auth/staff.ts`. The service still reads current roles and honors edition and channel boundaries. |
| Result publication and cache | The result route directly invalidated the public tournament layout inside its error handler. | The route awaits the committed command and uses its `publicChanged` signal to invalidate the same layout through `next-revalidation.ts`. If scheduling throws, the adapter logs a fixed diagnostic and the route returns the saved receipt. The existing command key lets a retry request the same invalidation without a duplicate audit event. |

The lint rule protects service and DB modules from direct Next.js imports and
from importing the HTTP, browser auth and cache adapters. The remaining
exceptions identify existing boundaries. `frontend-data.ts` reads the
loopback remote connection cookie and coordinates render caching.
`osu-profiles.ts` still uses Next.js `after` for profile refresh scheduling.
`admin-backups.ts` resolves the browser actor before reaching the separate
operator. The other mutation routes still own their current invalidation calls.
These are the remaining migration points for #1012.

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
