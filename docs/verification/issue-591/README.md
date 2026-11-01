# #591 verification — 2026-10-31

Implemented on `codex/591-schedule`, based on main `ae35868a`. No real fixture,
role assignment, credentials or deployment was changed. The organizer's original
checkout and its unrelated edits were preserved in place.

## Original local results (`b5b45f21`)

Node.js 24.22.2, npm lockfile, PostgreSQL 17, installed Chrome:

- `npm ci` completed; FullCalendar Standard 7.1.3 and temporal-polyfill 1.0.1 pinned.
- `npm run check` passed. Subsequent UI refinements passed the production build's
  TypeScript check and focused ESLint; the final clean-tree check is also recorded
  in the PR.
- Full `npm test`: **1,902 passed, 2 skipped**, 236 files. The initial inventory
  failure and a new remote-route boundary assertion were fixed before this pass.
- After the final business-history projection refinement, the affected schedule,
  shared contract and i18n checks passed **29/29**. Raw audit snapshots/private
  staff identities are excluded from the team-facing business history.
- `npm run i18n:extract` and `npm run test:i18n` passed, with all three catalogs filled.
- Final `npm run build` passed, including TypeScript and route generation.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Fresh migration of the original `0064_schedule_requests` passed against isolated test targets;
  the full suite also exercises historical migration/upgrade/replay paths.
- `git diff --check` passed.

Integration coverage includes player/captain/staff and cross-edition boundaries,
read-only channels, private availability, input bounds, revision conflicts,
idempotent retry/payload mismatch, simultaneous first proposals, approval versus
withdrawal, counterproposal confirmation, rejection notes, self-review denial,
permanent invalidation after changes, actual referee activity versus saved
settings, and request/event retention after fixture deletion.

## Browser results

**8 affected desktop/mobile browser checks passed**: six existing fixture planning,
referee assignment and streaming checks, followed by the final two new schedule
checks after fixing the calendar accessibility issues they uncovered.

The schedule test uses real authenticated synthetic browser sessions and the
actual production build/API. It covers a player saving availability, persisted
reload and opponent privacy; desktop pointer dragging into draft slots; native
keyboard scrolling; both captains agreeing; an independently granted edition
Admin approving; unchanged official time before approval and updated time after
approval; CSRF denial; all three locales; light/dark and 320px mobile containment.
Axe checks pass for the tool excluding color contrast; screenshots were visually
reviewed for layout and theme legibility. FullCalendar's scroll viewport retains
valid table/rowgroup semantics while accepting keyboard focus.

Default `npm run test:e2e -- --project=desktop --project=mobile --max-failures=1`
could not start because another service already occupied port **3100**. It was
not stopped or reused. A temporary copy of the existing Playwright configuration
and synthetic provider fixture used port **31591**, the same database safety and
synthetic credential guards, and a separate `oclr_591_browser_test` database.
The affected specs ran with `OCLR_TEST_ORIGIN` set to that origin and
`PLAYWRIGHT_CHANNEL=chrome`. The unit/integration target was `oclr_591_test`.
No demo or production data was used.

The full 956-case desktop/mobile browser matrix therefore remains **unverified**;
these eight results do not establish a full regression pass. CI status is tracked
for the exact pushed commit in the PR, separately from these local results.

Screenshots show synthetic identities and times only:

- [Desktop, light](desktop-light.png)
- [320px mobile, Traditional Chinese](mobile-hant.png)

## Review and operations

New Simplified/Traditional Chinese interface wording was approved by the organizer
on 2026-10-31 during the acceptance review below. This supersedes the pending
wording review recorded in the original PR handoff.
Apply the additive migration through the normal approved deployment process
before running the new application. Preserve the tables, events and invalidation
triggers on application rollback. No production migration/deploy, grant or issue
closure was performed during the implementation/merge phase. The acceptance
checkpoint below records the later issue-closure decision separately.

## Latest-main reconciliation — 2026-10-31

