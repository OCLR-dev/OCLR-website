#!/usr/bin/env bash
# Rocky Linux 10 convenience entry point. Builds/migrations always run as oclr.
set +x
set -Eeuo pipefail
umask 077
fail() { printf '%s\n' "$1" >&2; exit 1; }

# Bootstrap needs only Node built-ins and psql, before npm dependencies exist.
# Passwords travel in the child environment, never command arguments or logs.
connection_info() {
  node --input-type=module - "$1" <<'NODE'
import { spawnSync } from 'node:child_process';
try {
  const url = new URL(process.env.DATABASE_URL);
  const mode = url.searchParams.get('sslmode');
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !name || url.hash || /[\x00-\x1f\x7f]/.test(name) || !['disable', 'verify-full'].includes(mode)) throw new Error();
  const supported = { sslmode:'PGSSLMODE', sslrootcert:'PGSSLROOTCERT', sslcert:'PGSSLCERT', sslkey:'PGSSLKEY' };
  for (const key of url.searchParams.keys()) if (!(key in supported) || url.searchParams.getAll(key).length !== 1) throw new Error();
  if (process.argv[2] === 'target') console.log(`${url.hostname}\n${name}`);
  else if (process.argv[2] === 'migration') {
    url.username = encodeURIComponent(process.env.OCLR_PROMPT_USER);
    url.password = encodeURIComponent(process.env.OCLR_PROMPT_PASSWORD);
    process.stdout.write(url.toString());
  } else if (process.argv[2] === 'version') {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
    Object.assign(env, { PGHOST:url.hostname.replace(/^\[|\]$/g,''), PGPORT:url.port || '5432', PGDATABASE:name, PGUSER:decodeURIComponent(url.username), PGPASSWORD:decodeURIComponent(url.password), PGCONNECT_TIMEOUT:'10' });
    for (const [key,value] of url.searchParams) env[supported[key]] = value;
    const result = spawnSync('psql', ['-XAtw', '-c', 'SHOW server_version_num'], { env, encoding:'utf8', timeout:15000 });
    if (result.error || result.status !== 0 || !/^\d+\s*$/.test(result.stdout)) throw new Error();
    console.log(Math.floor(Number(result.stdout)/10000));
  } else throw new Error();
} catch {
  console.error('Database configuration/connection check failed. Check runtime.env, credentials and network access privately.');
  process.exitCode = 1;
}
NODE
}

