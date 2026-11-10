# Website release archive inventory

The Rocky website updater builds from a tar stream extracted into a new release
directory. The backup operator installer and ordinary `git archive` exports
still use the full source tree. The website updater reads the
[allowlist](../scripts/website-release-paths.txt) and
[exclusions](../scripts/website-release-excludes.txt) from the selected commit.
Each line is a literal repository-relative path. The allowlist includes
directories recursively, and exclusions remove specific subtrees such as offline
beatmap packages. Check build, runtime, verification and licensing references
when changing either list. Commits with only exclusions use their existing
policy. Commits with neither list use the full source archive. Updaters from
before the allowlist continue to apply the exclusions when packaging a new commit.

| Paths | Purpose | Website archive |
| --- | --- | --- |
| `design/`, `docs/design/`, `output/imagegen/` | Offline artwork, mockups, raw images, design tools and their source notices | Excluded. Retrieve from Git at the selected commit. |
| `docs/verification/` | Historical review notes, screenshots and reproduction scripts | Excluded. Read and run them from the Git checkout at the selected commit. |
| `public/`, `LICENSES/` | Published artwork, archived rules, fonts and required notices | Included |
| `docs/imports/beatmaps/` | Original `.osz` packages used by offline review scripts | Excluded. The website's download links use the packages at their pinned Git revision. |
| `tests/`, other `docs/imports/` | Source validation, test fixtures and historical inputs | Included. The current type check covers test sources and their imports. |
| `src/lib/extended-read-contracts.json`, `scripts/extended-read-resources.json`, generated API files under `docs/` | Versioned contracts, inventories and coverage | Included |
| `drizzle/`, `scripts/`, `operator/`, package and build inputs | Migrations, release tooling, shared backup identity and build configuration | Included |
| Development guides, design work and repository metadata | Contributor reference and tooling | The allowlist keeps the operational guides, build inputs and files read by the test suite. Other references remain in Git. |

## Baseline

The inventory uses main commit `d62813b810c548292ca1adb8f864eb9aafc97929`.
Sizes are rounded to one decimal place in MiB. Tracked sizes sum the bytes at
each path, so identical blobs at distinct paths count separately.

| Measurement | MiB |
| --- | ---: |
| Tracked tree | 474.4 |
| Local packed Git objects | 503.9 |
| Local loose Git objects | 1.7 |
| `docs/verification/` | 117.8 |
| `design/` | 92.3 |
| `public/` | 86.8 |
| `output/imagegen/` | 74.9 |
| `docs/design/` | 52.1 |
| `docs/imports/` | 20.0 |
| `drizzle/` | 15.9 |
| Four generated API files above | 2.7 |
| Local `.next` build files outside `.next/cache` | 59.2 |
| Local `.next/cache` | 165.4 |
| Local gzip of `.next` without its cache, using the CI browser artifact layout | 16.0 |

The Git object measurements describe one local checkout, including objects
outside the main tree. Build outputs come from a clean Node.js 24 build of the
same source tree. The website archive contains source inputs before dependency
installation or build.

The largest tracked files are S11 source PNGs at 17.1, 16.0, 15.2 and 11.7 MiB
under `output/imagegen/`. The app serves the derivative WebP files in
`public/`, including the [S11 key visual](../src/components/event-artwork.tsx).
The largest published asset is `public/branding/home-s11/liru-refined-v2.svg`
at 5.0 MiB. Its identical offline copy remains in
`design/home-visual/layer-studio/assets/`. Both copies remain tracked.

Applying the design exclusions to the baseline tree reduced the uncompressed
tar from 478.0 to 258.2 MiB (46.0%) and gzip from 404.4 to 210.5 MiB (48.0%).
The updater extracts the uncompressed stream. Gzip is included as a separate
comparison.

| Website tar policy | Uncompressed MiB | Gzip MiB |
| --- | ---: | ---: |
| Full source | 478.0 | 404.4 |
| Design and original artwork excluded | 258.2 | 210.5 |
| Verification evidence also excluded | 139.7 | 99.1 |
| Allowlist and offline beatmap exclusion | 124.9 | 84.8 |

The last step removes about 14.8 MiB from the previous website tar. The two
`.osz` packages account for 13.8 MiB. Both match the Git blobs at
`8e8416c3003795665b148208f6ecd94137ed812a`, the revision used by the
[published download catalog](../src/data/archive-map-downloads.json).
The archive tools can read the originals from a full checkout.

## Verification evidence

