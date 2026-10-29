# OCL Chess (#379)

The desktop header and mobile navigation both link to `/games/ocl-chess`: a permanent 128×128 canvas,
16 indexed colors, authenticated osu! browser-session placement and a 30-second
per-account cooldown. Public visitors may watch. The canvas starts paused after
migration 0057; only a global Admin can open it or clear a bounded rectangle.
Edition-only Admin grants do not authorize canvas moderation. No runtime role,
credential, production migration or deployment is part of this implementation.

Selecting a cell never writes. Dragging scrolls the canvas; zoom buttons and
numeric X/Y controls provide touch and keyboard access. A separate confirmation
saves the selected color. Failed/uncertain writes retain their request UUID for
retry; pixels are rendered only from saved server responses. Each visible client
polls every three seconds, with one in-flight read and a ten-second timeout.
The remote read-only frontend currently reports the canvas unavailable; it never
opens local DB access or sends game writes through Developer access.

The database singleton row serializes placements and moderation until commit.
The later committed operation wins a same-cell conflict. Server database time
sets cooldowns, and the transaction saves the pixel, cooldown and immutable event
together. Repeated UUIDs with the same actor and payload do not write or extend
cooldown; reused UUIDs with different payloads are rejected. Moderation requires
the displayed revision and rechecks global authorization inside the transaction.
Coordinates, colors and bounded request bodies are validated server-side.
All writes require same-origin browser requests. Public snapshots expose neither
actor IDs nor the event log. `chess_events` retains actor, operation, revision and
time for authorized operator review; history replay, restoration and export are
outside this version.

The fixed 16 KB indexed snapshot bounds response size and avoids per-cell DOM
nodes. This is a first-version polling design, not a measured high-concurrency
capacity guarantee. Lock and statement timeouts bound write waits; no background
workers or changes to core tournament services are introduced. Account cooldowns
are not a replacement for deployment-level abuse protection.

Checks include input-boundary unit tests, real PostgreSQL concurrent retry,
cooldown, same-cell ordering, moderation permission/revision and clear/audit
integration tests, plus desktop/mobile browser confirmation and uncertain-save
retry tests. Component browser tests mock HTTP; they do not establish production
OAuth, deployment acceptance or large-scale load capacity. New Chinese wording
requires organizer review. See the issue for commit-specific verification results.
