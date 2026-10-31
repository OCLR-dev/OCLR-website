# #626 — Explicit captain room invitations

2026-10-31, Asia/Taipei. Branch `codex/referee-saved-rosters`; this follows #623
and integrates current main `f1544e39` without rewriting the published branch.

The invitation generator always adds each team's saved captain first, including
when `members` is an explicit empty array. It uses saved captain UID/username and
deduplicates roster entries by UID. Captain rows have a distinct translated action
label. Existing player invitations and the prepare/copy/send flow stay available.
Missing/invalid usernames cannot produce a numeric-UID fallback or executable
invitation. No room control or website role is granted by this change.

## Verification

- 57 targeted command/render/catalog tests passed: empty rosters, explicit captain
  rows, a captain appearing in the roster, duplicate roster IDs, saved username
  precedence and existing unsafe-name/identity validation.
- Ordinary check passed. Full available npm test: **1,448 passed / 657 skipped**
  (full DB suite not enabled for this invocation). Catalog extraction/check and
  generated read-contract generation/check passed without new wire fields.
  The production build and final audit results are recorded on the issue after
  pushing. There is no data migration or actual room invitation.
- E2E/Playwright not run (too slow), following current repository policy. Static
  component rendering verifies the actual translated action/command composition;
  it does not establish live IRC or browser acceptance.
