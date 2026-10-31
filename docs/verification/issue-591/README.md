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

New Simplified/Traditional Chinese interface wording awaits organizer review.
Apply the additive migration through the normal approved deployment process
before running the new application. Preserve the tables, events and invalidation
triggers on application rollback. No production migration/deploy, grant or issue
closure was performed.

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

This fixes integration with current main; it does not claim a full browser
matrix, Chinese wording acceptance, or production deployment.
