# #777 — Staff action loading and website audit

Inspected on 2026-11-04 (Asia/Taipei), starting from main
`7c2b68900cf96c2944b896b317f87d60509d6ebb` in the isolated
`codex/staff-action-loading-audit` worktree. The original checkout and its
uncommitted changes are preserved.

## Staff repair

The reported buttons are **Hide from About** and **Revoke role**. #738 fixed
the separate **Save roles** action. Visibility and revocation still used
`ConfirmMutation`'s default region feedback: its fragment mounted `LoadingRegion`
inside `.staff-role-actions`, masking both sibling buttons. Hiding a profile
masked the row during the request and route refresh; confirmed actions could
mask it after their dialog closed while the refresh was pending.

Both actions now select the existing `loadingFeedback="button"` behavior. The
compact indicator stays inside its own button through the request and refresh.
The confirmation dialog retains its region lock. Existing request payloads,
confirmation requirements, read-only guards, disabled/ARIA busy state, error
messages and refresh tracking are preserved.

Visual inspection also found that the shared pending label used utility class
names without corresponding CSS rules in the application. A CSS module now
defines its inline flex alignment and 0.5rem gap so the spinner and text remain
separate. This also applies to the existing Save roles button.

All screenshots below use actual client components and application CSS with
synthetic data and intercepted HTTP; they are not production account captures.

- [Repaired staff actions, desktop light](staff-actions-desktop-light.png)
- [Repaired staff actions, desktop dark](staff-actions-desktop-dark.png)
- [Repaired staff actions, 320px mobile light](staff-actions-mobile-light.png)
- [Repaired staff actions, 320px mobile dark](staff-actions-mobile-dark.png)

## Other places with the same pattern

The source scan covers all `src/**/*.tsx`: **45 ConfirmMutation call sites in
25 files** and **21 LoadingRegion call sites in 16 files**, including the
dashboard and server-rendered team page. See the complete
[source inventory](source-inventory.json). Wrapper calls and dynamic action
lists can render several buttons from one source location.

The general tournament settings save row was also reproduced in the actual
`TournamentEditor` browser fixture: during an intercepted slow save, the
`.settings-save` region covers the status text and button, and makes the status
inert. Four desktop/mobile light/dark checks confirmed this existing behavior.

- [Settings mask, desktop light](settings-mask-desktop-light.png)
- [Settings mask, mobile dark](settings-mask-mobile-dark.png)

These additional locations retain the same parent-region behavior in this
patch. Except for the settings reproduction above, the findings below are source
inspection results, not authenticated browser acceptance or production claims.

| Location                                                   | Source                                                                                                                                                                                                     | Finding                                                                                                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tournament settings: save sections and resume registration | [tournament-editor.tsx](../../../src/components/tournament-editor.tsx)                                                                                                                                     | Shared mask covers `.settings-save` or `.section-title`; general settings reproduced in the browser.                                                                    |
| Rounds: create/save and delete next to Edit round          | [round-manager.tsx](../../../src/components/round-manager.tsx)                                                                                                                                             | Shared mask targets `.actions`.                                                                                                                                         |
| Draft: configuration/start and staff control actions       | [draft-order-editor.tsx](../../../src/components/draft-order-editor.tsx), [staff-draft.tsx](../../../src/components/staff-draft.tsx)                                                                       | Several actions share a masked `.actions` row.                                                                                                                          |
| Mappools: batch move/refresh/remove and pool publication   | [mappool-batch.tsx](../../../src/components/mappool-batch.tsx), [mappool-editor.tsx](../../../src/components/mappool-editor.tsx)                                                                           | Batch actions share a parent mask. The existing compact per-map refresh from #699 already avoids it; confirmed icon removal can still use a parent mask during refresh. |
| Captains: per-card actions                                 | [captain-manager.tsx](../../../src/components/captain-manager.tsx)                                                                                                                                         | Shared mask targets `.captain-card-actions`.                                                                                                                            |
| Stage groups: save group assignments                       | [stage-groups.tsx](../../../src/components/stage-groups.tsx)                                                                                                                                               | Shared mask targets `.group-save-controls`.                                                                                                                             |
| Statistics: publish/withdraw                               | [statistics-manager.tsx](../../../src/components/statistics-manager.tsx)                                                                                                                                   | Both confirmation triggers share an `.actions` region; their asynchronous post-save reload also contributes to pending time.                                            |
| Teams: edit, publish identity and publish roster           | [team page](../../../src/app/admin/tournaments/%5Bedition%5D/teams/page.tsx), [team-editor.tsx](../../../src/components/team-editor.tsx)                                                                   | Two shared confirmations and TeamEditor's own post-dialog refresh mask target the same `.actions` row.                                                                  |
| Fixtures: assign referee                                   | [referee-assignment.tsx](../../../src/components/referee-assignment.tsx), [fixture-manager.tsx](../../../src/components/fixture-manager.tsx)                                                               | The assignment component's own refresh mask shares the fixture action container with navigation and management buttons.                                                 |
| Player dashboard: withdraw application                     | [dashboard](../../../src/app/dashboard/page.tsx)                                                                                                                                                           | Shared confirmation refresh can mask the sibling edition navigation action.                                                                                             |
| Schedule, streaming and result-review actions              | [schedule-manager.tsx](../../../src/components/schedule-manager.tsx), [streaming-manager.tsx](../../../src/components/streaming-manager.tsx), [match-review.tsx](../../../src/components/match-review.tsx) | Wrappers inherit the shared region default; the affected container depends on the rendered action.                                                                      |

