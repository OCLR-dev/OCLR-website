# Issue #185 — private mappool replay workflow

> Policy update: #692 supersedes the selection-lock and Showcase timing rules
> described in this historical record. Authorized staff can manage replays at any
> time in operational editions. See the [current workflow](../../mappools.md#internal-replay-workflow-185-updated-by-692).

Verified locally on 2026-10-24 in an isolated worktree based on `origin/main` at `69c4f77`, then fast-forwarded to `b427e2f` before submission. That upstream advance added design-reference documentation only; application/test sources were unchanged. All accounts, maps, replay bytes and provider responses used in tests are synthetic. No demo/production database, service, OAuth credential or real player replay was used or modified.

## Final behavior

- Admin/Mappooler finishes selection, configures the pool's exact Showcase deadline (local-time entry with UTC preview), then confirms an independent **selection lock**. This freezes maps/slots/round labels/deadline and opens attachment writes. Pool publication stays separate; replay files never become public.
- **Tester and Replayer** are explicit persistent staff grants, scoped through the existing grant/revoke workflow. They can read the pool and upload/delete replays within the authorized edition; they cannot edit maps, configure the deadline, lock selection or publish. Admin has management access under the same window. Mappooler can read/download and needs an additional Tester/Replayer grant to upload/delete. Developer can read/download and cannot upload/delete unless another explicit grant supplies that write capability.
- Upload/delete is accepted only **after selection lock and strictly before Showcase**. The server checks again after body parsing/validation and under the existing edition lock. At or after the deadline, uploads/deletions fail even for Admin; authorized downloads continue. Completed-fixture locks remain separate, immutable and cannot configure a new selection window.
- Supported: stable `.osr`, versions `20140721 <= version < 30000000`, legacy modes osu/taiko/fruits/mania and documented stable trailers. Lazer/older/extra containers are rejected. The literal player name, mode, mod bitmask and beatmap MD5 are shown without account binding, scoring or registration changes.
- Known official MD5/ruleset mismatches fail; missing official MD5 is explicitly **unverified**. Saved maps retain optional provider checksums. Refresh old metadata before locking when verification is required. No fuzzy matching, arbitrary URL fetch, video, playback or anti-cheat verdict is introduced.
- 8 MiB/file, 10 attachments/entry, 1 GiB/10,000 physical replay files total. Python's standard LZMA decoder is bounded to 32 MiB dictionary memory, 16 MiB expanded data, 300,000 frames, 3 seconds and two concurrent decoders per process. Multipart actual stream is limited to 8 MiB + 16 KiB independently of Content-Length/MIME.
- Stable entry IDs retain associations. Duplicate SHA-256 content returns the existing attachment with a visible explanation. Every actual upload/delete increments the pool version and commits its automatic audit in the same transaction. Concurrent different writes require the current version. Interrupted/saved-but-lost response retries do not add duplicates.
- Private mode-0600 files live under durable `OCLR_MEDIA_DIR/replays/<UUID>.osr`; original names never become paths. Protected downloads validate session, current grants, edition/entry/replay ownership and file SHA-256; they return attachment/no-store/nosniff headers. No public/static route exists.
- Legacy/imported attachments block removing/replacing their map without explicit cleanup. Allowed slot moves retain the same entry/attachments; a known checksum conflict blocks metadata refresh. Current selection locks prevent these content changes entirely. Files from failed/ambiguous commits are either removed after confirming no reference or retained for offline cleanup; download never reports success for missing/damaged bytes.

## Validation

Dedicated loopback PostgreSQL 17 cluster: port 55485, `oclr_issue_185_test` (full suite), `oclr_issue_185_browser_test` (browser tests), plus separate `oclr_issue_185_backup_test` and `oclr_issue_185_restore_test` (backup round trip). All have an explicit `test` database-name segment. File fixtures use the canonical system temporary directory on macOS/Linux; Playwright provisions its private test media root before starting the server. Migrations were applied only there.

- `npm run check`: lint and TypeScript passed.
- `npm run i18n:extract` and `npm run test:i18n`: catalog extraction and all 4 localization checks passed. Simplified/Traditional Chinese strings are included for organizer review; approval is not assumed.
- Complete unit/integration suite: **118 files, 853 tests passed, 1 existing skip**. This includes migration preservation from populated old schemas; additive staff permissions; supported and malformed stable/LZMA files; lazer/truncation/trailing/oversized/expansion/dictionary rejection; exact download bytes; missing/changed files; path/symlink protections; quota including sparse orphan files; count/version limits; known mismatch and unverified labels; concurrent duplicate retry; denied Mappooler/Developer writes; Replayer writes; revocation/cross-edition/forged resources; selection/Showcase/fixture/archive protection; audit rollback; orphan cleanup.
- `NEXT_TELEMETRY_DISABLED=1 npm run build`: production build passed. A final focused organizer-publication/file/i18n rerun also passed after wiring the existing Tester directory to explicit published grants.
- **16 desktop/mobile Playwright scenarios passed** across `mappool-replays`, `mappools`, `mappool-order` and `developer`. The final UI refinement was additionally rechecked with the 8 replay/Developer desktop/mobile scenarios. Portable fixture/media provisioning then passed 10 focused unit/integration tests and 4 upload/retry browser scenarios with no manually supplied media directory.
- Replay matrix: three appearances × light/dark × en/zh-Hans/zh-Hant × 1440/390px. Each combination verifies preferences, a long filename, upload error, keyboard expansion, delete confirmation/Escape/restored focus, no horizontal overflow and Axe WCAG A/AA. Workflow cases verify selection locking, Tester upload despite an untrusted MIME value, SHA-equal protected download, same-origin/anonymous/cross-edition checks, deletion and Showcase closure. A saved-but-lost HTTP response is aborted after commit; retry visibly reuses one association.
- `npm audit --omit=dev --registry=https://registry.npmjs.org`: **0 production vulnerabilities**. The configured mirror lacks an audit endpoint; the official npm endpoint was used.

The initial runs identified migration assertions requiring explicit null defaults for the new fields, capability assertions requiring Mappooler's new read permission, and untranslated JSX labels. These were fixed and the complete suite passed. Initial browser failures came from provisioning the temporary media root after the first upload and an error locator matching Next.js's route announcer; provisioning now precedes the run and the locator is scoped to the replay panel.

## Database + media backup/restore

With no application writer running against the dedicated backup fixture:

1. Created one synthetic replay via the same authorized upload service in `oclr_issue_185_backup_test`, with files in a private durable directory separate from application releases.
2. Took a real PostgreSQL 17 `pg_dump -Fc` and a `tar` of the entire media root using the updater's existing `team-media.tar` layout. Verified the archive SHA-256 before restoration.
3. Restored with `pg_restore --exit-on-error` into the separate empty `oclr_issue_185_restore_test`, extracted the media archive into a different private root, and started a fresh application-library process pointed at those restored resources.
4. Called the authorized download service against restored metadata and compared the complete bytes to the original generated replay. The association count remained 1, the filename remained `backup.osr`, and original/restored downloads were both 200 bytes with SHA-256 **`2218639f95bcb53a009fc30f20b70ece920cbe2100547b5c4ba0e8f1a446427f`**. See [machine-readable receipt](backup-verification.json).

The filesystem unit/integration tests separately preserve referenced/fresh/unknown files while reclaiming old unreferenced replay UUIDs; changed/missing bytes fail closed until restored. Release paths are never used as replay storage. This proves a local synthetic backup round trip and independent storage layout, not a real Rocky upgrade/production restore.

## Screenshots

The before/after images below represent workflow states in this implementation, not a reconstruction of an older site revision.

| Workflow                             | Desktop                                            | Mobile                                           |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------------ |
| Before selection lock: writes closed | [1440px](desktop-replay-before-selection-lock.png) | [390px](mobile-replay-before-selection-lock.png) |
| Tester after upload                  | [1440px](desktop-replay-tester-uploaded.png)       | [390px](mobile-replay-tester-uploaded.png)       |

| Appearance    | Desktop light / dark                                                                            | Mobile light / dark                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Original      | [Light](desktop-replay-default-light.png) / [Dark](desktop-replay-default-dark.png)             | [Light](mobile-replay-default-light.png) / [Dark](mobile-replay-default-dark.png)             |
| Cute pastel   | [Light](desktop-replay-cute-pastel-light.png) / [Dark](desktop-replay-cute-pastel-dark.png)     | [Light](mobile-replay-cute-pastel-light.png) / [Dark](mobile-replay-cute-pastel-dark.png)     |
| Swiss minimal | [Light](desktop-replay-swiss-minimal-light.png) / [Dark](desktop-replay-swiss-minimal-dark.png) | [Light](mobile-replay-swiss-minimal-light.png) / [Dark](mobile-replay-swiss-minimal-dark.png) |

## Deployment/review boundary

Apply migration `0035_mappool_replays`, provision private durable media and Python 3/LZMA on the intended app host, and adapt the existing separate Nginx's 9 MiB body limit before using the feature. Existing media backups include replays; cleanup requires stopped writes. [Mappool operation guide](../../mappools.md#internal-replay-workflow-185) and [Rocky/storage/backup instructions](../../deployment.md#private-mappool-replay-storage-185) describe the limits and recovery order.

No real account uploads, real osu! playback, live OAuth, official deployment or organizer wording acceptance is claimed. The PR's actual GitHub Checks remain authoritative; no pending CI run is described as passed.

## PR #246 review follow-up (2026-10-25)

Reviewed PR head `5c336ea` and integrated the subsequently merged `origin/main` at `30e7aa2` without rewriting either history. The review fixed:

- A concurrent committed deletion could unlink a replay between the quota scan's directory listing and `lstat`, causing an unrelated upload to return 500. Quota accounting now tolerates only that missing-file case; permission/storage errors still block writes. The new regression test reproduced the original failure before the fix and checks byte equality after the fix.
- Deletion failures appeared behind the modal instead of inside its accessible confirmation dialog. The dialog now displays the failure and clears earlier unrelated upload errors when opened. Desktop/mobile tests inject a 409, verify the dialog's visible alert and retained attachment, then retry successfully.
- Main's newly merged `0034_yumu_award_policy` conflicted with the replay migration number and snapshot. Main's migration and snapshot remain unchanged; replay is now `0035_mappool_replays`, generated from the combined schema. A dedicated upgrade test starts at main's migration 0034, preserves an existing Yumu policy and verifies that replay migration applies once even when invoked twice.

Final local checks on the combined application sources:

- `npm run check` and production build passed.
- Full unit/integration suite: **122 files, 877 tests passed, 1 existing skip**. The final 0034-to-0035 upgrade case also passed separately.
- i18n extraction and all **4 localization checks** passed; this review adds no interface messages.
- **16 desktop/mobile Playwright scenarios passed** across replay, mappool ordering/editing and Developer permissions, including the existing three-appearance, two-theme, three-locale replay matrix.
- Production dependency audit: **0 vulnerabilities**; the dependency lockfile is unchanged.

These runs used a dedicated temporary PostgreSQL 17 cluster on loopback port 15466, databases `oclr_pr246_test` and `oclr_pr246_browser_test`, and separate temporary media storage. The initial browser run could not launch the missing bundled Chromium; the successful run used installed Chrome via `PLAYWRIGHT_CHANNEL=chrome`. No demo/production database or service was used. CI and the original organizer review/deployment boundaries above remain independent of these local results.
