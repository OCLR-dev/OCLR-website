# Write API contracts

The [route inventory](write-api-inventory.json) lists the POST, PUT, PATCH and
DELETE handlers exported by Next.js route files under `src/app`. A documented
handler links to its operation ID in the [OpenAPI document](write-api.openapi.json)
and lists the consumers migrated to that contract. Pending handlers still use
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

After changing a route or contract, run `npm run write-api:generate` and commit
the generated JSON with the source. `npm run check` checks for stale files and
contracts without a matching handler. The inventory covers HTTP write handlers.
Read contracts and GET endpoints with side effects, including the OAuth
callback, are outside this inventory.