worker() {
  local action=$1 root=$2 env_file=$3 sha=$4 target migration_user migration_password migration_url
  [[ $(id -un) == oclr ]] || fail 'The deployment worker must run as oclr.'
  [[ -f "$env_file" && ! -L "$env_file" ]] || fail 'A regular runtime.env file is required.'
  set -a
  . "$env_file"
  set +a
  set +x
  [[ -z ${MIGRATION_DATABASE_URL+x} ]] || fail 'Remove MIGRATION_DATABASE_URL from runtime.env; the script prompts privately instead.'
  if [[ "$action" == version ]]; then connection_info version; return; fi
  [[ "$action" == deploy || "$action" == update ]] || fail 'Unknown deployment action.'
  [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || fail 'A pinned release SHA is required.'
  target=$(connection_info target)
  export OCLR_ENVIRONMENT=${OCLR_ENVIRONMENT:-production}
  export OCLR_EXPECTED_DB_HOST=${OCLR_EXPECTED_DB_HOST:-${target%%$'\n'*}}
  export OCLR_EXPECTED_DB_NAME=${OCLR_EXPECTED_DB_NAME:-${target#*$'\n'}}
  export OCLR_INSTALL_DIR="$root" OCLR_BACKUP_DIR=/var/lib/oclr/backups OCLR_SERVICE=oclr.service
  printf 'Release: %s\nDatabase: %s/%s\n' "$sha" "$OCLR_EXPECTED_DB_HOST" "$OCLR_EXPECTED_DB_NAME"
  read -r -p 'Migration username [oclr_migrator]: ' migration_user || fail 'Run interactively to enter migration credentials.'
  migration_user=${migration_user:-oclr_migrator}
  read -r -s -p 'Migration password: ' migration_password || fail 'Run interactively to enter migration credentials.'
  printf '\n'
  [[ -n "$migration_password" ]] || fail 'A migration password is required.'
  migration_url=$(OCLR_PROMPT_USER="$migration_user" OCLR_PROMPT_PASSWORD="$migration_password" connection_info migration)
  unset migration_password migration_user
  export MIGRATION_DATABASE_URL="$migration_url"
  unset migration_url
  cd -- "$root/repository"
  if [[ "$action" == deploy ]]; then
    exec bash scripts/update.sh --ref "$sha" --apply --initial
  fi
  exec bash scripts/update.sh --ref "$sha" --apply
}

as_oclr() {
  # Separate PTY prevents the app account injecting input into the root terminal.
  runuser --pty -u oclr -- env -i HOME="$oclr_home" USER=oclr LOGNAME=oclr PATH="$PATH" \
    bash -c 'cd -- "$HOME"; exec "$@"' oclr-worker "$@" 8>&-
}

capture_oclr() {
  # Only noninteractive metadata uses capture; never buffer password prompts.
  local output code
  if output=$(as_oclr "$@"); then
    printf '%s' "${output//$'\r'/}"
  else
    code=$?
    printf '%s\n' "${output//$'\r'/}" >&2
    return "$code"
  fi
}

register_liru_bot() {
  local env_file=$1 release=$2
  [[ -f "$env_file" && ! -L "$env_file" ]] || fail 'Create a regular /etc/oclr/liru-bot.env first.'
  [[ -f "$release/scripts/liru-discord-bot.ts" ]] || fail 'Update OCLR to a release containing Liru Bot first.'
  [[ $(id -u oclr) =~ ^[1-9][0-9]*$ ]] || fail 'An existing unprivileged oclr account is required.'

  # Parse the config as data and give only registration settings to the app user.
  env -i PATH="$PATH" node --input-type=module - "$env_file" "$release" 3<&0 <<'NODE'
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [envFile, release] = process.argv.slice(2);
const settings = parseEnv(readFileSync(envFile, 'utf8'));
const { LIRU_DISCORD_APPLICATION_ID, LIRU_DISCORD_GUILD_ID } = settings;
if (!LIRU_DISCORD_APPLICATION_ID || !LIRU_DISCORD_GUILD_ID) {
  fail('Configure LIRU_DISCORD_APPLICATION_ID and LIRU_DISCORD_GUILD_ID in /etc/oclr/liru-bot.env first.');
}

let token = settings.LIRU_DISCORD_BOT_TOKEN;
if (!token?.trim()) {
  const readToken = `
    IFS= read -r -s -p 'Liru Discord Bot Token: ' token || exit 1
    printf '\\n' >&2
    printf '%s' "$token"
  `;
  const prompt = spawnSync('bash', ['-c', readToken], {
    stdio: [3, 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  if (prompt.status !== 0 || !prompt.stdout) fail('A Discord Bot Token is required.');
  token = prompt.stdout;
}

const args = ['--pty', '-u', 'oclr', '--', 'npm', 'run', 'bot:liru:register'];
const registration = spawnSync('runuser', args, {
  cwd: release,
  env: {
    PATH: process.env.PATH,
    LIRU_DISCORD_APPLICATION_ID,
    LIRU_DISCORD_GUILD_ID,
    LIRU_DISCORD_BOT_TOKEN: token,
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
if (registration.status === null) fail('Could not run Liru Bot registration.');
process.exitCode = registration.status;
NODE
}

configure_liru_service() {
  local bot_service_file="${service_file%/*}/oclr-liru-bot.service" unit
  # Retain existing local units, masks and explicit enable/disable choices.
  [[ ! -e "$bot_service_file" && ! -L "$bot_service_file" ]] || return 0
  unit=$(mktemp)
  cat > "$unit" <<'UNIT'
[Unit]
Description=OCLR Liru Discord Bot
Wants=network-online.target
After=network-online.target oclr.service
PartOf=oclr.service
ConditionPathExists=/etc/oclr/liru-bot.env
ConditionPathExists=/opt/oclr/current/scripts/liru-discord-bot.ts

[Service]
Type=exec
User=oclr
Group=oclr
WorkingDirectory=/opt/oclr/current
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=/etc/oclr/liru-bot.env
UnsetEnvironment=LIRU_DISCORD_BOT_TOKEN
ExecStart=/usr/bin/env node --import tsx scripts/liru-discord-bot.ts serve
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict

[Install]
WantedBy=oclr.service
UNIT
  install -o root -g root -m 0644 "$unit" "$bot_service_file"
  rm -f -- "$unit"
  # A failed enable can be retried by rerunning the installer.
  if ! systemctl enable oclr-liru-bot.service; then
    rm -f -- "$bot_service_file"
    fail 'Could not enable the Liru Bot systemd service.'
  fi
}

configure_service() {
  # Existing local units are preserved; the engine also checks User/WorkingDirectory.
  [[ ! -L "$service_file" && ! -L "$sudoers_file" ]] || fail 'Preserve and review custom linked service/sudo policy files before deployment.'
  if [[ ! -e "$service_file" ]]; then
    local unit
    unit=$(mktemp)
    cat > "$unit" <<'UNIT'
[Unit]
Description=OCLR website
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=oclr
Group=oclr
WorkingDirectory=/opt/oclr/current
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=/etc/oclr/runtime.env
ExecStart=/bin/bash /opt/oclr/current/scripts/production.sh start
Restart=on-failure
RestartSec=5
KillMode=mixed
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT
    install -o root -g root -m 0644 "$unit" "$service_file"
    rm -f -- "$unit"
    systemctl daemon-reload
  fi
  local policy
  policy=$(mktemp)
  printf '# Managed by OCLR scripts/oclr.sh\noclr ALL=(root) NOPASSWD: /usr/bin/systemctl stop oclr.service, /usr/bin/systemctl start oclr.service\n' > "$policy"
  if [[ -e "$sudoers_file" ]] && ! cmp -s "$policy" "$sudoers_file"; then
    rm -f -- "$policy"
    fail 'Existing OCLR sudo policy differs; preserve it and review before deployment.'
  fi
  if ! visudo -cf "$policy"; then rm -f -- "$policy"; fail 'Service sudo policy validation failed.'; fi
  install -o root -g root -m 0440 "$policy" "$sudoers_file"
  rm -f -- "$policy"
  configure_liru_service
}

# Install the trusted invocation, even when a subsequent deployment fails.
# /usr/local/bin is on the operator PATH; refresh the former /usr/sbin copy
# only when it already exists, so previously installed commands remain current.
install_command() {
  local snapshot=$1 command_file
  shift
  for command_file in "$@"; do
    [[ ! -L "${command_file%/*}" ]] || fail 'The command directory must not be a symlink.'
    if [[ -e "$command_file" || -L "$command_file" ]]; then
      [[ ! -L "$command_file" && -f "$command_file" ]] && grep -q '^# Rocky Linux 10 convenience entry point' "$command_file" || fail "An unrelated oclr command exists at $command_file; preserve it before installing this shortcut."
    fi
  done
  local first=true
  for command_file in "$@"; do
    if "$first" || [[ -e "$command_file" ]]; then
      [[ -d "${command_file%/*}" ]] || install -d -m 0755 "${command_file%/*}"
      install -o root -g root -m 0755 "$snapshot" "$command_file"
    fi
    first=false
  done
}

main() {
  if [[ ${1-} == bot ]]; then
    [[ $# == 2 && $2 == register && $EUID -eq 0 ]] || fail 'Usage: sudo oclr bot register'
    export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
    register_liru_bot /etc/oclr/liru-bot.env /opt/oclr/current
    return
  fi
  if [[ ${1-} == cleanup ]]; then
    shift
    [[ $EUID -eq 0 ]] || fail 'Run with sudo: sudo oclr cleanup [--dry-run|--apply] [--keep N]'
    # No provisioning, command installation, Git fetch or runtime.env reads.
    # App-owned cleanup code always runs unprivileged.
    export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
    [[ ! -L /run/oclr-deploy && ! -L /run/oclr-deploy/lock ]] || fail 'The root deployment lock must not be a symlink.'
    # /run may be empty after reboot. Do not create files during a preview;
    # the persistent application update lock is always required by the engine.
    if [[ -e /run/oclr-deploy/lock ]]; then
      [[ -f /run/oclr-deploy/lock ]] || fail 'The root deployment lock must be a regular file.'
      exec 8</run/oclr-deploy/lock
      flock -n 8 || fail 'Another OCLR deployment or cleanup is running.'
    fi
    local oclr_home
    oclr_home=$(getent passwd oclr | cut -d: -f6)
    [[ -n "$oclr_home" && $(id -u oclr) -ne 0 ]] || fail 'An existing unprivileged oclr account is required.'
    [[ -f /opt/oclr/repository/scripts/cleanup-releases.sh ]] || fail 'Update the operator checkout to a reviewed release containing cleanup-releases.sh first.'
    as_oclr bash /opt/oclr/repository/scripts/cleanup-releases.sh "$@"
    return
  fi
  if [[ ${1-} == --worker ]]; then
    [[ $# == 5 ]] || fail 'Invalid worker invocation.'
    worker "$2" "$3" "$4" "$5"
    return
  fi
  local action=${1-} option=${2-} sha server_major dump_version restore_version architecture working_tree origin
  [[ $# -ge 1 && $# -le 2 && ( "$action" == deploy || "$action" == update || "$action" == install-command ) && ( -z "$option" || "$option" == --dry-run ) ]] || fail 'Usage: sudo oclr deploy|update|install-command [--dry-run], cleanup [--dry-run|--apply] [--keep N], or bot register'
  if [[ "$option" == --dry-run ]]; then
    if [[ "$action" == install-command ]]; then
      printf '%s\n' 'Install command preview only; no commands or files changed.' 'Install this reviewed script as /usr/local/bin/oclr without changing the application, service or database.'
      return
    fi
    printf '%s\n' "$action preview only; no commands or files changed." \
      'Load /etc/oclr/runtime.env as oclr; preserve the existing database and Nginx.' \
      'Prepare the app account, dependencies, matching PostgreSQL clients and systemd permissions.' \
      'Install and enable the optional Liru Bot unit at first provisioning; start it with OCLR when configured.' \
      'Fetch main into /opt/oclr/repository and pin its SHA; prompt for migration username/password.' \
      'Build a new release, verify backup, apply pending migrations, activate and check local/public health.' \
      'Install the oclr command before deployment; retain backups and previous releases for recovery.'
    return
  fi
  [[ $EUID -eq 0 ]] || fail 'Run with sudo: sudo bash scripts/oclr.sh deploy (or update).'
  command -v dnf >/dev/null || fail 'This bootstrap targets Rocky Linux 10 with DNF/systemd.'
  export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
  # Keep the privileged entry point independent of the app-owned operator clone.
  # A future app update must not replace root-executed code or unit definitions.
  script_snapshot=$(mktemp)
  cat -- "${BASH_SOURCE[0]}" > "$script_snapshot"
  trap 'rm -f -- "$script_snapshot"' EXIT
  local missing=false name directory
  root=/opt/oclr
  env_file=/etc/oclr/runtime.env
  service_file=/etc/systemd/system/oclr.service
  sudoers_file=/etc/sudoers.d/oclr-site
  # Root's lock must not live in an app-writable directory (symlink/truncation risk).
  [[ ! -L /run/oclr-deploy ]] || fail 'The root deployment lock directory must not be a symlink.'
  install -d -o root -g root -m 0700 /run/oclr-deploy
  exec 8>/run/oclr-deploy/lock
  flock -n 8 || fail 'Another OCLR deployment is running.'
  install_command "$script_snapshot" /usr/local/bin/oclr /usr/sbin/oclr
  printf 'Command installed: /usr/local/bin/oclr (sudo oclr update)\n'
  [[ "$action" != install-command ]] || return 0
  for name in node npm git flock tar runuser visudo systemctl setfacl; do command -v "$name" >/dev/null || missing=true; done
  if "$missing"; then dnf install -y nodejs nodejs-npm git util-linux tar sudo acl; fi
  [[ -f "$env_file" && ! -L "$env_file" ]] || fail 'Create /etc/oclr/runtime.env first; see docs/deployment.md.'
  [[ ! -L /etc/oclr && ! -L "$root" ]] || fail 'Configuration/install parents must be real directories.'
  mkdir -p -- "$root"
  if ! id oclr >/dev/null 2>&1; then useradd --system --create-home --home-dir /var/lib/oclr --shell /bin/bash oclr; fi
  [[ $(id -u oclr) -ne 0 ]] || fail 'The application account must be unprivileged.'
  oclr_home=$(getent passwd oclr | cut -d: -f6)
  chown root:oclr /etc/oclr
  chmod 0750 /etc/oclr
  [[ -f "$env_file" && ! -L "$env_file" ]] || fail 'runtime.env must remain a regular file.'
  chown root:oclr "$env_file"
  chmod 0640 "$env_file"
  chown oclr:oclr "$root"
  chmod 0750 "$root"
  [[ ! -L /var/lib/oclr ]] || fail 'The application data directory must not be a symlink.'
  install -d -o oclr -g oclr -m 0750 /var/lib/oclr
  # Never perform root writes through app-controlled child paths.
  as_oclr mkdir -p -- "$root/releases" /var/lib/oclr/backups
  as_oclr chmod 0700 /var/lib/oclr/backups
  if [[ "$action" == deploy ]]; then
    [[ ! -e "$root/current" && ! -L "$root/current" ]] || fail 'OCLR is already installed. Run: sudo oclr update'
  else
    [[ -L "$root/current" ]] || fail 'No installed release found. Run deploy first.'
    systemctl is-active --quiet oclr.service || fail 'OCLR is stopped. Inspect the previous failure/recovery before updating.'
  fi
  if [[ ! -e "$root/repository" ]]; then
    as_oclr git clone https://github.com/PhoenixEmik/OCLR-website.git "$root/repository"
  fi
  [[ -d "$root/repository/.git" && ! -L "$root/repository" ]] || fail 'Expected a dedicated operator Git clone at /opt/oclr/repository.'
  working_tree=$(capture_oclr git -C "$root/repository" status --porcelain)
  [[ -z "$working_tree" ]] || fail 'The operator clone has changes. Preserve them before deploying.'
  origin=$(capture_oclr git -C "$root/repository" remote get-url origin)
  [[ "$origin" == https://github.com/PhoenixEmik/OCLR-website.git ]] || fail 'The operator clone origin does not match OCLR.'
  as_oclr git -C "$root/repository" fetch origin main
  sha=$(capture_oclr git -C "$root/repository" rev-parse origin/main)
  [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || fail 'Could not pin origin/main.'
  as_oclr git -C "$root/repository" checkout --detach "$sha"
  [[ -f "$root/repository/scripts/oclr.sh" ]] || fail 'The selected release lacks this deployment entry point.'

  for directory in /usr/pgsql-*/bin; do
    [[ ! -x "$directory/psql" ]] || export PATH="$directory:$PATH"
  done
  if ! command -v psql >/dev/null; then dnf install -y postgresql; fi
  server_major=$(capture_oclr bash "$root/repository/scripts/oclr.sh" --worker version "$root" "$env_file" -)
  [[ "$server_major" =~ ^[1-9][0-9]$ ]] || fail 'Could not determine a supported PostgreSQL server major version.'
  dump_version=$(pg_dump --version 2>/dev/null || true)
  restore_version=$(pg_restore --version 2>/dev/null || true)
  local dump_major=0 restore_major=0
  if [[ "$dump_version" =~ [[:space:]]([0-9]+)\. ]]; then dump_major=${BASH_REMATCH[1]}; fi
  if [[ "$restore_version" =~ [[:space:]]([0-9]+)\. ]]; then restore_major=${BASH_REMATCH[1]}; fi
  if (( dump_major < server_major || restore_major < dump_major )); then
    if [[ ! -x /usr/pgsql-$server_major/bin/pg_dump ]]; then
      architecture=$(uname -m)
      [[ "$architecture" == x86_64 || "$architecture" == aarch64 ]] || fail 'Install compatible PostgreSQL clients for this architecture before deploying.'
      if ! rpm -q pgdg-redhat-repo >/dev/null 2>&1; then
        dnf install -y "https://download.postgresql.org/pub/repos/yum/reporpms/EL-10-$architecture/pgdg-redhat-repo-latest.noarch.rpm"
      fi
      dnf install -y "postgresql$server_major"
    fi
    export PATH="/usr/pgsql-$server_major/bin:$PATH"
  fi
  configure_service
  as_oclr bash "$root/repository/scripts/oclr.sh" --worker "$action" "$root" "$env_file" "$sha"
  systemctl enable oclr.service
  printf '\nOCLR %s finished. Future updates: sudo oclr update\n' "$action"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
