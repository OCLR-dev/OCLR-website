# #621 — Sticky BP score, visible undo and automatic IRC plans

2026-10-31, Asia/Taipei. Website branch `codex/referee-inherited-room`, with
corresponding IRC branch `codex/bp-auto-sync`.

The score summary has distinct blue/red teams, central tabular scores, compact
nonempty history rows and a visible undo button. It is sticky only inside BP; the
outcome/history editor remains collapsible. Phone and desktop geometry were
checked, including release of the score when scrolling into post-match content.

After successful save, Ban automatically announces; Pick/TB announces, changes the
map, then applies saved Mods/NF. Undo announces the correction. The website derives
plans from the saved event UUID, verifies author/access/current dependencies, and
persists all steps atomically. Retrying an accepted plan cannot duplicate it.
Queued steps stop for failed predecessors, withdrawn or changed sources, or revoked
permissions. BP records never wait for IRC, and errors cannot undo a saved BP.
Page load/polling never broadcast old BP history.

Migration 0066 adds negotiated BP-sync capability and optional step metadata. Both
website and IRC updates are needed, followed by reconnection. Legacy peers keep
manual command compatibility and do not receive unsupported fields/plans. The
client accepts only fixed-format notices through its existing scoped chat path;
notification transport status is distinct from Bancho effect confirmation. Map and
Mods retain existing Main gates and consumed-ID ambiguity protection. New finite
Mods confirmation requires the exact Mod set and Freemod state. No automatic
start/abort or real room operation is included.

## Evidence

- Node 24, existing lockfiles, npm ci. Website check/types and build passed;
  final affected lint/types and final UI build passed. IRC typecheck/build passed.
  Production dependency audits: zero vulnerabilities in both repositories.
- Website full available npm test: **1,425 passed / 653 skipped** (the full DB
  suite was not enabled for this invocation). Related referee/relay DB tests:
  **31 passed** against the dedicated `oclr_620_test` target, with migration 0066
  applied. Final sync/notice/Mods validation was rerun after the last guard edit.
- Scoped real-component browser verification was used because this issue concerns
  sticky browser geometry and interactive auto-sync: **24 unique desktop/mobile
  cases**, including three locales, both themes, offline save, accepted-response
  loss and same-event retry, simulation and read-only access. Geometry cases were
  rerun after visual refinement; saved screenshots were inspected. This is not
  the full application E2E matrix. The affected full-site E2E source was updated
  but was not run (too slow).
- IRC full core suite: **177 passed**; final affected MP tests: **19 passed**,
  including actual IrcSession + local TCP fake IRC notice injection/epoch checks
  and Mods matching. There was no real Bancho connection or Electron UI claim.
- Initial nullable-lookup typing errors were corrected; initial restricted IRC
  tests hit loopback EPERM and were rerun with normal local permissions. Neither
  initial failure is presented as a passing run.
- Catalog extraction/check, generated read contracts/check, formatting and diff
  checks passed. No credentials, live fixture writes, deployment or release tag.

Exact commits and CI status are recorded on the issue after push. Organizer
wording/release acceptance remains distinct from these synthetic checks.
