# Website release archive inventory

The Rocky website updater builds from a tar stream extracted into a new release
directory. The backup operator installer and ordinary `git archive` exports
still use the full source tree. The website updater reads
[`scripts/website-release-excludes.txt`](../../../scripts/website-release-excludes.txt)
from the selected commit. Each line is a literal repository-relative path.
Add a path only after checking its source, build, runtime, verification and
licensing references. Older commits without the manifest use their full archive.

| Paths | Purpose | Website archive |
| --- | --- | --- |
| `design/`, `docs/design/`, `output/imagegen/` | Offline artwork, mockups, raw images, design tools and their source notices | Excluded. Retrieve from Git at the selected commit. |
| `public/`, `LICENSES/` | Published artwork, archived rules, fonts and required notices | Included |
| `docs/verification/`, `docs/imports/` | Acceptance evidence, test inputs and import source references | Included. The player reactions test reads `docs/verification/issue-969/selection.json`. |
| `src/lib/extended-read-contracts.json`, `docs/read-api.openapi.json`, `docs/write-api.openapi.json`, `docs/remote-coverage.json` | Versioned contracts and coverage inventory | Included |
| `drizzle/`, `scripts/`, package and build inputs | Migrations, release tooling and build configuration | Included |

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
`public/`, including the [S11 key visual](../../../src/components/event-artwork.tsx).
The largest published asset is `public/branding/home-s11/liru-refined-v2.svg`
at 5.0 MiB. Its identical offline copy remains in
`design/home-visual/layer-studio/assets/`. Both copies remain tracked.

Applying the new exclusion paths to the baseline tree reduced the uncompressed
tar from 478.0 to 258.2 MiB (46.0%) and gzip from 404.4 to 210.5 MiB (48.0%).
The updater extracts the uncompressed stream. Gzip is included as a separate
comparison.

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
`git archive "$sha" -- PATH` to retrieve an excluded directory with its
original structure. Review future evidence and public asset changes separately
from the website packaging policy.
