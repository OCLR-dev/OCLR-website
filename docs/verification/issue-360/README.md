# Issue #360 verification

Base: upstream `d34378e`. Branch: `codex/issue-360-player-identity`.
Local work performed on 2026-10-26 (America/Los_Angeles). This is implementation
and local evidence, not deployment or issue acceptance.

## Implementation

- Dashboard links every authenticated UID, independent of public participation.
- Known-identity profiles handle empty participation and unavailable statistics;
  anonymous requests cannot discover login-only/private-only accounts.
- UID-based native/archive aggregation deduplicates each edition and preserves
  original historical names, roles, teams, source references and recorded placing.
- Persistent account/provider/archive name evidence survives empty/failed snapshots;
  unresolved people and reused names never merge identities. Unknown rename and
  original observation dates remain unknown.
- Publication-filtered alias searches, subject-bound and edition-authorized reads,
  additive v1.3 saved-only resources and negotiated v1.2 remote compatibility.
- The ruleset control reuses the preference menu's styling and keyboard behavior,
  updates immediately, preserves edition/scroll and shows a plain spinner over a
  dimmed backdrop only during this control's transition. No global rollout.
- Fixed Windows path normalization in the remote route inventory generator; its
  generated allowlist remains equivalent on Windows and POSIX.

## Migration and backfill

Migration 0049 plus its generated schema snapshot and journal entry were applied
from an empty **dedicated local test database**. No remote database, production
account, role, application or imported tournament was modified.

The integration suite replays the backfill SELECTs and verifies no duplicate
evidence, no changes to original edition/archive JSON, and null original observation
dates where unavailable. Provider cache fetch times remain observation evidence,
never rename dates. It also checks subsequent login/profile/archive observations and empty/
failed provider snapshots. See [model and operator notes](../../player-identity.md)
for the re-entrant backfill and the required backend upgrade.

## Frontend preview

Before creating a PR, opened `http://localhost:4000` using the supplied read-only
Developer access to the organizer-confirmed backend. Access was entered into the
local connection form and retained only by the existing in-memory mechanism.
No credential was saved to source, environment files, screenshots or this report.

Manual preview verified the authenticated dashboard's entry with no current
applications, the same UID profile aggregating six published historical editions,
and a known previous username. The updated themed ruleset menu was opened for
visual inspection. The backend used the legacy saved-read contract, so durable
name provenance remains a backend-upgrade requirement rather than a claimed remote
migration. Synthetic fixtures independently exercise zero participation and missing
statistics; the real account's history is not copied into fixtures.

## Checks

Final verification was delegated to a GPT-6 Luna subagent as requested:

| Check                                                | Result                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                      | Passed: lint, route type generation and TypeScript.                                                                                                                                                                                                                        |
| `npm run test:i18n`                                  | 4/4 passed.                                                                                                                                                                                                                                                                |
| Targeted identity/profile/read API/remote Vitest set | 11 files, 104 tests passed.                                                                                                                                                                                                                                                |
| Fresh migration plus final `player-identity.test.ts` | Complete migration chain applied to a new isolated `test` database; 13/13 tests passed, including retained provider `fetchedAt`, invalid date fallback and private archive publication.                                                                                    |
| `npm run build`                                      | Passed.                                                                                                                                                                                                                                                                    |
| Desktop/mobile browser regression                    | Initial 4-spec run: 24/28 passed. The two profile tests were corrected for the newly explicit theme cookie and passed on rerun. A further mobile-only rerun restored the actual 390×844 viewport and passed. The remaining two media tests are blocked as described below. |

The profile browser checks exercise immediate mode navigation, preserved edition,
keyboard selection/Escape focus, loading/failed-statistics completion, light/dark
tokens, a plain 48px spinner without a card/image/visible label, and no extra submit
button. Empty known profiles and three locales pass on both browser projects;
historical archive browser cases and the read API SSR/spec cases also passed.

Full `npm test -- --fileParallelism=false` was run once during final verification:
**164 files: 148 passed / 16 failed; 1,278 tests passed / 69 failed / 3 skipped**.
This is not a full-suite pass. Subsequent scoped tests verify the final visibility,
backfill and UI refinements without repeatedly rerunning unrelated failures.

Confirmed local/platform limitations include unavailable Bash/Python3 subprocesses,
Windows symlink `EPERM`, and media storage rejecting Windows paths that do not start
with `/`. These block shell/deployment/S6 preparation/replay fixtures, replay storage,
team media/uploads and the full-site fixture setup in `extended-read.test.ts`.
The two remaining browser failures are the full-site protected-media transport
cases (desktop/mobile): their fixture fails in team-image storage with HTTP 503.

Two other full-suite failures remain unresolved and are **not** attributed to the
environment: `developer.test.ts` expects 403 for an invalid profile POST but receives
400; `s6-source.test.ts` has a SHA-256 source snapshot expectation mismatch. Neither
has been represented as passing or changed outside this issue's scope.

Detailed logs are local `oclr-issue360-*.log` files in the session's temporary
directory; browser traces/screenshots are in ignored `test-results`. No personal
backend data or credential is embedded in synthetic fixtures or committed artifacts.

Production dependency audit (`npm audit --omit=dev`): **0 vulnerabilities**.

New Chinese wording is available for organizer review in the three locale catalogs
and frontend preview. No deployment, merge, issue closure or remote backfill was
performed. CI results must be reported for the actual PR commit, independently of
local verification.
