# Historical mappool metadata supplements (#335)

S4's import contains 75 literal `#N/A` titles out of 76 slots, despite having
beatmap IDs for all slots. S5 and S6 source packages contain missing titles and
statistics (including CS/AR/OD). Previously, the historical page displayed only
these imported values; the official lookup resolved cover set IDs only. Having
a BID did not resolve a title or other detailed metadata.

The S4–S6 historical mappool view now uses a checked-in, public official osu!
metadata snapshot to fill null fields and exact spreadsheet error strings. It
matches the exact difficulty ID, preserves every recorded non-null value
(including zero), and uses `hit_length` for drain length. Unavailable maps remain
unknown. Artist, song title, difficulty and mapper remain literal provider text.

The display lists the supplemented fields, links their official source, and
shows the capture date. These are **current base/no-mod attributes**, not a claim
about the map version, star-rating algorithm or adjusted attributes used during
the historical tournament. Existing source statistics always win. The original
import packages and saved database archives are unchanged; results, roster,
publication and authorization boundaries are unaffected. Saved-data API clients
continue to receive source records, not silently rewritten historical data.

`src/data/archive-beatmaps.json` contains only whitelisted public map metadata,
with per-map source URL, capture time and provider map-update time. No page HTML,
user sessions, credentials or private account data are retained. Static set IDs
also let these maps show artwork without provider credentials. The same display
projection applies to published pages, private previews and remote-mode pages.
Deploying the reviewed application change is sufficient for existing S4–S6
archives; do not reimport a full archive or write directly to the production DB.

To intentionally refresh the reviewable snapshot:

```sh
python3 scripts/refresh-archive-beatmaps.py
# Resume an interrupted capture (retains each successful row's own timestamp):
python3 scripts/refresh-archive-beatmaps.py --resume
```

This uses public official beatmap pages sequentially with a delay and bounded
requests; it stops immediately on rate limiting. Review the resulting diff and unavailable-ID list before
committing. Public page rendering never performs this capture or writes data.
New Chinese source-disclosure wording still requires organizer review.

## Capture coverage — 2026-10-26
The official snapshot resolves 199 of 202 distinct BIDs (221 of 224 pool slots).
S4: 76/76 slots; S5: 75/77; S6: 70/71. All other pending lookups are complete.

Three official beatmap pages returned HTTP 404; their surviving source values
remain visible, and missing fields remain unknown:

| Season / pool / slot | BID | Missing fields |
| --- | --- | --- |
| s5 / 二轮赛图数据 / DT4 | [2720295](https://osu.ppy.sh/beatmaps/2720295) | mapper, stars, bpm, drainSeconds, cs, ar, od |
| s5 / Final 图池 / NM4 | [2756449](https://osu.ppy.sh/beatmaps/2756449) | cs, ar, od |
| s6 / 队长资格赛赛图 / NM3 | [2314568](https://osu.ppy.sh/beatmaps/2314568) | cs, ar, od |

Completing these three records requires a surviving original map file or
other authoritative source; do not substitute another difficulty of the song.

## Local verification — 2026-10-26

Node 24.22.1, locked `npm ci --include=dev`, disposable PostgreSQL 17 database
`oclr_335_test` on a separate loopback port; no existing environment or database
was used.

- `npm run check`: passed.
- `npm test`: 1,099 passed, one skipped, one new coverage test initially failed
  because capture was still pending. After completing the snapshot, the affected
  metadata, artwork and i18n suites passed: 13 tests across three files. No
  pending snapshot IDs remain.
- `npm run i18n:extract` and `npm run test:i18n`: passed; both Chinese catalogs
  include the new source disclosure (organizer wording review remains separate).
- `npm run build`: passed.
- `npm audit --omit=dev`: zero vulnerabilities.
- Python capture/parser tests: five passed (identity, ruleset, set ID, drain
  length, difficulty owner and missing-payload handling).
- `npm run test:e2e -- tests/e2e/archive-map-metadata.spec.ts tests/e2e/historical-archive.spec.ts tests/e2e/mappool-browser.spec.ts --project=desktop --project=mobile`:
  16 passed, two failed. Both failures are the S9 bracket assertion in
  `historical-archive.spec.ts:1085` (expected five `.bracket-round` elements,
  received zero), outside the new metadata checks. The new S4 regression passes
  in both projects, including light/dark, detail dialog, compact view, original
  SR preservation, provenance link and horizontal overflow checks. This was a
  targeted browser run, not the complete 678-test browser suite.
- `git diff --check`: passed.

These results do not establish deployment, current CI acceptance, or completion
of the three unavailable source records. The issue remains open for review.

## S9 regression follow-up

The S9 browser checks still expected the legacy chronological-column DOM, while
knockout now uses `BracketCanvas` and the double-elimination SVG renderer. The
regression now verifies all ten scored knockout records, both original score
slots, match-detail destinations, the exclusion of unscored alternatives, all
12 recorded-appearance sources, and hiding/showing the reference connectors.
The existing group-stage, appearance, accessibility and overflow checks remain.

Once the outdated selectors were corrected, Axe exposed a missing level-two
heading above the SVG match cards' level-three headings. A screen-reader heading
using the existing group label restores the hierarchy without changing the
visual layout or adding new interface wording.

Local follow-up: `npm run check`, `npm run build`, and `git diff --check` passed.
The two S9 regressions plus the two #335 map-metadata regressions passed on desktop
and mobile (four tests); S9 covers default, cute-pastel and swiss-minimal in both
light and dark, with Axe still enabled. This supersedes the two S9 failures above.
Commit-specific full CI acceptance is recorded on #335 and its pull request.

The same follow-up also reproduced a separate public bracket regression in the
existing captain/staff rehearsal: a bracket outside the double-elimination
library's shape lost its two explicitly configured winner/loser connectors.
The fallback now uses the existing column renderer when every saved source is
an explicit winner/loser relation. It keeps the conservative connection-free
fallback for incomplete historical appearance data. The original connector-count
assertion remains unchanged. After rebuilding, the desktop/mobile rehearsal and
S9 appearance checks all passed (four tests); check/build also passed.

Baseline CI also exposed stale #241 selectors and a Frutiger mobile slot-sizing
failure. The S7–S10 presentation check now verifies the current SVG renderer,
recorded match/source counts and the reference-only notice. Frutiger's existing
44px mobile circle retains its size with smaller inline padding; long labels
still grow and wrap. The geometry check now covers both brightness modes.
Check/build passed, and both corrected tests passed on desktop/mobile (four
checks). At the organizer's request, CI monitoring was stopped and the changes
were submitted to PR #337 without claiming complete CI acceptance.
