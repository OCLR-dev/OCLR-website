# #623 — Private BP uses saved rosters

2026-10-31, Asia/Taipei. Branch `codex/referee-saved-rosters` starts from website
main `a8992ebc` after PR #622 merged. Corresponding IRC PR #67 merged as
`60a4aaa`; both local main worktrees were fast-forwarded and verified equal to
origin/main. Website issues #620/#621 were confirmed closed by PR #622.

The referee workspace previously called fixtureForReview for roster identities,
which added the finalized/published result-reporting prerequisite to BP readiness.
It now reads the fixture's saved active memberships after its own existing
role/edition/appointment check. Unpublished captains/teams, unfinalized rosters and
unpublished rosters can record BP and produce invitations from saved usernames.
No public flags are changed and no player identity is fabricated.

Archived/unresolved teams stay unavailable. Roster IDs still enter the existing
fingerprint shape; changed saved memberships keep the dependency/reconfirm guard.
The result review/approval and public publication policies remain in their own
services. No data migration or interface wording change is needed.

## Verification

- 56 related isolated DB tests passed: referee workspace, IRC, fixture integrity
  and desktop authorization. New cases cover unpublished/unfinalized rosters,
  captain publication, successful BP, saved invite identities, unchanged public
  flags, former-member exclusion, roster dependency conflicts, archived teams and
  unassigned rejection. Existing private/public/result gates remain covered.
- Ordinary check and production build passed. Available full npm test:
  **1,425 passed / 655 skipped** (full DB suite not enabled for this invocation).
  Generated read contracts/check passed without wire-field changes; formatting
  and diff checks passed. Production dependency audit: zero vulnerabilities.
  Exact commit and CI status are recorded on the issue after push.
- Browser/E2E not run (too slow), per current policy: this change concerns backend
  readiness and protected saved-data reads, not browser geometry.
- No production, real fixture/role/publication edits or deployment. Source and
  test changes do not claim live IRC or organizer release acceptance.
