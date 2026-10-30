# #575 — Bancho map receipt compatibility

## Change

The server now accepts both `Beatmap changed to[: ]` and `Changed beatmap to` reply prefixes when confirming a map command. Sender, room target and exact beatmap ID checks remain required. The service still requires the corresponding message in the current projection and rejects message IDs present before command dispatch. Repeated receipts cannot create another selection.

This only changes recognition of an existing permitted map operation. It does not add command types or infer confirmation for Mods, timer or start, and it does not change result publication.

## Evidence

The desktop live session on 2026-10-30 (Asia/Taipei), recorded in [OCLR IRC #2](https://github.com/OCLR-dev/OCLR-IRC/issues/2#issuecomment-6525861321), observed BanchoBot's `Changed beatmap to https://osu.ppy.sh/b/75 Kenji Ninuma - DISCO PRINCE`. The desktop recognized that response and a subsequent settings query confirmed map 75, while the website eventually reported unknown. That is the pre-fix reproduction, not deployment acceptance of this patch.

Unit regressions cover both known reply formats and URL paths, mode-qualified commands, wrong room, wrong sender, adjacent map IDs, incorrect host and unrelated/near-match prefixes. Database integration regressions run the existing lease/idempotency and old-message/session/assignment isolation scenarios for both reply formats.

## Verification limits

The local isolated PostgreSQL initialization could not allocate a shared memory segment; no existing database or system settings were changed. Docker was not running. Database-backed integration and browser checks therefore require the isolated CI services. Local and commit-specific CI results are recorded on the issue and PR. No production deployment was performed; a new live map command after deployment remains necessary to verify the website receipt. Historical unknown receipts are not rewritten or replayed.
