# Write API contracts

The [route inventory](write-api-inventory.json) lists the POST, PUT, PATCH and
DELETE handlers exported by Next.js route files under `src/app`. A documented
handler links to its operation ID in the [OpenAPI document](write-api.openapi.json)
and lists its authentication channel, actions defined by the schema, and known
consumers. Pending handlers still use
their existing transport and have yet to be catalogued by command and caller.
The read-only entries are method aliases on the saved-data and streaming read
endpoints that route writes to the read API's rejection logic.

The first two contracts cover player practice saves and deletes, and player
availability saves. The [shared contract module](../src/lib/player-workspace-contracts.ts)
uses the same command validators as the services and defines the receipt
consumed by the HTTP handlers and the player workspace client. Browser sessions,
exact origin, edition eligibility, ownership, version checks and idempotency
continue to be enforced on the server. See [Player workspace](player-workspace.md)
for the business rules and [Developer API access](developer-api.md) for the
separate read-only channel.

The referee IRC relay documents the desktop Bearer `referee:relay` scope,
versioned response envelope and optional capability flags. Sync requests from
older clients can omit `bpSync` and receipt reasons. The [referee integration
guide](referee-panel-integration.md) describes the wider desktop workflow.

The streaming token routes document browser-session creation and revocation,
including the one-time token on creation and repeated revoke behavior. The
issued credential has `streaming:read` scope and is accepted by the
[streaming read API](streaming-api.md). The browser and desktop contracts
describe their existing error formats separately.

Replay attachments use a multipart request for upload and a JSON command for
deletion. The specification distinguishes the stable `.osr` file limit from
the complete multipart body budget and records the version and retry behavior
for both operations.

The registration contracts document player submission, reapplication and
withdrawal, and staff removal and restoration. The public application form can
return a question ID in a 400 response. Staff transitions keep the registration
record and require its current update timestamp. Restoration returns the
registration to pending review.

Staff registration review keeps the existing private application response.
Manual enrollment covers single and batch preview and submission, including
per-row results for batch retries and failures. BWS review shares the staff read
workspace response and checks both the badge fingerprint and review version.
These operations require the edition's registration management capability.

Schedule requests document player availability and captain negotiation through
staff approval. Streaming task changes cover streaming slots and commentary
assignments. Both contracts describe fixture revision checks and repeat
requests. Streaming responses also identify when a request was replayed.

Captain appointments, team configuration and draft transitions use the same
workspace response schemas as their saved reads. Team identity edits document
the optional avatar file and the complete form body budget. Draft pick receipts
include the current correction status on replay. The inventory lists commands
inside the versioned command envelope.

Award reports document settings revisions, publication fingerprints and
withdrawal of an active release. Historical statistics document archived MP
import, review and fixture release. Both operations return their saved staff
workspace and retain separate capabilities for review and publication.

Official mappool edits return the saved workspace and check the relevant
round or pool version. The preview endpoint returns a single verified beatmap
or per-row batch results. The separate selection workbench documents candidate
preview, classification, round links, skillsets and versioned comments.

Fixture management returns the staff workspace or a force-delete preview
with a fingerprint and blockers. Referee assignments use a separate revision.
Round referee policy changes can also update the best-of series under the
current round version.

Match imports save official source evidence, and preview returns participant
attribution with the current fixture and result versions. Result commands
document review, approval and publication as separate permissions. Import and
result commands return the existing private review workspace and check retries
by request key and payload.

Referee events, MP bindings and saved evidence reconciliation return their
private workspace together with a receipt or binding. MP status reads through
the same POST without provider work. Sync stores provisional scores, and
reconciliation records links to saved evidence.

The referee IRC browser endpoint documents queueing, saved BP synchronization
and disconnect. Its response includes the current browser-visible relay and
referee workspace. The desktop relay has its own Bearer scope and envelope.

After changing a route or contract, run `npm run write-api:generate` and commit
the generated JSON with the source. `npm run check` checks for stale files and
contracts without a matching handler. The inventory covers HTTP write handlers.
Read contracts and GET endpoints with side effects, including the OAuth
callback, are outside this inventory.