The remaining direct regions cover an entire form, workspace, list or dialog:
award configuration/review, BWS review, captain availability, Developer/streaming
access, fixture navigation, mappool sorting/replay deletion, message confirmation,
remote connection, audit navigation, statistics workspace and team coaches.
Those broader regions are intentional operation boundaries in the inspected
source; merely finding a gray region does not establish this narrow-row defect.
Historical imports, identity resolution, substitutions/exchanges, registration
review/removal, competition rules and team configuration also use the shared
confirmation component inside larger forms or sections.

Changing the global confirmation default would alter these larger form
boundaries as well. The present repair selects button feedback explicitly for
the two reported staff actions. The other findings above are recorded for
follow-up review.

## Verification

Node.js 24.22.2, npm and the existing lockfile.

- `npm ci --no-fund --no-audit`: completed.
- `npm run check`: passed. After the pending-label stylesheet was added, the
  modified TypeScript files also passed a targeted ESLint run.
- `npm run build`: passed, including TypeScript and production route generation.
  The initial sandbox build stalled before compilation; the successful rerun
  allowed the build subprocesses in this isolated worktree.
- `npm test`: **1,637 passed, 716 skipped**, 199 passing files and 72 skipped
  files. Environment-dependent database tests were skipped. The initial sandbox
  run hit EPERM on local listeners/process fixtures; the complete run was
  repeated successfully with those operations permitted.
- `npm run test:components -- staff-role-form.spec.ts --workers=2`:
  **24 passed**. Actual client components cover show/hide/revoke, slow requests
  and independently held refresh commits, payloads, disabled/ARIA busy state,
  modal cancellation protection, HTTP/network failure and retry, read-only
  controls, existing role-save behavior, sibling focus, compact geometry,
  spinner/text spacing and 320px layout in light/dark.
- Four additional browser investigation checks reproduced the existing
  tournament-settings mask on desktop/mobile in light/dark. The temporary
  investigation test was removed after capturing the evidence; tests that
  require this unfixed behavior are not added to the regression suite.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- `npm run read-api:check`: passed, including 57 read contracts, 182 coverage
  rows and eight contract tests.
- Prettier, modified-file ESLint, all 24 local report links and
  `git diff --check`: passed.

The reported staff regression failed before the repair because the loading
indicator was outside the trigger; the repaired tests then passed. Reviewed
the repaired light mobile/dark desktop screenshots and the settings mask
reproduction. The screenshots use the same staff panel/container classes as
the application.

No environment file was copied into this worktree. Full database-backed
application E2E was not run: no isolated `TEST_DATABASE_URL` was configured.
No real staff grant, publication or revocation request was made. Local results
do not establish production deployment, authenticated end-to-end acceptance
or commit-specific CI.