The organizer requested CI review and merge. Original PR CI
[run #1077](https://github.com/OCLR-dev/OCLR-website/actions/runs/41166929455)
passed the configured core plan for `b5b45f216c131b1a8d512affdc8b150d80696b0c`;
full/header/remote matrices were correctly skipped, not passed.

Main subsequently reached `8e4cbbae` and already contained
`0064_mappool_candidate_rounds`. The branch now preserves main's migration and
snapshot verbatim, renumbers Schedule to **`0065_schedule_requests`**, and
regenerates snapshot 0065 with snapshot 0064 as its predecessor. All three
translation catalogs retain both features' entries. The Schedule SQL and
invalidation triggers are unchanged apart from the migration filename.

Post-reconciliation local results:

- Fresh migration through both 0064 and 0065 passed.
- Full unit/integration suite: **1,907 passed, 2 skipped**, 236 files.
- New upgrade regression passed: start at main's 0064, save an actual candidate
  round plan, apply 0065, verify that plan remains identical and all three
  Schedule tables exist, then replay migrations without changing the plan or
  migration history. Snapshot ancestry is checked in the same test.
- Production build passed; contract/matrix generation checks passed.
- The two real desktop/mobile Schedule flows passed again on the freshly
  migrated isolated browser database using the same dedicated port setup.
- Current CI evidence and the exact updated head are recorded in PR #599.

That reconciliation fixed integration with current main; by itself it did not
establish full browser regression, Chinese wording acceptance or deployment. The
later organizer wording approval is recorded in the acceptance audit below.

## Acceptance audit — 2026-10-31

The organizer explicitly requested checking every #591 acceptance condition,
updating the evidence and closing the issue if complete. The organizer also
explicitly approved this feature's new Chinese interface wording in the same
conversation. This approval applies to both Chinese catalogs introduced by
PR #599; it is separate from deployment authorization.

Implementation: merged PR [#599](https://github.com/OCLR-dev/OCLR-website/pull/599),
main `34a0398f383c8b01f2547bf2c9a8d1ee6d939361`. Its tree
`5bf67bebf079371812faa5a17707774884c71b85` equals verified PR head
`8324b2e7dd27fae9a0e8ee38009d36ea40586150`.
[CI #1083](https://github.com/OCLR-dev/OCLR-website/actions/runs/41169657665)
is **completed / success**: verify, build, both core functional browser shards,
remote-e2e and aggregate check passed. Header-e2e, remote-matrix and full-check
were skipped by the fixed core plan, not passed.

### Acceptance-condition evidence

The rows follow the issue's twelve main acceptance conditions in order.

| #   | Result                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pass                                   | [Schedule E2E](../../../tests/e2e/schedule.spec.ts): player entry, multiple intervals, edit/delete, real persistence after reload, opponent privacy and absent captain controls. [Integration](../../../tests/integration/schedule.test.ts) rejects forged actors and outsider access.                                                                                                                                                                                                      |
| 2   | Pass                                   | Integration asserts captain-only detail, unreported count, and no disclosure to the opposing team or an independent Admin. [Projection tests](../../../tests/unit/schedule-model.test.ts) count people once despite overlapping intervals. Rejoined members do not inherit former submissions.                                                                                                                                                                                              |
| 3   | Pass                                   | Real desktop/mobile E2E executes player → captain A → captain B → independently granted edition Admin. Integration checks unchanged public fixture before approval and the new public instant after approval.                                                                                                                                                                                                                                                                               |
| 4   | Pass                                   | Integration covers fresh agreement after counterproposal, own-proposal confirmation denial, idempotent approval, payload/key mismatch and concurrent first proposals.                                                                                                                                                                                                                                                                                                                       |
| 5   | Pass                                   | Parameterized decline/withdraw/staff-reject cases preserve official time and history, reject later approval and leave no success event/audit. Staff rejection requires a visible decision note.                                                                                                                                                                                                                                                                                             |
| 6   | Pass                                   | Integration covers official-time change-and-reversal, opponents, captain appointment/membership, revoked edition Admin grant, cancelled/in-progress fixture, saved results, publication, edition lock and operational referee events. The time projection tests expire passed plans without rewriting terminal history.                                                                                                                                                                     |
| 7   | Pass                                   | Actual `fixtureCommand` and `refereeCommand` race with Schedule approval; only one succeeds. Approval-versus-withdrawal is also tested. Fixture versions/times, request state, approval events and reschedule audit counts remain consistent with the winning operation.                                                                                                                                                                                                                    |
| 8   | Pass                                   | Public fixture read-model assertion, retained referee/streamer assignments and unchanged stream confirmation baseline establish the approved instant and reconfirmation requirement. Existing fixture/referee/streaming browser regressions passed in the implementation batch; core read-API/remote checks passed CI #1083. The Schedule API revalidates tournament and Admin layouts after mutations.                                                                                     |
| 9   | Pass                                   | Extended desktop/mobile E2E verifies cross-midnight UTC round trips, multiple slots, modification/removal, stale 409 feedback and explicit reload, long multilingual names, keyboard scroll, three locales, both brightness modes and 320px containment. [Shared time-input tests](../../../tests/unit/edition-time.test.ts) cover explicit DST ambiguity, nonexistent dates and non-hour offsets; Schedule projection tests preserve distinct DST instants.                                |
| 10  | Pass                                   | Acceptance audit reread the installed Next 16.4.2 Route Handlers, Server/Client Components and Caching guides under `node_modules/next/dist/docs/01-app/01-getting-started/`. Awaited route params, authenticated request-time private reads, client-only calendar and mutation revalidation follow these APIs. Refactoring UI hierarchy/spacing guidance was reviewed against the existing MainSheet layout and the desktop/mobile screenshots below. No new visual system was introduced. |
| 11  | Pass within the documented issue scope | See the exact local results below and immutable CI evidence above. Tests use separate isolated test databases; upgrade/replay and retained history have explicit regression coverage. Desktop/mobile Schedule E2E passed. This does not claim full-site release regression or deployment.                                                                                                                                                                                                   |
| 12  | Pass                                   | Organizer explicitly approved the new Chinese wording on 2026-10-31 after being given the PR message catalogs and actual mobile screenshot. Design, implementation, merge, technical verification and organizer wording approval are recorded as separate events.                                                                                                                                                                                                                           |

The five FullCalendar introduction checks are also satisfied: locked Standard
7.1.3 and MIT dependency; successful production build and no runtime/hydration
errors in real browser flows; desktop pointer selection and equivalent mobile/
keyboard forms; labelled own/official/proposed states with long-name and narrow
layout coverage; explicit IANA-zone/UTC conversion; private authorized data only;
no drag path can update the official fixture without both captains and staff.
Official/proposed calendar events remain start markers with no asserted duration.

### Additional local verification

This acceptance checkpoint authors tests and documentation only. The Schedule
services/components, dependency lockfile and migration 0065 are unchanged from
the verified merge; the intervening main update is preserved.

- Full `npm test` on the verified merge plus these acceptance tests: **1,920 passed,
  2 skipped**, 236 files (286.85 seconds).
- `npm run check`: passed, including a fresh pass after synchronizing main
  `0a8cbf9605c252c5a9c26f3f79e81eb0ce6ba332` (PR #601).
- Extended Schedule E2E: **2 passed** (desktop and mobile, 24.3 seconds).
  This first run reused the production build from the verified merge.
- A fresh production build after syncing main `0a8cbf96` also passed; the final
  desktop/mobile rerun against that build is recorded below: **2 passed** (desktop and mobile, 25.1 seconds).
- After that main update, the affected Schedule, time input, player/read-model
  and remote-boundary tests passed **96/96** across seven files.
- The new main instructions require read-contract regeneration/checking after
  integration: `npm run read-api:generate` produced no diff;
  `npm run read-api:check` passed 56 contracts, 171 coverage rows and **8 tests**.
- Before publication, main additionally reached `a909135ef70be6c6ceaf4468e4f24a40cf3ae24e`
  (PRs #604/#605). These IRC/mappool changes are preserved; Schedule
  services/components remain unchanged. The affected Schedule/IRC unit and
  integration checks passed **68/68** across three files. Read-contract
  regeneration/checking was repeated after this integration with no generated
  diff. The full-suite/build/browser results above remain tied to their stated
  checkpoints, not relabelled as a full regression of unrelated changes.
- `git diff --check` and local documentation-link checks passed.
- Existing build, audit, i18n extraction/checks, clean install and 0064 → 0065
  upgrade/replay evidence remain above and in CI #1083; no dependency, interface
  message, runtime or migration change was authored in this checkpoint. The
  intervening main update is preserved and its affected checks are distinguished
  from the full-suite run above.

The first local retry used a Unix-socket URL, which is accepted by ordinary
Schedule tests but unsupported by the deployment/backup test harness. The final
full-suite run uses the same dedicated `oclr_591_test` target through loopback
TCP. No application code or database transport policy was changed to bypass
that harness. Browser checks use separate `oclr_591_browser_test`, port 31591,
and the synthetic-only provider guard copied to a temporary ignored location.
Existing services on port 3100 and the original dirty checkout were preserved.

New, visually reviewed evidence with deliberately long synthetic team names:

- [Desktop, light](acceptance-desktop-long-name.png)
- [320px mobile, Traditional Chinese](acceptance-mobile-hant-long-name.png)

Guidance reviewed:
[Refactoring UI skill](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md),
[hierarchy](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/references/hierarchy.md),
[layout and spacing](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/references/layout-spacing.md).

Issue-specific technical acceptance and organizer wording review are complete. The full 956-case local browser matrix and
full-only CI lanes remain unverified, as already disclosed; the organizer's
fixed core-CI policy is unchanged. This audit authorizes no production migration,
role/credential change or deployment. Issue closure is recorded on #591 after
publishing this verification checkpoint.

## Filter button alignment follow-up — 2026-11-01

The organizer supplied a screenshot of the Schedule review filter row: the
Reload schedule button stretched to the full label-plus-select height. The
shared `.actions` flex row defaults to stretch. A dedicated `schedule-filters`
class now bottom-aligns only this row, retaining the normal MainSheet button
height, palette, radius and keyboard focus treatment.

Verified on main base `d0f4be8697ffff3c77e43683c55e2c37bdee4317` plus this patch:

- Node 24 locked `npm ci` passed; local Next.js CSS guidance and the Refactoring
  UI hierarchy/spacing guidance were applied.
- Actual ScheduleManager and FullCalendar components in an isolated DB-free
  browser host passed **18 layouts**: 1280/390/320px × light/dark ×
  zh-Hans/zh-Hant/en. The host applies the same base CSS variables emitted by
  the production CSS pipeline. Keyboard focus, horizontal containment and
  desktop select/button bottom alignment were checked.
- Restoring the old flex stretch in that host reproduces a **74.42px** button;
  the corrected row yields **44px** in every checked layout. The empty pending
  list matches the reported state. Selecting All requests renders the actual
  FullCalendar for the synthetic fixture; no live fixture or role is used.
- `npm run check`: passed (ESLint, generated route types and TypeScript).
- `npm test` without database configuration: **1,466 passed, 669 skipped** (181 passed files, 71 skipped files). Database-backed
  integration and authenticated full E2E were not rerun for this CSS fix.
- `npm run build`: passed (production compilation, TypeScript and route generation).
- `npm run read-api:check`: passed (56 contracts, 174 coverage rows, **8 tests**).
- Production dependency audit and `git diff --check`: passed; **0 vulnerabilities**.

Visual evidence (default appearance; not a full appearance matrix):
[reproduced before](filter-button-before.png),
[desktop after](filter-button-after-desktop.png),
[320px mobile after](filter-button-after-mobile.png).
