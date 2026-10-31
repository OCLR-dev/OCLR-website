# Overlay login handoff (#616)

2026-10-31. Companion: OCLR-stream-overlay #3.

Implementation uses the existing browser session, Streamer grant and token
issuance service. No migration or production operation is required by this patch.

Verification includes unit tests for allowed origins, duplicate/malicious return
parameters and OAuth state-bound return metadata; mocked route tests exercise osu!
login return/cookie cleanup and ordinary login compatibility. The two actual client
components (website React and Overlay Vue) were exercised together in Chrome at
1440px and 390px using a temporary local service and intercepted synthetic HTTPS
responses: authorize → automatic return → select the second assigned task → local
import with missing rules → disconnect preserving the match. No horizontal
overflow or page errors occurred. Website login/provider transport and token
issuance were synthetic; this is not a real Streamer/OAuth/OBS acceptance claim.

A temporary isolated PostgreSQL cluster could not initialize because this host's
System V shared-memory identifiers are exhausted (`shmget` ENOSPC, 56-byte
segment), including with mmap/posix settings. Docker is unavailable. No existing
database or service was altered; DB integration tests are reported separately as
skipped. The OAuth route checks use explicit mocks and do not replace DB evidence.

Check totals, build/audit and commit-specific CI are recorded in the PR. New Chinese
copy awaits organizer review. Real osu! login, Streamer access/lease/revocation and
OBS checks remain separate operator acceptance.

Recorded local results:

- `npm ci`, `npm run check`, `npm run build`, `git diff --check`: completed.
- `npm test`: 1365 passed, 1 failed, 646 skipped. The one failure detected the new
  connect page's generated remote-route inventory drift. The generator now marks
  the connect page/client as local browser authorization, unavailable in read-only
  remote mode; generated artifacts were refreshed. No full-suite pass is claimed.
- After that fix, `npm run read-api:check`: 56 contracts, 173 coverage rows and 8
  unit checks passed, including the previously failing inventory check.
- Final focused handoff/OAuth-route/page-authorization/i18n tests: 11 passed;
  final changed-file ESLint and diff checks passed.
- `npm audit --omit=dev`: 0 vulnerabilities. The lockfile was unchanged.
- Browser verification also exercised manual copy fallback after disconnect,
  confirming that the input clears and an existing local match remains intact.
