#!/usr/bin/env bash
# Single-app-host update workflow. Configuration is exported by the operator.
set +x
set -Eeuo pipefail
umask 077
fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ ${OCLR_DATA_SOURCE-database} == database ]] || fail "Production commands require the database data source; remote development is disabled."
usage='Usage: bash scripts/update.sh --ref FULL_REVIEWED_COMMIT_SHA --dry-run|--apply [--initial]'
[[ ( $# == 3 || ( $# == 4 && ${4-} == --initial ) ) && ${1-} == --ref && ${2-} =~ ^[a-f0-9]{40}$ ]] || fail "$usage"
initial=false
[[ ${4-} != --initial ]] || initial=true
sha=$2
case "$3" in --dry-run) dry_run=true ;; --apply) dry_run=false ;; *) fail "$usage" ;; esac
source_dir=$(cd -- "${BASH_SOURCE[0]%/*}/.." && pwd -P)
install_dir=${OCLR_INSTALL_DIR:-/opt/oclr}
backup_root=${OCLR_BACKUP_DIR:-/var/lib/oclr/backups}
service=${OCLR_SERVICE:-oclr.service}
[[ "$install_dir" == /* && "$backup_root" == /* ]] || fail 'Release and backup paths must be absolute.'
[[ "$service" =~ ^[a-zA-Z0-9_-]+\.service$ ]] || fail 'Choose a valid systemd service name.'
migration_url=${MIGRATION_DATABASE_URL-}
export -n migration_url
unset MIGRATION_DATABASE_URL
export NODE_ENV=production

if "$dry_run"; then
  printf '%s\n' "Update preview: $sha" \
    "Environment: ${OCLR_ENVIRONMENT:-not configured}" \
    "Expected database: ${OCLR_EXPECTED_DB_HOST:-not configured}/${OCLR_EXPECTED_DB_NAME:-not configured}" \
    "Acquire environment lock at $install_dir/.update.lock" \
    'Fetch and verify the reviewed commit on origin/main; leave the running checkout untouched.' \
    "Prepare a new versioned directory under $install_dir/releases (npm ci, check, build)." \
    'Verify runtime/migration targets and applied migration hashes; show pending migrations.' \
    "Stop $service; create and fully decode a private pg_dump archive under $backup_root." \
    'Apply only pending committed migrations under a PostgreSQL advisory lock.' \
    'Run runtime release preflight; atomically switch current and retain previous.' \
    "Start $service; verify the exact release, database, public HTML and HTTPS proxy." \
    'On uncertain schema/activation failure, keep the service stopped for deliberate recovery.' \
    'Dry-run only: no fetch, install, database, backup, filesystem or service changes.'
  exit 0
fi

[[ $EUID -ne 0 ]] || fail 'Run updates as the unprivileged application/deployment account, not root.'
[[ ${OCLR_ENVIRONMENT-} == production || ${OCLR_ENVIRONMENT-} == staging ]] || fail 'Explicitly set OCLR_ENVIRONMENT=production or staging.'
[[ -n ${DATABASE_URL-} && -n "$migration_url" && -n ${APP_URL-} && -n ${OCLR_EXPECTED_DB_HOST-} && -n ${OCLR_EXPECTED_DB_NAME-} ]] || fail 'Export runtime configuration, expected database host/name and migration credentials before updating.'
for name in git tar node npm flock sudo systemctl pg_dump pg_restore readlink mktemp tee; do
  command -v "$name" >/dev/null || fail "Required command is unavailable: $name"
done
systemctl_bin=$(command -v systemctl)
[[ -d "$install_dir/releases" && -w "$install_dir" ]] || fail 'Configure a writable install directory with releases/.'
install_dir=$(cd -- "$install_dir" && pwd -P)
previous=''
if "$initial"; then
  [[ ! -e "$install_dir/current" && ! -L "$install_dir/current" && ! -e "$install_dir/previous" && ! -L "$install_dir/previous" ]] || fail 'An installation already exists; use update or inspect recovery before proceeding.'
else
  [[ -L "$install_dir/current" ]] || fail 'Configure an existing current release symlink before updating.'
  previous=$(readlink -f -- "$install_dir/current")
  [[ "$previous" == "$install_dir/releases/"* && -d "$previous" ]] || fail 'Current must point to an existing release inside the configured releases directory.'
fi
[[ ! -e "$install_dir/previous" || -L "$install_dir/previous" ]] || fail 'The previous path is not a symlink; preserve it and investigate.'
exec 9>"$install_dir/.update.lock"
flock -n 9 || fail 'Another update is already running for this installation.'
[[ -z $(git -C "$source_dir" status --porcelain) ]] || fail 'The operator checkout has uncommitted changes. Preserve them; use a clean checkout for updates.'
[[ $("$systemctl_bin" show --property=User --value "$service") == "$(id -un)" ]] || fail 'Run as the configured service user.'
[[ $("$systemctl_bin" show --property=WorkingDirectory --value "$service") == "$install_dir/current" ]] || fail 'The service WorkingDirectory does not match this installation current symlink.'
if "$initial"; then
  if "$systemctl_bin" is-active --quiet "$service"; then fail 'Stop and inspect the already active service before an initial installation.'; fi
else
  "$systemctl_bin" is-active --quiet "$service" || fail 'The existing service is not active. Inspect the previous deployment and recover it before updating.'
fi
for operation in stop start; do
  sudo -n -l -- "$systemctl_bin" "$operation" "$service" >/dev/null 2>&1 || fail 'Configure narrowly scoped noninteractive sudo permission for this service stop/start.'
done

git -C "$source_dir" fetch origin main
git -C "$source_dir" cat-file -e "$sha^{commit}"
git -C "$source_dir" merge-base --is-ancestor "$sha" origin/main || fail 'The reviewed commit is not on origin/main.'
old_sha=none
if "$initial"; then
  :
elif [[ -f "$previous/.oclr-release" ]]; then
  old_sha=$(<"$previous/.oclr-release")
else
  old_sha=$(git -C "$previous" rev-parse HEAD)
fi
if ! "$initial"; then
  [[ "$old_sha" =~ ^[a-f0-9]{40}$ ]] || fail 'Cannot identify the previous release SHA.'
  if [[ "$old_sha" == "$sha" && -f "$previous/.oclr-release" ]]; then
    (cd -- "$previous"; node --import tsx scripts/deployment-db.ts health "$sha")
    printf 'Release already active and healthy: %s\n' "$sha"
    exit 0
  fi
  git -C "$source_dir" cat-file -e "$old_sha^{commit}"
fi
release=$(mktemp -d "$install_dir/releases/$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:12}-XXXXXX")
mkdir -p -- "$backup_root"
[[ $(stat -c %u "$backup_root") == "$EUID" ]] || fail 'The backup directory must belong to the deployment account.'
chmod 700 -- "$backup_root"
backup_dir=$(mktemp -d "$backup_root/update-${sha:0:12}-XXXXXX")
exec > >(tee -a "$backup_dir/update.log") 2>&1
stopped=false
activated=false
child=''
phase='extracting and validating release files'
log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$1"; }
finish() {
  local code=$?
  trap - EXIT INT TERM
  set +e
  if [[ -n "$child" ]]; then kill -TERM "$child" 2>/dev/null; wait "$child" 2>/dev/null; fi
  if [[ $code -ne 0 ]]; then
    log "Update failed during $phase (exit $code). No automatic database rollback or release deletion was performed."
    log "Service diagnostics: sudo systemctl status $service --no-pager; sudo journalctl -u $service -n 80 --no-pager"
    if "$stopped"; then
      if "$initial" || [[ -f "$backup_dir/migration.started" ]] || "$activated"; then
        sudo -n "$systemctl_bin" stop "$service"
        log "Service kept stopped. Review schema/compatibility before recovery. Previous: $previous; backup/log: $backup_dir"
      else
        sudo -n "$systemctl_bin" start "$service"
        log 'No migration or activation began; requested restart of the unchanged previous release.'
      fi
    fi
  fi
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
run() { "$@" & child=$!; wait "$child"; child=''; }
database() {
  export MIGRATION_DATABASE_URL="$migration_url"
  exec node --import tsx scripts/deployment-db.ts "$@"
}
log "Environment: $OCLR_ENVIRONMENT; reviewed release: $sha; previous: $old_sha"
log "Release directory: $release; backup/log directory: $backup_dir"
git -C "$source_dir" archive "$sha" | tar -x -C "$release"
[[ -f "$release/scripts/deployment-db.ts" && -f "$release/scripts/production.sh" ]] || fail 'The selected release does not include the update/preparation contract.'
for name in .env .env.local .env.production .env.production.local; do
  [[ ! -e "$release/$name" ]] || fail 'Production secrets must stay outside the release.'
done
if ! "$initial" && ! git -C "$source_dir" diff --quiet "$old_sha" "$sha" -- src/db/schema.ts; then
  old_count=$(git -C "$source_dir" show "$old_sha:drizzle/meta/_journal.json" | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>console.log(JSON.parse(s).entries.length))')
  new_count=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).entries.length' "$release/drizzle/meta/_journal.json")
  (( new_count > old_count )) || fail 'Database schema source changed without a new committed migration. Reconcile the schema before deploying.'
fi
printf '%s\n' "$sha" > "$release/.oclr-release"
cd -- "$release"
log 'Preparing the new release while the old service stays online.'
phase='building and checking the new release'
run bash scripts/production.sh prepare --apply
phase='checking database target and migration history'
run database inspect
log 'Stopping writes before backup/migration; this is a maintenance-window deployment.'
phase='stopping service writes'
stopped=true
run sudo -n "$systemctl_bin" stop "$service"
phase='backing up and applying database migrations'
# Images share the same stopped-write backup boundary as their database references.
if [[ -n ${OCLR_MEDIA_DIR-} ]]; then
  [[ "$OCLR_MEDIA_DIR" == /* && "$OCLR_MEDIA_DIR" != *"/releases/"* && "$OCLR_MEDIA_DIR" != */releases && ! -L "$OCLR_MEDIA_DIR" ]] || fail 'Media storage must be a durable absolute directory outside releases.'
  if [[ -d "$OCLR_MEDIA_DIR" ]]; then
    tar -cf "$backup_dir/team-media.tar" -C "$OCLR_MEDIA_DIR" .
    tar -tf "$backup_dir/team-media.tar" >/dev/null
    (cd -- "$backup_dir" && sha256sum team-media.tar > team-media.tar.sha256)
    chmod 0600 "$backup_dir/team-media.tar" "$backup_dir/team-media.tar.sha256"
  fi
fi
run database apply "$backup_dir"
unset migration_url
phase='checking runtime configuration and database access'
run npm run release:check
phase='switching release symlinks'
if ! "$initial"; then
  ln -s -- "$previous" "$install_dir/.previous.$$"
  mv -Tf -- "$install_dir/.previous.$$" "$install_dir/previous"
fi
activated=true
ln -s -- "$release" "$install_dir/.current.$$"
mv -Tf -- "$install_dir/.current.$$" "$install_dir/current"
phase='starting the new service'
run sudo -n "$systemctl_bin" start "$service"
phase='verifying local and public release health'
run node --import tsx scripts/deployment-db.ts health "$sha"
phase='checking final service state'
"$systemctl_bin" is-active --quiet "$service"
log "Deployment complete: $sha; previous release: ${previous:-none (initial installation)}; backup/log: $backup_dir"
