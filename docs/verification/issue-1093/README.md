# Streaming custom local ports — #1093

Website-only change based on `4d5e71f2`, verified on Windows with Node.js 24.22.1.
All credentials, session identities and origins used by the tests are synthetic.

## Behavior

- Unset `OCLR_STREAMING_ORIGINS` permits canonical HTTP(S) loopback origins with
  valid ports. Explicit lists retain protocol/port restrictions; empty
  and invalid configuration fail closed.
- Connect, OAuth return, credential creation and browser CORS use the same policy.
  `localhost` and `127.0.0.1` are equivalent at the same protocol/port for allowlists
  and existing/new credentials, per the organizer's follow-up. IPv6 stays distinct.
  Streamer grants, expiry, revocation, actual browser origin/window checks and
  one-time Overlay state are retained.
- Manual access accepts a custom address and preserves the connect page's address
  in the fallback link. A valid local origin blocked by administrator policy gets
  an explanatory page. Malformed and external requests remain unavailable.
- No database migration, deployment or Overlay source changes.

## Verification

- Focused origin, OAuth route/model, page, Developer policy and i18n tests: 48 passed
  across six files. OAuth identity/session transport and page sessions are mocked.
  CORS tests exercise the real HTTP response wrapper with a synthetic read principal.
- ESLint and TypeScript passed. The first `check` run encountered the native SWC
  cache permission restriction; normal user execution passed these stages.
- Historical relation check initially rejected Windows checkout line endings.
  Regenerating with the existing generator produced no Git content diff, and the
  relation check then passed. Read and write API generated checks passed.
- Production dependency audit: zero vulnerabilities.
- Full `npm test`: 196 files passed, 21 failed, 93 skipped; 1,752 tests passed,
  88 failed, 846 skipped, one unhandled error. This is **not** a full regression pass.
  Observed failures include Windows symlink permission errors in update tests and
  an unsupported/denied Unix socket in backup service status tests. No production
  settings or databases were used to work around these environment limits.
- Added a database integration case covering custom-port credential issuance,
  localhost/IPv4 aliases, protocol/port isolation, no-Origin Node reads and administrator restrictions.
  Local integration tests were skipped because no isolated `TEST_DATABASE_URL`
  was configured; the existing Linux CI provides PostgreSQL for these cases.
- E2E/browser suites: not run (too slow for ordinary checks). Real osu! OAuth,
  deployed settings and Overlay/OBS integration remain unverified.

Build and commit-specific CI results are recorded in the PR and issue discussion.

## Operator compatibility

Existing explicit 3001-only lists remain restrictive. After deploying, remove the
assignment from the service environment to permit custom local ports, or add the
intended origins and restart through the approved operator workflow. Listing either
localhost or IPv4 loopback covers both on that protocol and port.
See [configuration instructions](../../streaming-api.md#custom-console-ports-1093).
The Overlay launcher feature remains tracked separately in
[OCLR-stream-overlay #36](https://github.com/OCLR-dev/OCLR-stream-overlay/issues/36).
