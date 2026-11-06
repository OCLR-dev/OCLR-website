# Competition settings and multiple commentators (#931, #932, #934)

Verified on 2026-11-06 (Asia/Taipei), using Node 24.22.2 and the npm lockfile.
Branch: `codex/931-932-934-competition-streaming`, based on main `5a2029ed`.
Implementation commits: `07fe82cb` (#931), `32b66bf1` (#932),
`a4343334` (round component verification), `12f0f9e7` (#934).

## Behavior

- Group rounds show a secondary navigation button beside the competition heading,
  pointing to the same edition's `/teams#groups`. Exhibition and knockout rounds
  omit the group-only link. Exhibition scoring settings remain editable.
- Scoring rules and applicable group ranking rules stack vertically at desktop
  and mobile widths.
- Admins expand **Choose Commentators**, select several people with checkboxes,
  review the names, and confirm once. Existing bookings remain; each commentator
  can still be cancelled or reconfirmed individually. Streamer assignment remains
  single-person.
- The commentary `assign` command accepts either legacy `userId` or a distinct
  `userIds` array (1–100). One locked transaction checks eligibility, ownership,
  fixture status and versions, inserts all selections, increments the shared
  revision once, and records one idempotent audit event. Any invalid selection or
  conflict rejects the whole operation. The UI retains uncommitted selections
  and the error when refreshed versions arrive.

## Final combined verification

| Check                                                  | Result                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `npm ci`                                               | Completed with Node 24                                                     |
| Isolated PostgreSQL 17 migrations                      | Passed, dedicated loopback-only `oclr_931_932_934_test`                    |
| `npm run check`                                        | Passed: ESLint, TypeScript, 31 historical relations                        |
| `npm test`                                             | 289 files passed; 2552 tests passed, 2 skipped; 435 seconds                |
| `npm run build`                                        | Passed                                                                     |
| `npm audit --omit=dev`                                 | 0 vulnerabilities                                                          |
| `npm run i18n:extract` / `npm run test:i18n`           | Synchronized; 4 tests passed                                               |
| `npm run read-api:generate` / `npm run read-api:check` | 59 contracts, 185 coverage rows, 8 tests passed; generated files unchanged |
| Focused DB-free Chromium components                    | 14 passed across desktop and mobile, 7.6 seconds                           |
| Formatting / `git diff --check`                        | Passed                                                                     |

The focused browser command selected the existing streaming workflow tests plus
the group-navigation and rule-saving cases in `round-referee-policy.spec.ts`.
It covers multi-selection, deselection, keyboard operation, confirmation,
revision conflicts, draft retention, saved-list refresh/reload, individual
controls, self-selection, read-only fields, accessibility and overflow. The
rule-saving case additionally checks vertical section geometry and retains its
failed-score-policy assertions. The round fixture now processes MainSheet's
Tailwind tokens like the streaming fixture, so screenshots use the actual font
and spacing variables.

Two integration cases add batch receipts/concurrent retry, retained bookings,
individual cancellation, invalid/duplicate targets, role and edition boundaries,
revocation and stale revisions. Existing tests retain the single-person
authorization, reconfirmation and idempotency coverage. No tests were removed or
moved to another suite. The existing full E2E selector was updated for checkboxes;
full E2E was **not run (too slow)**. No new full E2E flow or appearance matrix was
added.

An initial test attempt started before the isolated schema migration succeeded;
it was stopped and repeated after migration. The table reports the final runs.
The local checks establish no production deployment or live-account rehearsal.

## Visual evidence

All identities, matches, dates and conflicts are synthetic. Light screenshots
come from the focused tests. The Traditional Chinese dark mobile captures were
also inspected, including checkbox interaction and exhibition link absence.

- [Desktop commentators, light](commentators-desktop-light.png)
- [Mobile commentators, light](commentators-mobile-light.png)
- [Mobile commentators, dark / zh-Hant](commentators-mobile-dark-zh-Hant.png)
- [Desktop rules, light](rules-desktop-light.png)
- [Mobile rules, light](rules-mobile-light.png)
- [Mobile rules, dark / zh-Hant](rules-mobile-dark-zh-Hant.png)
- [Exhibition rules, dark / zh-Hant](exhibition-mobile-dark-zh-Hant.png)

New catalog wording for organizer review: `Choose Commentators` → `选择解说员`
(zh-Hans), `選擇解說員` (zh-Hant). This batch requires no database migration.
Commit-specific CI is reported on the PR and linked issues.
