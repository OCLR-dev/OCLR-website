#!/usr/bin/env bash
# Sourced by the installer while holding the website update lock.
switch_backup_operator_release() (
  release=$1 current=$2 unit=$3 legacy_dropin=$4
  service=oclr-backup.service active=false activating=false
  work=$(mktemp -d "${current%/*}/.switch-XXXXXXXX") || exit 1
  unit_work=''
  finish_switch() {
    local status=$? rollback_ok=true
    trap - EXIT
    trap '' HUP INT TERM
    if "$activating"; then
      printf '%s\n' 'Backup operator activation failed. Restoring the previous release.' >&2
      if "$active"; then systemctl stop "$service" || rollback_ok=false; fi
      mv -Tf -- "$work/current.previous" "$current" || rollback_ok=false
      mv -Tf -- "$unit_work/previous" "$unit" || rollback_ok=false
      if [[ -n "$legacy_dropin" ]]; then
        mv -Tf -- "$unit_work/legacy" "$legacy_dropin" || rollback_ok=false
      fi
      systemctl daemon-reload || rollback_ok=false
      if "$active" && "$rollback_ok"; then
        { systemctl start "$service" && wait_for_operator; } || rollback_ok=false
      fi
    fi
    if ! "$rollback_ok"; then
      printf 'Operator rollback needs review. Saved activation files are in %s and %s.\n' "$work" "$unit_work" >&2
      exit 2
    fi
    rm -rf -- "$work"
    [[ -z "$unit_work" ]] || rm -rf -- "$unit_work"
    exit "$status"
  }
  trap finish_switch EXIT
  trap 'exit 1' HUP INT TERM
  unit_work=$(mktemp -d "${unit%/*}/.oclr-backup-XXXXXXXX") || exit 1
  cp -P -- "$current" "$work/current.previous" || exit 1
  ln -s -- "$release" "$work/current.next" || exit 1
  cp -p -- "$unit" "$unit_work/previous" || exit 1
  cp -p -- "$unit" "$unit_work/next" || exit 1
  sed "s|^WorkingDirectory=.*|WorkingDirectory=$current|" "$unit" > "$unit_work/next" || exit 1
  if [[ -n "$legacy_dropin" ]]; then
    cp -p -- "$legacy_dropin" "$unit_work/legacy" || exit 1
  fi
  if systemctl is-active --quiet "$service"; then active=true; fi
  socket=''
  if "$active" && [[ -S /run/oclr-backup/operator.sock ]]; then
    socket=/run/oclr-backup/operator.sock
  fi

  wait_for_operator() {
    local attempt=0
    while (( attempt < 10 )); do
      systemctl is-active --quiet "$service" || return 1
      [[ -z "$socket" || -S "$socket" ]] && return 0
      sleep 1
      attempt=$((attempt + 1))
    done
    return 1
  }

  activating=true
  if { ! "$active" || systemctl stop "$service"; } &&
     mv -Tf -- "$work/current.next" "$current" &&
     mv -Tf -- "$unit_work/next" "$unit" &&
     { [[ -z "$legacy_dropin" ]] || rm -- "$legacy_dropin"; } &&
     systemctl daemon-reload &&
     [[ $(systemctl show -p WorkingDirectory --value "$service") == "$current" ]] &&
     { ! "$active" || { systemctl start "$service" && wait_for_operator; }; }; then
    activating=false
    exit 0
  fi
  exit 1
)
