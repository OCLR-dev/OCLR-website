#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 || ! ${1-} =~ ^[a-f0-9]{40}$ ]]; then
  printf '%s\n' 'Usage: bash scripts/archive-website-release.sh FULL_COMMIT_SHA' >&2
  exit 1
fi

source_dir=$(cd -- "${BASH_SOURCE[0]%/*}/.." && pwd -P)
commit="$1^{commit}"
manifest=scripts/website-release-excludes.txt
archive_args=(--format=tar "$commit" --)

# The selected commit owns its packaging policy. Older commits use the full tree.
manifest_path=$(git -C "$source_dir" ls-tree --name-only "$commit" -- "$manifest")
if [[ -n "$manifest_path" ]]; then
  excludes=$(git -C "$source_dir" show "$commit:$manifest")
  while IFS= read -r path; do
    if [[ ! "$path" =~ ^[a-z0-9_-]+(/[a-z0-9_-]+)*$ ]]; then
      printf 'Invalid website release exclusion in %s: %s\n' "$manifest" "$path" >&2
      exit 1
    fi
    archive_args+=(":(top,exclude,literal)$path")
  done <<< "$excludes"
fi

exec git -C "$source_dir" archive "${archive_args[@]}"
