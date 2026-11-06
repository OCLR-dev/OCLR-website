# Historical mappool metadata supplements (#335, #850)

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
the historical tournament. Existing source statistics always win. The display
projection does not modify saved archives; results, roster, publication and
authorization boundaries are unaffected. Saved-data API clients receive source
records. The separate #852 data migration below persists the organizer-confirmed
original-map IDs.

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
`unavailable` lists the captured BIDs whose page returns HTTP 404, so the two S5
rows below stay listed even though their archive records are now complete.

Three official beatmap pages returned HTTP 404. Their surviving source values
remain visible, and missing fields stay unknown unless the import package records
a surviving original map:

| Season / pool / slot      | BID                                            | Missing fields                               |
| ------------------------- | ---------------------------------------------- | -------------------------------------------- |
| s5 / 二轮赛图数据 / DT4   | [2720295](https://osu.ppy.sh/beatmaps/2720295) | mapper, stars, bpm, drainSeconds, cs, ar, od |
| s5 / Final 图池 / NM4     | [2756449](https://osu.ppy.sh/beatmaps/2756449) | cs, ar, od                                   |
| s6 / 队长资格赛赛图 / NM3 | [2314568](https://osu.ppy.sh/beatmaps/2314568) | cs, ar, od                                   |

Both S5 rows already carry that provenance in the S5 import package:
`docs/imports/s5-archive.json` records `originalId` 2678913 for DT4 2720295 and
2755377 for NM4 2756449. The package fills their unpublished cells with the
edits' own upload values (mapper, stars, bpm, drainSeconds, cs, ar, od for DT4;
cs, ar, od for NM4), not with re-measured results; the package's `notes` state
so. NM4's cs/ar/od match the original map 2755377 (4 / 9.4 / 8). DT4 is the
1.5x version of 2678913 with AR 9 -> 8.5 and OD 8.5 -> 8, so its stars 6.27,
bpm 210 and drainSeconds 111 (167 s / 1.5, rounded down) are the edit's values
rather than the original page's base attributes (2678913 shows 4.46 stars at
140 BPM). DT2 2567502 likewise keeps `originalId`
2933979 for the same fallback, but needs no value fill because its own page is
still available. `python3 scripts/prepare-s5-archive.py` and
`python3 scripts/prepare-s5-reviewed-import.py` reproduce both packages.

The organizer subsequently supplied the exact S6 original package; its recovery
and database migration are documented below. The official-page 404 remains
recorded separately from the recovered local file.

The original S5 supplement lived only in the import package, so deploying it did
not repair already-saved archives. #843 adds the display correction below.

## Existing S5 archives and surviving links (#843)

The organizer reconfirmed DT4 → 2678913 and DT2 → 2933979 on 2026-11-05
(Asia/Taipei). Both official difficulty pages were checked successfully; DT2's
Ranked difficulty belongs to set 1424727, and DT4's surviving original belongs to
set 1290517. Their current official metadata is captured in the snapshot for
cover lookup, separately from the historical edits' statistics.

`src/data/archive-map-supplements.json` is shared by the S5 import builder and
`archivePoolMetadata`. It matches only S5 / pool-2 / the recorded DT2 or DT4 slot
and BID. The display fills missing original IDs and DT4's previously confirmed
edit attributes while preserving all non-null saved values, including zero.
It keeps historical BIDs 2567502 and 2720295 for identity/copy/statistics; the
confirmed originals are preferred for web/osu!direct actions in cards, compact
rows and details even without a provider 404 response. A different explicitly
saved original ID remains authoritative. Source disclosure distinguishes these
archival supplements from current no-mod metadata.

The shared public/preview/remote display path uses enriched original IDs for
artwork lookup and the snapshot's known unavailable IDs without provider access.
Deploying this reviewed application change repairs older saved archives without
reimporting or writing their configuration. MP matching, results and raw saved
read-API responses retain their recorded BIDs. Archive and official snapshot
generators both retain the shared supplement; Python tests check package parity
and refresh coverage so regeneration cannot remove these two original IDs.

## Persisting the five confirmed sources (#852, 2026-11-06)

The organizer supplied these exact edit-to-original mappings. `originalId` is the
stored field name; the issue calls it `originalID`.

| Season | Pool   | Slot | Historical BID | originalId | Official set ID |
| ------ | ------ | ---- | -------------- | ---------- | --------------- |
| S5     | pool-4 | NM4  | 2756449        | 2755377    | 1329838         |
| S10    | gs1    | NM6  | 5015295        | 4000824    | 1930357         |
| S10    | gs2    | NM4  | 5036455        | 4934310    | 2284029         |
| S10    | gs2    | DT4  | 5033877        | 1571394    | 738331          |
| S10    | f      | NM7  | 4769379        | 5206595    | 2243651         |

All five official difficulty pages supplied matching osu!standard identities on
2026-11-06. Their five official `cover.jpg` files returned HTTP 200 and decoded as
900×250 JPEGs. The snapshot retains the original maps' public metadata for artwork;
their current attributes are not substituted for the historical edits' values.

Migration `0084_archive_original_ids` writes the missing IDs into the **current
saved database configuration**, matching edition, pool, slot and historical BID.
It retains every other JSONB field, the actual BIDs, recorded attributes,
statistics, approvals and publication. It locks affected editions, adds one
configuration revision and audit event per changed edition, and is idempotent.
An already different explicit original ID, duplicate target or nonhistorical
edition aborts the migration transaction for operator review. Empty installations
and absent target slots are left alone. Prior revisions/documents remain evidence.

Apply through the existing reviewed release, backup and migration workflow. After
the migration, run the existing normalization maintenance as the configured
operator to create and verify fresh immutable relations/cache generations:

```sh
npm run db:normalize-archives -- s5 s10 --apply --verify
```

In the operator's existing database console, verify the five saved `originalId`
values against the table above:

```sql
SELECT s.slug, p->>'id' AS pool, m->>'slot' AS slot,
       m->>'beatmapId' AS bid, m->>'originalId' AS original_id
FROM edition_state s,
     LATERAL jsonb_array_elements(s.configuration->'archive'->'pools') p,
     LATERAL jsonb_array_elements(p->'maps') m
WHERE s.slug IN ('s5', 's10')
  AND m->>'beatmapId' IN ('2756449', '5015295', '5036455', '5033877', '4769379')
ORDER BY s.slug, pool, slot;
```

The source-manifest trigger immediately invalidates old archive/cache digests.
Before normalization completes, public and saved-read API paths use the corrected
source safely. After normalization they use the new typed relations. No source
statistics need rekeying: `statisticsArchiveKey` excludes `originalId`.

The shared supplement also supplies artwork and original-map actions on
public/preview/remote pages with older saved data. It preserves a different
explicitly saved original and never writes during a read. S5/S10 import builders
consume the same mapping, and the checked-in S10 package retains the new Finals
source. Deploying display code alone does not constitute production DB acceptance;
record the actual migration and normalization results on #852. The remaining
missing covers and S2/S6 source investigation remain separate issue work.

## S6 NM3 recovery from the original package (#852)

The [S6 source record](s6-archive.md#captain-qualifier-nm3-original-package-852-2026-11-06)
documents the exact file, hashes and reproducible extraction. The shared
supplement fills missing CS 4 / AR 9.5 / OD 9.1 for S6 / captain-qualifier /
NM3 / 2314568 and supplies set 1034526 and a same-origin cover extracted unchanged
from `bg.jpg` (1920×1080 JPEG). It does not recalculate historical stars, BPM,
length or results. The original API page's unavailable status is retained.

Migration `0085_s6_nm3_file_recovery` adds optional `beatmapSetId`/`coverPath`
columns to the complete typed map relations and patches the current saved S6
archive. It locks the edition, keeps the original revision, adds a new revision
and audit with source hashes, fills only missing/null metrics and retains all
other JSONB. An explicit different set/cover or duplicate exact target aborts
the transaction. Identical retries write no additional revision or audit.

Apply through the existing backup/update/migration workflow, then run:

```sh
npm run db:normalize-archives -- s6 --apply --verify
```

The source-manifest trigger invalidates old relation/cache digests immediately;
reads use the corrected source until normalization creates a new immutable typed
document. `statisticsArchiveKey` is unchanged because BID/title/slot stay literal.
Public, preview and remote views receive the same file recovery without provider
credentials or writes during reads. The same-origin asset is bundled with the
frontend in remote mode. Its path is restricted to the archive JPEG namespace.
The original spreadsheet/source-review snapshots remain evidence, and both S6
import packages regenerate the corrected map without carrying over source-only
HP as a historical measurement. No new interface wording is introduced.

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

## Early seasons S1–S3 (#850, 2026-11-05)

The same exact-BID projection now covers S1–S3. The checked-in
[public saved-map inventory](imports/early-season-mappools.json) retains all 11
pools and 192 original rows, including source cell references, before correction.
The official refresh script reads this inventory as well as the existing S4–S6
packages; a fresh capture and `--resume` both retain the early-season IDs.
The snapshot now resolves 339 of 343 distinct S1–S6/original BIDs; no lookups are
pending. Each successful row retains its own official URL, capture time and map
update time.

The old projection's S4–S6 allowlist caused the early-season gaps. Early imports
also often contain artist/song text without a trailing difficulty. The display
now keeps that literal title, fills blank/formula-error fields, and exposes the
exact official artist/difficulty separately where absent. Cards, compact rows,
details, search and title sort share these enriched records. New labels are
`Artist` (曲师／曲師) and `Difficulty` (难度名称／難度名稱); organizer wording review
remains part of acceptance.

Compact rows keep difficulty status and provenance inside their identity cell,
so extra disclosure elements cannot become grid columns and squeeze song titles
into unreadable widths on mobile. Existing MainSheet styles are reused.

| Season | Pools | Valid slots | Missing titles before → after | Missing length / CS / AR / OD, each, before → after |
| ------ | ----- | ----------- | ----------------------------- | --------------------------------------------------- |
| S1     | 3     | 59          | 0 → 0                         | 59 → 0                                              |
| S2     | 5     | 68          | 25 → 1                        | 68 → 1                                              |
| S3     | 3     | 63          | 5 → 0                         | 63 → 0                                              |

Thus 29 of the 30 reported empty titles are recovered, and 189 of 190 valid
slots have all eight metadata fields plus a difficulty name. Existing non-null
historical titles, mapper names, metrics and zeroes remain authoritative.

### Unavailable exact difficulty and covers

S2 / `captain-qualifier` / NM2 / **1009329** remains unresolved. Its
[official difficulty page](https://osu.ppy.sh/beatmaps/1009329) returned HTTP 404
on capture and on a separate confirmation request. The original public
[S2 workbook](https://docs.google.com/spreadsheets/d/1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY/edit),
`captain's qualifier mappool!B5:H5`, was independently read with a bounded public
GViz request: B = NM2, C–F = `#N/A`, G = `https://old.ppy.sh/b/1009329`,
H = 1009329. It supplies no surviving title or attributes. A surviving original
`.osu` file or historical exact-BID evidence is needed; no other difficulty is
substituted. The slot, ID and explicit unavailable state remain visible.

The prior full public cover scan also confirms two S1 image 404s: GS NM3
659750 / set 293275 and ES1 HD3 776326 / set 352290. Their official map metadata
is available and is filled, while failed covers retain the existing `Cover
unavailable` state. S2 NM2 has no surviving set/cover source. Other S1–S3 cover
sources from that scan match the captured set IDs. Broader image recovery remains
tracked in #852; this change does not fabricate replacement images.

### Source preservation and regeneration

The organizer confirmed S2 **GS** had neither DT5 nor TB1. The earlier
projection-only correction is superseded by #899: these entries must be removed
from the **current saved JSONB** using the [version-checked correction](archive-relational-queries.md#s2-operator-correction).
There is no season-specific display filter. Counts, navigation and map views read
the saved maps directly. S2 **Final** DT5 804387 and TB1 1962336 remain and receive
missing titles normally; other seasons and pools are unchanged.

S1–S3 have no maintained standalone import builder in this checkout. New Admin
archive imports correct the two slots at the write boundary. The original
captured inventory and prior edition revisions remain evidence of the earlier
save. Changing the current archive changes `statisticsArchiveKey`; the controlled
correction proves selected-score and fixture-review equivalence, preserves
recorded picks/bans and publication timestamps, and transactionally rebinds only
validated current statistics. Incompatible evidence aborts the operation.

Deploying the renderer alone does **not** correct an old database. An operator
must preview and apply the saved-data correction at the actual edition revision.
Migration 0077 separately adds immutable MP JSONB history and the derived
relational read layer described in the linked guide. No production mutation or
deployment is claimed by this implementation.

Unit coverage walks every pool/slot, checks preserved values and exact-BID
coverage, reopens serialized raw records, verifies scoped removals/counts and
unchanged statistics identity, and preserves the refresh inventory. Focused
component coverage checks desktop/mobile cards, compact rows, details,
search/sort, image failure and unavailable maps; the S5 fallback regression is
included. Actual command results are recorded in the PR, separately from CI and
organizer acceptance.

## Official OSZ download mirrors (#852)

The organizer supplied two official packages on 2026-11-06. They are preserved
unmodified under `docs/imports/beatmaps` at commit
`8e8416c3003795665b148208f6ecd94137ed812a`:

| Saved slot                   | BID     | Package       | Bytes     | SHA-256                                                            |
| ---------------------------- | ------- | ------------- | --------- | ------------------------------------------------------------------ |
| S2 / captain-qualifier / NM2 | 1009329 | `403096.osz`  | 7,914,595 | `c98304139ab47c9bde13a77ace1af547900e9fbaab32941b13e8a86d4417e1ad` |
| S6 / captain-qualifier / NM3 | 2314568 | `1034526.osz` | 6,585,832 | `77b67ed47821a8463f8820da2b57d6274d41203b4e721ace368cb89876e3f96f` |

The S2 package contains the exact `NiNo's Extra` difficulty (MD5
`256a8a9df9a06d924d1578357ad56840`, set 403096). The S6 package replaces
`2314568.osz` in the current tree; the older file remains in its historical
commit. Its exact difficulty and background bytes are unchanged. Existing
migration 0085 and its audit hashes remain historical evidence of that earlier
package; they are not rewritten to claim the newer file was used then.

`python3 scripts/prepare-map-downloads.py --check` verifies both package hashes,
ZIP CRC and bounded size, exact BID/set/ruleset/difficulty identity, and the
pinned GitHub raw download URLs in `src/data/archive-map-downloads.json`.
`python3 scripts/prepare-s6-map-file.py --check` also verifies the new S6 source
and existing extracted cover. Two S6 import packages and their generator retain
the mirror. The early-season inventory remains the original captured evidence.

Migration `0086_mappool_download_mirrors` adds nullable
`mappool_entries.download_mirror` and optional historical typed-map
`value_download_mirror`. It transactionally saves only `downloadMirror` on the
two exact completed historical slots above. It preserves original revisions,
adds an audited revision with package/difficulty hashes, and is idempotent.
A different saved mirror or duplicate target fails and rolls back both seasons.
BIDs, source cells, attributes, publication, approvals and statistics are retained.
The display fallback uses the same scoped manifest without writes on read.
This batch does not recover S2 artwork or replace any historical metric.

After the reviewed release/migration is deployed through the existing operator
flow, run in its configured runtime environment:

```sh
python3 scripts/prepare-map-downloads.py --check
python3 scripts/prepare-s6-map-file.py --check
npm run db:normalize-archives -- s2 s6 --apply --verify
```

Read back both saved records and typed projections with the operator's existing
DB tooling. The saved value should be the corresponding pinned GitHub URL in the
manifest; compare against `value_download_mirror` after normalization:

```sql
SELECT s.slug, p.value->>'id' AS pool, m.value->>'slot' AS slot,
       m.value->>'beatmapId' AS bid, m.value->>'downloadMirror' AS mirror
FROM edition_state s
CROSS JOIN LATERAL jsonb_array_elements(s.configuration->'archive'->'pools') p(value)
CROSS JOIN LATERAL jsonb_array_elements(p.value->'maps') m(value)
WHERE s.slug IN ('s2','s6') AND p.value->>'id'='captain-qualifier'
  AND ((s.slug='s2' AND m.value->>'slot'='NM2' AND m.value->>'beatmapId'='1009329')
    OR (s.slug='s6' AND m.value->>'slot'='NM3' AND m.value->>'beatmapId'='2314568'));
```

Public configuration reads and card/list/Details must expose the same mirror.
The GitHub targets download OSZ bytes directly, not a blob HTML page. Frontend
remote views remain read-only; production operations and new wording acceptance
are separate organizer/operator steps.
