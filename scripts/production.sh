#!/usr/bin/env bash
# Run as the unprivileged release/service user with explicitly exported settings.
# Do not enable xtrace: migration credentials must never appear in command logs.
set +x
set -Eeuo pipefail

fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ ${OCLR_DATA_SOURCE-database} == database ]] || fail "Production commands require the database data source; remote development is disabled."
usage='Usage: bash scripts/production.sh setup|prepare --apply|--dry-run | start [--dry-run]'
action=${1-}
option=${2-}
[[ $# -le 2 ]] || fail "$usage"
case "$action:$option" in
  setup:--dry-run|prepare:--dry-run|start:--dry-run) dry_run=true ;;
  setup:--apply|prepare:--apply|start:) dry_run=false ;;
  setup:) fail 'Setup changes the database. Verify the target, reviewed release and recoverable backup, then run: bash scripts/production.sh setup --apply' ;;
  *) fail "$usage" ;;
esac

# Bash builtins keep dry-run usable even without Node/npm or environment files.
root=$(cd -- "${BASH_SOURCE[0]%/*}/.." && pwd -P)
cd -- "$root"
export NODE_ENV=production
migration_url=${MIGRATION_DATABASE_URL-}
export -n migration_url
unset MIGRATION_DATABASE_URL
command_pid=''

stop() {
  local signal=$1 code=$2
  trap - INT TERM
  if [[ -n "$command_pid" ]]; then
    kill -s "$signal" "$command_pid" 2>/dev/null || true
    wait "$command_pid" 2>/dev/null || true
  fi
  exit "$code"
}
trap 'stop INT 130' INT
trap 'stop TERM 143' TERM
trap 'status=$?; printf "%s\n" "Production command failed; later steps were not run." >&2; exit "$status"' ERR

run() {
  local label=$1
  shift
  printf '> %s\n' "$label"
  if "$dry_run"; then return; fi
  "$@" &
  command_pid=$!
  wait "$command_pid"
  command_pid=''
}
migrate() {
  # Executed only in run's child shell. Other subprocesses retain runtime access.
  export DATABASE_URL="$migration_url"
  exec npm run db:migrate
}
preparation_command() {
  # Only check/build children inherit this budget, never the serving process.
  # Keep other Node flags private and preserve an operator's existing heap limit.
  if [[ -n "$build_heap_mb" ]]; then
    export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=$build_heap_mb"
  fi
  exec npm "$@"
}

port=${PORT:-3000}
host=${OCLR_BIND_HOST:-127.0.0.1}
if [[ "$action" == start ]]; then
  [[ "$port" =~ ^[1-9][0-9]*$ && ${#port} -le 5 ]] || fail 'PORT must be an integer from 1 to 65535.'
  (( port <= 65535 )) || fail 'PORT must be an integer from 1 to 65535.'
  [[ "$host" =~ ^[a-zA-Z0-9.:_][a-zA-Z0-9.:_-]*$ ]] || fail 'OCLR_BIND_HOST must be a host name or IP address.'
fi

if ! "$dry_run"; then
  command -v node >/dev/null || fail 'Install Node.js >=22.13 and npm first.'
  command -v npm >/dev/null || fail 'Install npm for the selected Node.js runtime.'
  node_version=$(node --version)
  [[ "$node_version" =~ ^v([0-9]+)\.([0-9]+)\. ]] || fail 'Cannot determine Node.js version.'
  (( BASH_REMATCH[1] > 22 || (BASH_REMATCH[1] == 22 && BASH_REMATCH[2] >= 13) )) || fail 'Use Node.js >=22.13 (Node.js 24 is the CI reference).'
  [[ -n ${DATABASE_URL-} && -n ${APP_URL-} ]] || fail 'Export DATABASE_URL and APP_URL before running production commands; no environment file is loaded automatically.'
  [[ "$APP_URL" == https://* ]] || fail 'Production APP_URL must use HTTPS.'
fi

if [[ "$action" == setup || "$action" == prepare ]]; then
  build_heap_mb=${OCLR_BUILD_HEAP_MB-}
  if [[ ${OCLR_BUILD_HEAP_MB+x} ]]; then
    [[ "$build_heap_mb" =~ ^[1-9][0-9]{0,4}$ ]] && (( build_heap_mb >= 128 && build_heap_mb <= 65536 )) || fail 'OCLR_BUILD_HEAP_MB must be an integer from 128 to 65536 (MiB).'
  elif [[ ! ${NODE_OPTIONS-} =~ --max[-_]old[-_]space[-_]size([=[:space:]]|[-_]percentage) ]]; then
    build_heap_mb=2048
  fi
  if [[ "$action" == setup ]] && ! "$dry_run"; then
    [[ -n "$migration_url" ]] || fail 'Setup requires MIGRATION_DATABASE_URL for this invocation only.'
  fi
  if [[ -n "$build_heap_mb" ]]; then
    printf 'Preparation Node heap budget: %s MiB per process (check/build only).\n' "$build_heap_mb"
  else
    printf '%s\n' 'Preparation uses the operator-configured Node heap budget.'
  fi
  run 'npm ci --include=dev' npm ci --include=dev
  if [[ "$action" == setup ]]; then
    run 'npm run db:migrate' migrate
  fi
  unset migration_url
  if [[ "$action" == setup ]]; then
    run 'npm run release:check' preparation_command run release:check
  else
    run 'npm run check' preparation_command run check
  fi
  run 'npm run build' preparation_command run build
  if "$dry_run"; then
    printf '%s\n' 'Preparation preview only; no commands executed.'
  else
    printf '%s\n' "$action complete. Start with bash scripts/production.sh start."
  fi
else
  unset migration_url
  if ! "$dry_run"; then
    [[ -f .next/BUILD_ID ]] || fail 'No production build found. Run production setup first.'
  fi
  run 'npm run release:check' npm run release:check
  printf '> node node_modules/next/dist/bin/next start --hostname %s --port %s\n' "$host" "$port"
  if ! "$dry_run"; then
    # Node becomes the service's main process and receives systemd signals directly.
    exec node node_modules/next/dist/bin/next start --hostname "$host" --port "$port"
  fi
fi
