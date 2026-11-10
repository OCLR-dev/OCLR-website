#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 || ! ${1-} =~ ^[a-f0-9]{40}$ ]]; then
  printf '%s\n' 'Usage: bash scripts/archive-website-release.sh FULL_COMMIT_SHA' >&2
  exit 1
fi

source_dir=$(cd -- "${BASH_SOURCE[0]%/*}/.." && pwd -P)
commit="$1^{commit}"
archive_args=(--format=tar "$commit" --)

# Read policy from the selected commit. Earlier commits may only have exclusions.
for policy in paths excludes; do
  manifest="scripts/website-release-$policy.txt"
  manifest_path=$(git -C "$source_dir" ls-tree --name-only "$commit" -- "$manifest")
  [[ -n "$manifest_path" ]] || continue
  pathspec=':(top,literal)'
  if [[ "$policy" == excludes ]]; then
    pathspec=':(top,exclude,literal)'
  fi
  entries=$(git -C "$source_dir" show "$commit:$manifest")
  while IFS= read -r entry; do
    if [[ ! "$entry" =~ ^[a-zA-Z0-9_.-]+(/[a-zA-Z0-9_.-]+)*$ ||
      "/$entry/" == */./* || "/$entry/" == */../* ]]; then
      printf 'Invalid website release path in %s: %s\n' "$manifest" "$entry" >&2
      exit 1
    fi
    archive_args+=("$pathspec$entry")
  done <<< "$entries"
done

exec git -C "$source_dir" archive "${archive_args[@]}"
