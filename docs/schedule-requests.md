# Schedule requests (#591)

The edition Schedule links to `/tournaments/[edition]/schedule/requests`.
Current players can save up to 40 availability intervals for each published,
confirmed fixture involving their team. Each interval is an explicit start/end
instant in the fixture's IANA time zone; stored data uses UTC. Overlapping slots
from one player count once. Missing submissions are shown separately and never
mean that a player is available. Only the player and their current captain can
read individual intervals. Leaving a team removes access; a later membership
does not inherit the old membership's availability.

Current captains propose one new start time per active request. Proposing means
the author agrees; only the opposing captain can confirm it. A counterproposal
creates another version and requires the other captain's fresh agreement.
Both agreements submit the request to staff. Either captain can withdraw their
agreement before approval; an unanswered proposal can only be withdrawn by its
author. Staff cannot alter the proposed time while approving it.

The Admin matches workspace links to
`/admin/tournaments/[edition]/matches/schedule-requests`. Only current
`manage_fixtures` holders can review. Captains who also hold Admin cannot review
their own fixture's request. Staff rejection requires a decision note visible
to both teams. Approval updates the request, fixture time/version and automatic
audit in one transaction. Until then, the existing official fixture remains the
only public schedule authority. Publication, teams, pool, results, referee and
streamer assignments are not changed. Existing streaming reconfirmation detects
the changed official time; staff see a reminder to check coverage. Same-start
conflicts use known teams/operators, without inventing a match duration.

A fixture needs a future, known official start and confirmed published opponents.
TBA first scheduling stays in the existing Admin editor. Locked/completed or
historical editions, cancelled/in-progress fixtures, saved results and recorded
referee actions are ineligible. The service rechecks eligibility and current
captains under the edition lock shared with existing competition operations.
There is no inferred deadline, maximum reschedule count, player-majority vote or
automatic staffing commitment.

Migration `0065_schedule_requests` adds private availability, requests and events.
Database triggers invalidate active requests when the official schedule,
opponents, lineage, captain appointment/publication, team publication,
edition protection, results or referee activity change. Saved referee settings alone do not start a match. Dependent fixture requests
are invalidated when parent results change. Reversing such changes does not
restore old agreements. Time-based expiry is projected on read and rechecked on
every command; GET never writes. Request events retain prior proposal versions. Team-facing history contains only
business actions/times, not raw audit snapshots or private staff identities.
Fixture deletion keeps request snapshots and decisions with a null live fixture
reference. Availability is removed with its fixture; private slots are never
copied into shared audit events. Existing fixture-deletion protections still
apply.

All commands use same-origin authenticated browser sessions, bounded JSON,
expected revisions and actor-scoped idempotency keys. Simultaneous proposals,
withdrawal and approval serialize in the same lock order as fixture/referee
operations. Remote/Developer delegated channels reject these new routes and
never obtain business writes or personal time slots. No new saved-read or public
API resource is introduced.

## FullCalendar

Uses MIT-licensed `@fullcalendar/react` 7.1.3 and its required
`temporal-polyfill` 1.0.1. Standard week/day and interaction plugins are imported
from v7 subpaths. No Premium packages, license key, additional UI framework or
external calendar service is needed. Calendar assets load only in the request
tool, with MainSheet variables applied to the Classic theme.

Desktop supports dragging to select a slot. Phones default to a day view;
explicit start/end inputs, editing and removal remain available to keyboard and
touch users. Dragging adds a slot to the draft list; only Save availability persists slots.
Selecting a time can prefill a captain proposal but cannot change the official
fixture. Official and proposed starts are labelled start markers without a
claimed end time. Staff approval remains a separate confirmation.

Apply the additive migration before running this release. Application rollback
must retain these tables, events and invalidation triggers; do not remove saved
requests or rewrite history. This document does not authorize a production
migration, role grant or deployment. The organizer approved the new Chinese interface wording on 2026-10-31 during
[#591 acceptance](verification/issue-591/README.md#acceptance-audit--2026-10-31).
