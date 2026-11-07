# Issue 969 — player image reactions

Implementation branch: `选手页面贴表情优化`, based on upstream main `52e869c1`.

The user reviewed the separate image gallery and exported `selection.json` on
2026-11-06. Its 34 keys appear first, in their exported order. The remaining
374 image-backed entries follow in gallery order. The 45 missing-image and 97
system-Unicode-only entries are not candidates. The total is 408: 395 QQ images,
12 osu! mod icons, and the Twemoji circled congratulation. Of these, 284 have
verified multi-frame APNGs. Source links and SHA-256 digests for all 692 files are
in `public/reactions/manifest.json`; attribution is in `public/reactions/NOTICE.txt`.

After comparing the colored collections, the user selected the classic osu!
icons on 2026-11-06. HD, HR, DT, EZ, HT, NC, FL, NF, SD, PF and RX now use the
11 unmodified PNGs from the official skinning Wiki. NM retains its original SVG
because the reviewed classic collection has no NM image. The export above is
preserved as the original selection record; only the corresponding asset paths
and source digests changed. Reaction IDs, ordering and saved selections stay
compatible. Classic PNGs render directly; only the remaining monochrome SVG
uses the dark backing. The superseded 11 SVG files were removed.

The existing browser-local edition/player storage key is retained. Old Unicode
choices remain readable/removable; invalid and duplicate IDs are filtered. The
picker uses the actual `PlayerReactions` component, local lazy images, a bounded
scrolling panel, search and aliases, focus return on selection/Escape, and a
static fallback for reduced motion. Remote read-only directories retain their
existing disabled-reactions boundary.

## Local review

Start the DB-free component host from this checkout:

```sh
COMPONENT_TEST_PORT=31469 node --import tsx tests/components/server.ts
```

Open `http://127.0.0.1:31469/player-reactions`. It renders the actual `EventPlayers`
and `PlayerReactions` with clearly synthetic players. The page offers light/dark
and language links. No database, OAuth credentials or production mutation is
needed. It is a component preview, not a claim that the production site changed.

## Verification

Node 24.15.0, npm and the existing lockfile. `npm ci` completed.

- `npm run check`: passed (lint, types, 38 archive relations synchronized).
- `npm test`: 211 files passed, 85 skipped; 1,780 tests passed, 802 skipped,
  129.16 seconds. DB-backed tests remain skipped without an isolated test DB.
- `npm run i18n:extract` and `npm run test:i18n`: catalogs synchronized; 4 passed.
- `npm run build`: passed. Next.js reports the existing 1,124 custom-header warning.
- `npm audit --omit=dev`: zero vulnerabilities.
- `git diff --check` and focused formatting/lint: passed.
- Focused `tests/components/player-reactions.spec.ts` with Chrome: 4 passed
  across the existing desktop/mobile projects, 3.6 seconds. Checks cover native
  popover bounds/scroll, search, image loading, keyboard selection/focus return,
  persistence, player/edition separation, reduced motion, legacy choices and
  osu! image loading. An initial broad status selector was narrowed; the ensuing
  Escape failure exposed search-input consumption and was fixed in the component.
- The existing player-message E2E now selects the first image reaction instead of
  the removed purple-heart candidate. No E2E case was added or removed. Full E2E:
  not run (too slow); the focused DB-free browser check covers this change.
- Asset checksum/ordering/missing-image and saved-data compatibility checks are
  in `tests/unit/player-reactions.test.ts`.

New interface text is limited to search and no-matches wording in three locales.
The user reviewed the changes, selected the classic icons and authorized a PR
on 2026-11-06. Maintainer review and commit-specific CI remain separate; local
verification does not establish a main push or production deployment.

### Classic icon follow-up — 2026-11-06

After the user's classic-icon selection, `npm run check` and `npm run build`
passed again. The existing reaction unit file passed all 3 tests, including
the shortlist order, complete asset digests and saved-ID compatibility.
All 11 replacements were separately matched byte-for-byte against the reviewed
gallery originals; their obsolete SVGs are absent. Formatting and
`git diff --check` passed. The restarted component preview serves all 11 PNGs
with the correct content type and bytes. No interface messages or dependencies
changed in this follow-up. Full tests and browser suites were not repeated for
this asset replacement; the results above remain the initial implementation's
verification, not new runs. Full E2E: not run (too slow).

### Review fixes — 2026-11-07

Merged upstream main `466a32c5` into PR #972 without rewriting its history.
The catalog conflicts retain both the reaction search translations and the
Developer port translations. The component host retains both fixture routes.

QQ 367, 449, 466, 468 and 469 used animated APNGs even for their PNG-labelled
fallbacks. Their fallback files now contain the original PNG default image,
with only the APNG control/frame chunks removed; the animated variants stay
intact. The manifest records the original source digest, local digest and
transformation, and NOTICE documents the five derived files.

The existing catalog test now parses every PNG's chunks: fallback images must
have no `acTL`, `fcTL` or `fdAT`, and animated variants must declare multiple
frames. The existing reduced-motion browser case now uses affected QQ 367.
The browser suite still has the same two cases across desktop/mobile (4 total);
no E2E case or browser matrix was added.

Review verification used Node 24.22.2 and the existing npm lockfile:

- `npm ci` and `npm run check`: passed.
- `npm test`: 211 files passed, 85 skipped; 1,779 tests passed, 807 skipped
  (no isolated test DB configured), 163.14 seconds.
- `npm run i18n:extract`: catalogs synchronized; focused reaction/i18n tests:
  7 passed, including metadata and digest checks for all catalog PNGs.
- Existing reaction-picker component suite with Chrome: 4 passed across
  desktop/mobile, 12.9 seconds, including affected QQ 367 under reduced motion.
- Full E2E: not run (too slow).

- `npm run build`: passed, with the existing 1,124 custom-header warning.
- `npm audit --omit=dev`: zero vulnerabilities.
- `npm run read-api:generate` / `npm run read-api:check`: synchronized;
  59 contracts, 185 coverage rows and 8 tests passed. Generated files are unchanged.
- `git diff --check`: passed.

An initial sandboxed test attempt could not open the local listeners or run
all subprocess fixtures. The results above use permission for isolated local
fixtures; they do not describe a production service operation or deployment.

### Second main synchronization — 2026-11-07

Merged main `3cf5cd57898f20b26ef8e9c16b1616241ed04ded` after the coach-draft
fix (#976) and UI/remote-session PR #973 landed. The sole conflict was the
component host's fixture selector. It now selects `player-reactions`,
`team-coach-draft` and `developer-access` explicitly.

An isolated HTTP check started the actual component host and verified each of
those three routes serves its matching HTML, JavaScript and CSS successfully.
`npm run i18n:extract` synchronized the catalogs. `npm run read-api:generate`
checked 59 contracts and 185 coverage rows with no generated artifact changes.
Browser/E2E suites were not run (too slow); this merge resolves fixture routing
and adds no browser interaction or presentation behavior.

- `npm run check`: passed (lint, TypeScript and 38 archive relations).
- `npm test`: 211 files passed, 85 skipped; 1,788 tests passed, 807 skipped
  (no isolated test DB configured), 169.13 seconds.
- `npm run build`: passed, with the existing 1,124 custom-header warning.
- `npm audit --omit=dev`: zero vulnerabilities.
- `npm run read-api:check`: 59 contracts, 185 coverage rows and 8 tests passed.
- `git diff --check`: passed.
