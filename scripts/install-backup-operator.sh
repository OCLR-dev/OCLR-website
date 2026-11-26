#!/usr/bin/env bash
# Install or upgrade the separate Rocky backup operator from a reviewed checkout.
set +x
set -Eeuo pipefail
umask 077
fail() { printf '%s\n' "$1" >&2; exit 1; }
usage='Usage: sudo bash scripts/install-backup-operator.sh --ref FULL_REVIEWED_SHA --dry-run|--apply|--upgrade'
[[ $# == 3 && $1 == --ref && $2 =~ ^[a-f0-9]{40}$ ]] || fail "$usage"
sha=$2
upgrade=false
case "$3" in
  --dry-run)
    printf '%s\n' 'Create a separate oclr-backup account, private data/key/config paths and root-owned operator release.' \
      'Install locked npm dependencies as the unprivileged backup account; install the systemd unit and narrow sudoers.' \
      'Grant the backup account only directory traversal and read access to the current release marker.' \
      'Preserve existing keys/configuration. Do not start the service, load secrets, connect to a database or restart the website.' \
      'After private configuration, an operator explicitly enables the backup service and configures the website socket.'
    exit 0 ;;
  --apply) ;;
  --upgrade) upgrade=true ;;
  *) fail "$usage" ;;
esac
[[ $EUID == 0 ]] || fail 'Run provisioning with sudo from a separately reviewed installer checkout.'
source_dir=$(cd -- "${BASH_SOURCE[0]%/*}/.." && pwd -P)
[[ "$source_dir" != /opt/oclr && "$source_dir" != /opt/oclr/* && "$source_dir" != /opt/oclr-backup && "$source_dir" != /opt/oclr-backup/* ]] || fail 'Use a separate installer checkout, never the runtime/operator installation.'
for command in git tar npm node flock runuser install useradd getent systemctl visudo; do command -v "$command" >/dev/null || fail "Missing required tool: $command"; done
command -v setfacl >/dev/null || fail 'Missing required tool: setfacl (Rocky: sudo dnf install acl).'
[[ -f /etc/os-release ]] || fail 'Rocky Linux 10 is required.'
. /etc/os-release
[[ ${ID-} == rocky && ${VERSION_ID-} == 10* ]] || fail 'This installer supports Rocky Linux 10 only.'
unit=/etc/systemd/system/oclr-backup.service
operator_root=/opt/oclr-backup
current=$operator_root/current
release=$operator_root/releases/$sha
if ! "$upgrade"; then
  [[ ! -e "$unit" && ! -L "$unit" ]] || fail 'A unit already exists. Use --upgrade for an existing installation.'
  [[ ! -e /etc/sudoers.d/oclr-backup && ! -L /etc/sudoers.d/oclr-backup ]] || fail 'A sudoers file already exists; preserve it and inspect it.'
fi
getent passwd oclr >/dev/null || fail 'Install the existing website account first.'
getent group oclr >/dev/null || fail 'The website group is missing.'
installer=${SUDO_USER:-root}
[[ "$installer" != oclr && "$installer" != oclr-backup ]] || fail 'The installer checkout must not belong to a service account.'
git_read() { runuser -u "$installer" -- git -c core.fsmonitor=false -C "$source_dir" "$@" 9>&-; }
[[ -z $(git_read status --porcelain) ]] || fail 'Use a clean reviewed installer checkout.'
git_read merge-base --is-ancestor "$sha" origin/main || fail 'The reviewed SHA is not on the fetched canonical main.'
for required_file in operator/worker.ts operator/operator.env.example operator/media-fingerprint.mjs operator/systemd/oclr-backup.service scripts/backup-release-access.sh; do git_read cat-file -e "$sha:$required_file" || fail 'The selected release lacks the operator installation contract.'; done
/bin/bash "$source_dir/scripts/check-node-version.sh" /usr/bin/node || fail 'Use Node.js >=22.13 (Node.js 24 is preferred); /usr/bin/node must satisfy this requirement.'
# PGDG client packages are often outside systemd's default PATH.
operator_path=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin
if ! "$upgrade"; then
  client_dir=${OCLR_PG_BIN-}
  if [[ -z "$client_dir" ]]; then
    candidates=()
    for directory in /usr/bin /usr/pgsql-*/bin; do
      [[ ! -x "$directory/pg_dump" || ! -x "$directory/pg_restore" || ! -x "$directory/psql" ]] || candidates+=("$directory")
    done
    [[ ${#candidates[@]} == 1 ]] || fail 'Set OCLR_PG_BIN to the reviewed matching PostgreSQL client bin directory; no unique choice was found.'
    client_dir=${candidates[0]}
  fi
  [[ "$client_dir" =~ ^/usr/(bin|pgsql-[0-9]+/bin)$ && -x "$client_dir/pg_dump" && -x "$client_dir/pg_restore" && -x "$client_dir/psql" ]] || fail 'Use an installed standard PostgreSQL client directory.'
  for tool_path in "$client_dir" "$client_dir/psql" "$client_dir/pg_dump" "$client_dir/pg_restore"; do
    [[ $(stat -Lc %u "$tool_path") == 0 ]] || fail 'PostgreSQL tools must be root-owned.'
    tool_mode=$(stat -Lc %a "$tool_path")
    (( (8#$tool_mode & 8#022) == 0 )) || fail 'PostgreSQL tools cannot be writable by a service account or other users.'
  done
  operator_path="$client_dir:$operator_path"
fi
[[ -d /opt/oclr && ! -L /opt/oclr ]] || fail 'The standard /opt/oclr installation is required.'
# Open the existing inode; never replace an updater lock that could be held.
[[ ! -L /opt/oclr/.update.lock ]] || fail 'The update lock cannot be a symlink.'
if "$upgrade"; then
  [[ -f /opt/oclr/.update.lock ]] || fail 'The existing website update lock is missing.'
else
  [[ -e /opt/oclr/.update.lock ]] || runuser -u oclr -- touch -- /opt/oclr/.update.lock
fi
exec 9>>/opt/oclr/.update.lock
[[ -f /proc/self/fd/9 && $(stat -Lc %u /proc/self/fd/9) == $(id -u oclr) ]] || fail 'The lock must be a regular file owned by the website account.'
flock -n 9 || fail 'An update or backup is active; retry after it completes.'
if ! "$upgrade"; then
  chown oclr:oclr /proc/self/fd/9
  chmod 0660 /proc/self/fd/9
  if systemctl is-active --quiet oclr-backup.service; then fail 'The operator is already running. Use --upgrade for an existing installation.'; fi
  getent passwd oclr-backup >/dev/null || useradd --system --home-dir /var/lib/oclr-backup --shell /sbin/nologin --gid oclr oclr-backup
fi
[[ $(id -u oclr-backup) != 0 && $(id -u oclr-backup) != $(id -u oclr) ]] || fail 'A separate unprivileged backup account is required.'
[[ $(id -g oclr-backup) == $(getent group oclr | cut -d: -f3) ]] || fail 'The backup account must use the website socket group.'
for path in /opt/oclr-backup /var/lib/oclr-backup /etc/oclr-backup; do [[ ! -L "$path" ]] || fail 'Provisioning paths cannot be symlinks.'; done
legacy_dropin=''
if "$upgrade"; then
  [[ -f "$unit" && ! -L "$unit" && -O "$unit" && -L "$current" &&
     -d "$operator_root/releases" && ! -L "$operator_root/releases" &&
     -f /etc/oclr-backup/operator.env && -f /etc/oclr-backup/package.key ]] ||
    fail 'Expected an existing operator installed with the OCLR installer.'
  previous=$(readlink -f -- "$current")
  [[ "$previous" =~ ^/opt/oclr-backup/releases/([a-f0-9]{40})$ && -d "$previous" ]] ||
    fail 'The current operator release path is invalid.'
  previous_sha=${BASH_REMATCH[1]}
  for directory in "$operator_root" "$operator_root/releases" "$previous" "${unit%/*}"; do
    [[ -O "$directory" ]] || fail 'Expected root-owned operator and systemd directories.'
    directory_mode=$(stat -Lc %a "$directory")
    (( (8#$directory_mode & 8#022) == 0 )) || fail 'Operator and systemd directories must be writable only by root.'
  done
  [[ $(systemctl show -p FragmentPath --value oclr-backup.service) == "$unit" ]] ||
    fail 'The operator is using a different systemd unit file.'
  working=$(systemctl show -p WorkingDirectory --value oclr-backup.service)
  [[ $(readlink -f -- "$working") == "$previous" &&
     $(grep -c '^WorkingDirectory=' "$unit") == 1 ]] ||
    fail 'Review the custom operator working directory before upgrading.'
  [[ $(systemctl show -p User --value oclr-backup.service) == oclr-backup &&
     $(systemctl show -p Group --value oclr-backup.service) == oclr &&
     $(systemctl show -p ExecStart --value oclr-backup.service) == *"argv[]=/usr/bin/node --import tsx operator/server.ts ;"* ]] ||
    fail 'Review the custom operator service account or startup command before upgrading.'
  prior_override=$unit.d/40-backup-worker.conf
  if [[ -e "$prior_override" || -L "$prior_override" ]]; then
    [[ -f "$prior_override" && ! -L "$prior_override" && -O "$prior_override" ]] ||
      fail 'Review the existing worker override before upgrading.'
    binding=$(sed -n 's/^BindReadOnlyPaths=//p' "$prior_override")
    prior_worker=${binding%%:*}
    [[ "$prior_worker" =~ ^/etc/oclr-backup/worker-[a-f0-9]{40}\.ts$ ]] &&
      printf '[Service]\nBindReadOnlyPaths=%s:%s/operator/worker.ts\n' "$prior_worker" "$previous" | cmp -s - "$prior_override" ||
      fail 'Review the custom worker override before upgrading.'
    legacy_dropin=$prior_override
  fi
  if [[ "$previous" == "$release" && -z "$legacy_dropin" ]]; then
    printf 'Backup operator is already on %s.\n' "$sha"
    exit 0
  fi
  git_read merge-base --is-ancestor "$previous_sha" "$sha" || fail 'Choose a reviewed release newer than the installed operator.'
else
  install -d -o root -g root -m 0755 "$operator_root" "$operator_root/releases"
  install -d -o oclr-backup -g oclr -m 0700 /var/lib/oclr-backup
  install -d -o root -g root -m 0755 /etc/oclr-backup
  [[ ! -e "$current" && ! -L "$current" ]] || fail 'Preserve an existing operator release pointer.'
fi
[[ ! -e "$release" && ! -L "$release" ]] || fail 'This operator release already exists; preserve it and inspect configuration.'
stage=''
release_stage=''
sudoers=''
cleanup() {
  [[ -z "$stage" ]] || rm -rf -- "$stage"
  [[ -z "$release_stage" ]] || rm -rf -- "$release_stage"
  [[ -z "$sudoers" ]] || rm -f -- "$sudoers"
}
trap cleanup EXIT
release_stage=$(mktemp -d "$operator_root/releases/.staging-XXXXXXXX")
# Control files and helpers always stay root-owned; npm never owns this tree.
git_read archive "$sha" | tar --no-same-owner -xf - -C "$release_stage"
find "$release_stage" -xdev -type d -exec chmod 0755 {} +
find "$release_stage" -xdev -type f -perm /111 -exec chmod 0755 {} +
find "$release_stage" -xdev -type f ! -perm /111 -exec chmod 0644 {} +
stage=$(mktemp -d /opt/oclr-backup/.dependencies-XXXXXXXX)
chown oclr-backup:oclr "$stage"
dependency_paths=(package.json package-lock.json)
vendor_path=$(git_read ls-tree --name-only "$sha" -- vendor)
if [[ -n "$vendor_path" ]]; then
  dependency_paths+=(vendor)
fi
git_read archive "$sha" -- "${dependency_paths[@]}" | tar --no-same-owner -xf - -C "$stage"
chown -hR oclr-backup:oclr "$stage"
# Install data only in a separate staging tree. No package lifecycle code runs.
runuser -u oclr-backup -- env -i HOME=/var/lib/oclr-backup USER=oclr-backup LOGNAME=oclr-backup PATH="$operator_path" NODE_ENV=development npm --prefix "$stage" ci --include=dev --ignore-scripts 9>&-
[[ -d "$stage/node_modules" && ! -L "$stage/node_modules" && ! -e "$release_stage/node_modules" && ! -L "$release_stage/node_modules" ]] || fail 'Expected a real staged dependency tree and an unused destination.'
cp -a -- "$stage/node_modules" "$release_stage/node_modules"
chown -hR root:root "$release_stage/node_modules"
find "$release_stage/node_modules" -xdev -type d -exec chmod 0755 {} +
find "$release_stage/node_modules" -xdev -type f -perm /111 -exec chmod 0755 {} +
find "$release_stage/node_modules" -xdev -type f ! -perm /111 -exec chmod 0644 {} +
rm -rf -- "$stage"
stage=''
mv -T -- "$release_stage" "$release"
release_stage=''
if "$upgrade"; then
  source "$source_dir/scripts/backup-operator-switch.sh"
  if switch_backup_operator_release "$release" "$current" "$unit" "$legacy_dropin"; then
    printf 'Backup operator upgraded to %s.\n' "$sha"
    exit 0
  else
    switch_status=$?
    if [[ $switch_status == 1 ]]; then rm -rf -- "$release"; fi
    exit "$switch_status"
  fi
fi
ln -s -- "$release" /opt/oclr-backup/current
runuser -u oclr -- /bin/bash "$release/scripts/backup-release-access.sh" /opt/oclr "$(readlink -f -- /opt/oclr/current)" 9>&-
[[ -f "$release/operator/systemd/oclr-backup.service" && -f "$release/operator/operator.env.example" ]] || fail 'The selected release lacks the operator installation contract.'
if [[ ! -e /etc/oclr-backup/package.key ]]; then
  [[ ! -L /etc/oclr-backup/package.key ]] || fail 'The key cannot be a symlink.'
  /usr/bin/node -e 'require("node:fs").writeFileSync("/etc/oclr-backup/package.key",require("node:crypto").randomBytes(32),{flag:"wx",mode:0o400})'
  chown oclr-backup:oclr /etc/oclr-backup/package.key
fi
[[ -f /etc/oclr-backup/package.key && ! -L /etc/oclr-backup/package.key && $(stat -c %s /etc/oclr-backup/package.key) == 32 && $(stat -c %u /etc/oclr-backup/package.key) == $(id -u oclr-backup) ]] || fail 'Preserve and inspect the existing key ownership/size.'
[[ $(stat -c %a /etc/oclr-backup/package.key) == 400 || $(stat -c %a /etc/oclr-backup/package.key) == 600 ]] || fail 'The existing key must be private to the backup account.'
if [[ ! -e /etc/oclr-backup/operator.env ]]; then install -o root -g root -m 0600 "$release/operator/operator.env.example" /etc/oclr-backup/operator.env; fi
[[ -f /etc/oclr-backup/operator.env && ! -L /etc/oclr-backup/operator.env && $(stat -c %u /etc/oclr-backup/operator.env) == 0 ]] || fail 'The operator configuration must be a regular root-owned private file.'
[[ $(stat -c %a /etc/oclr-backup/operator.env) == 600 || $(stat -c %a /etc/oclr-backup/operator.env) == 400 ]] || fail 'The existing operator configuration must be private.'
# Keep the unit tied to a root-owned release, independent of the application checkout.
sed "s|WorkingDirectory=/opt/oclr-backup$|WorkingDirectory=$release\\nEnvironment=PATH=$operator_path|" "$release/operator/systemd/oclr-backup.service" > /etc/systemd/system/oclr-backup.service
chmod 0644 /etc/systemd/system/oclr-backup.service
sudoers=$(mktemp)
printf '%s\n' 'oclr-backup ALL=(root) NOPASSWD: /usr/bin/systemctl stop oclr.service, /usr/bin/systemctl start oclr.service' \
  'oclr-backup ALL=(oclr) NOPASSWD: /usr/bin/node /opt/oclr-backup/current/operator/media-fingerprint.mjs /var/lib/oclr/media' > "$sudoers"
visudo -cf "$sudoers" >/dev/null
install -o root -g root -m 0440 "$sudoers" /etc/sudoers.d/oclr-backup
systemctl daemon-reload
printf '%s\n' 'Provisioned only. The backup service has NOT been started.' \
  'Privately configure /etc/oclr-backup/operator.env with the approved operator DB identity and recovery Admins.' \
  'Set OCLR_OPERATOR_SOCKET=/run/oclr-backup/operator.sock in the website runtime configuration.' \
  'Review SELinux/media access and back up the package key; then explicitly run systemctl enable --now oclr-backup.service.' \
  'Restart the website only in an approved maintenance window to load its new socket setting.'