The design-only archive at `6ead6a06131577f3112bbee3fd1d33f345b951d5`
includes 799 verification files, mostly screenshots. The second batch keeps
the reviewed reaction export byte for byte, moves it into `tests/fixtures/`,
and excludes `docs/verification/` from the website archive. The uncompressed
tar drops from 258.2 to about 139.7 MiB. Git retains the review notes, attachments
and scripts. Historical commits use their own manifests, so the design-only
commit still packages the evidence and the export at their original paths.

Keep lasting acceptance records under `docs/verification/`, with the reviewed
commit, the commands and results, and links to the inputs. Store files needed
by builds or tests with the code that consumes them. Put disposable browser
screenshots and traces in the ignored `test-results/` directory. The existing
[browser CI artifacts](ci.md) retain this output for seven days. Keep a Git
copy of any reviewed evidence needed after artifact expiry and reference it
from the acceptance record.

## Published assets and delivery boundaries

At `6ead6a06131577f3112bbee3fd1d33f345b951d5`, 19 groups of files in
`public/` share a Git blob. The additional paths account for 1,979,639 bytes
(1.9 MiB), including 1,781,241 bytes under `public/reactions/`. The reaction
catalog, flag codes and season rule pages expose those paths independently.
The two identical S11 key visual files also serve separate URLs in the
[branding notes](../public/branding/README.md). The website archive retains
the published paths and their notices.

| Delivery surface | Inputs and boundary |
| --- | --- |
| Database-backed website | Next routes and server rendering, domain services, PostgreSQL schema and migrations, backup identity, static assets and operator scripts. It owns authorization, writes and published data. |
| Remote frontend development | Next pages, components, adapters, messages, public assets, lockfile and appearance generation. The shared source graph still includes local branches and the backup identity module. At runtime it uses a compatible versioned saved-data HTTP backend and the separate `.next-remote` output. |
| Shared contract | Resource definitions, response validation and generated OpenAPI and coverage. The frontend and backend need compatible v1 contracts and the same published asset paths. |

A clean 94.7 MiB remote source archive from `d3924836532b04a8d26462691ce50a3f38353957`
passed the synthetic SSR, identity, revocation and read-only HTTP checks with
zero local database connection attempts. The subset keeps the existing lockfile
and source graph but omits migrations, the backup worker and release tooling.
Follow the [remote development setup](remote-development.md) to run it with
`next dev`. Production remote mode requires a separate build and startup path
and its own compatibility checks. The supported production build is the
database-backed application.

The remote development subset can be reproduced from the reviewed checkout:

```bash
git archive --format=tar HEAD -- \
  .gitignore LICENSE LICENSES package.json package-lock.json \
  next-env.d.ts next.config.ts tsconfig.json postcss.config.mjs \
  messages operator/identity.ts public src \
  scripts/build-appearance-styles.ts scripts/extended-read-resources.json \
  tests/fixtures/no-local-database.ts > remote-source.tar
```

## Reproduce

From a checkout containing this batch, compare the full and website archive
of the same commit. These commands read Git and use a temporary directory.

```bash
set -euo pipefail
sha=$(git rev-parse HEAD)
scratch=$(mktemp -d)
trap 'rm -r -- "$scratch"' EXIT
git count-objects -vH
git ls-tree -rl "$sha" | awk '{ total += $4 } END { print total }'
git ls-tree -rl "$sha" | sort -k4,4nr | sed -n '1,20p'
git ls-tree -rl "$sha" public | awk '
  { count[$3]++; size[$3] = $4 }
  END {
    for (blob in count) if (count[blob] > 1) {
      groups++; extra += (count[blob] - 1) * size[blob]
    }
    print groups + 0, extra + 0
  }'
git archive --format=tar "$sha" > "$scratch/full.tar"
bash scripts/archive-website-release.sh "$sha" > "$scratch/website.tar"
for name in full website; do
  wc -c < "$scratch/$name.tar"
  gzip -n < "$scratch/$name.tar" | wc -c
  tar -tf "$scratch/$name.tar" > "$scratch/$name.paths"
done
diff -u "$scratch/full.paths" "$scratch/website.paths" || test "$?" -eq 1
```

Use `git ls-tree -r -l "$sha" -- PATH` for tracked path sizes or
`git archive "$sha" -- PATH` to retrieve an omitted directory or file from the
reviewed Git commit. For example, the acceptance record is under
`docs/verification/` and the original beatmap packages are under
`docs/imports/beatmaps/`.
