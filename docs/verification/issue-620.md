# #620 — Inherited referee room settings

2026-10-31, Asia/Taipei. Branch `codex/referee-inherited-room`.

Room settings in the referee panel are read-only. Command generation and both
workspace settings projections inherit the current saved round policy; room names
use the existing season/team generator. The Streamer is the current fixture task's
saved osu! identity with an active edition/global Streamer role. A missing,
cancelled or ineligible assignment yields no addref command. Normal panel refresh
and IRC workspace polling accept changes to inherited settings even when the BP
revision is unchanged. Task identity changes do not invalidate BP decisions.

The round-policy navigation button and per-fixture draft/save controls are removed.
Timer shortcuts use the policy's saved durations; a missing start countdown is not
replaced by a fallback. Existing historical settings and events are not rewritten
on GET. The legacy save action rejects overrides, retaining authorized idempotent
receipt replay. Raw IRC command control remains separate from rule storage.

## Verification

- Node 24, `npm ci`, lint/types, production build, i18n extraction/check and generated
  read API contracts/check. The generated schema uses the existing settings schema
  reference without changing its wire fields. Production audit: 0 vulnerabilities.
- 61 targeted unit/render/catalog/read-contract tests passed. They cover stale
  session overrides, the removed rule link/editor, unavailable missing settings,
  policy timer values/deduplication and no fallback countdown.
- 38 referee/IRC/round-policy integration tests passed against a dedicated
  `oclr_620_test` database, including saved-policy changes, legacy override rejection,
  task reassignment/cancellation, username changes, wrong-edition/revoked roles,
  history preservation, revisions and idempotency.
- 27 desktop-auth/read-API/reconciliation integration tests passed against that
  same isolated test target. No preview or production data was used.
- Initial full available `npm test`: 1,395 passed, 657 skipped, 14 failed, with
  three unhandled errors. Failures were local listener/process restrictions and
  an OpenAPI generation/read timing overlap. All affected files were rerun with
  generation complete and normal local permissions: 52 environment-related tests
  and the targeted read-contract tests passed. This is not reported as a single
  passing full database suite.
- Initial restricted build was stopped after stalling; the normal-permission
  build completed successfully. Creating a new PostgreSQL process hit the host's
  shared-memory limit, so an existing local test server was used to create the
  dedicated new database instead; existing databases/services were not modified.
- E2E/Playwright not run (too slow), following current repository policy. Static
  component rendering covers source values and removed controls; no browser or
  real IRC acceptance is claimed. No deployment or real tournament write occurred.

Exact commit and CI status are recorded on the issue after push. Chinese wording
and final organizer acceptance remain reviewable separately.
