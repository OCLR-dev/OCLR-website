# Admin backup operator (#369)

This service runs on the app host as a separate `oclr-backup` account. The
website connects through a mode-0660 Unix socket and never receives the
operator database credentials or encryption key. Every website request requires
a fresh global Admin check; edition Admin and Developer/remote reads are denied.
The socket also compares credential-free database identity hashes so a runtime
cannot accidentally submit work to an operator configured for another database.
Use the same canonical database host spelling and port in both configurations.
The worker rechecks the actor against the current database before doing work.

## Operator preparation

Installation and real restores require separately authorized operator work.
Use the first-installation procedure below for standard hosts; these are its
configuration and security prerequisites.
Install this reviewed source and its locked npm dependencies into
`/opt/oclr-backup`, owned by root and not writable by either service account.
Use Node >=22.13 (Node 24 LTS is preferred), PostgreSQL client tools matching
the remote server, and util-linux flock. The installer, service and media helper
use `/usr/bin/node`; an existing supported Node 22 installation can be retained.
Install with `npm ci --include=dev`; the separately installed operator uses tsx.
Provision a private mode-0700 `/var/lib/oclr-backup`, owned by `oclr-backup`.
Install the example systemd service with a root-owned mode-0600 environment file:

```
OCLR_OPERATOR_DATA=/var/lib/oclr-backup
OCLR_OPERATOR_SOCKET=/run/oclr-backup/operator.sock
OCLR_OPERATOR_LOCK=/opt/oclr/.update.lock
OCLR_OPERATOR_KEY=/etc/oclr-backup/package.key
OCLR_OPERATOR_DATABASE_URL=postgresql://OPERATOR@DB_HOST/DB_NAME?sslmode=disable
OCLR_OPERATOR_RUNTIME_ROLE=oclr_runtime
OCLR_OPERATOR_RESTORE_TEMPLATE=
OCLR_OPERATOR_RELEASE_FILE=/opt/oclr/current/.oclr-release
APP_URL=https://YOUR_OCLR_HOST
OCLR_BIND_HOST=127.0.0.1
PORT=3000
OCLR_OPERATOR_HEALTH_URL=http://127.0.0.1:3000/api/health
OCLR_ENVIRONMENT=production
OCLR_SERVICE=oclr.service
OCLR_OPERATOR_MEDIA_HELPER=/opt/oclr-backup/current/operator/media-fingerprint.mjs
OCLR_MEDIA_DIR=/var/lib/oclr/media
ADMIN_OSU_IDS=APPROVED_RECOVERY_ADMIN_IDS
```

Use the actual password privately in the operator-only configuration; never put
it in argv, source control, the website's environment or logs. Preserve the
approved internal transport choice or use `verify-full` and a trusted CA. The
operator role must own the existing application database and objects and have
CREATEDB; the runtime role must remain separate and unprivileged. Have the DBA
review this ownership and the absence of other application writers first.

Database ownership alone does not grant access to a migration ledger created
by a different role. In **the application database named in the operator URL**,
the DBA must also grant schema USAGE and ledger SELECT to the dedicated operator
database role. For the example `oclr_migrator` role and `oclr` database:

```sql
\connect oclr
GRANT USAGE ON SCHEMA drizzle TO oclr_migrator;
GRANT SELECT ON TABLE drizzle.__drizzle_migrations TO oclr_migrator;
```

Substitute the actual application database and dedicated PostgreSQL role, not
the Linux service user or the website runtime role. PostgreSQL schemas and
these grants are local to each database; a psql prompt of `postgres=#` normally
means the maintenance database, which does not contain the app ledger. Do not
create a substitute ledger there. Grants take effect on the next connection
without restarting either service. A privately changed operator URL requires
restarting only the operator when no job is active.

The worker preflights these exact ledger reads after actor authorization and
before stopping the website. Missing privileges fail in `database-preflight`
without calling service control. Subsequent private audit phases distinguish
`stopping-service`, `inventory`, `backup` and `archive-size`. Installing this worker change
requires the separately reviewed operator upgrade; a website-only update does
not replace the operator. Existing operators can use the DBA grants immediately.

Generate a private random **32-byte binary key**, readable only by the operator.
Keep an encrypted offline copy: loss of this key makes packages unrecoverable.
Only packages made with this installation's key are trusted. Do not accept a
foreign dump, SQL file, supplied key or unverified migration/application version.

Pre-provision the updater's existing lock file as group `oclr`, mode 0660, without
replacing a held lock inode. Both operator and updater must have access to the
same inode. The operator account needs exactly these sudoers commands:

```
oclr-backup ALL=(root) NOPASSWD: /usr/bin/systemctl stop oclr.service, /usr/bin/systemctl start oclr.service
oclr-backup ALL=(oclr) NOPASSWD: /usr/bin/node /opt/oclr-backup/current/operator/media-fingerprint.mjs /var/lib/oclr/media
```

It must not receive arbitrary sudo or permission to modify the target service.
The website needs only `OCLR_OPERATOR_SOCKET`; its account must have socket group
access. Keep the parent directory operator-owned and inaccessible to other users.
Use the fixed root-owned helper to fingerprint private media as the website
account; retain mode-0600 files instead of granting broad file access. Adapt SELinux policy while
keeping enforcement enabled. Set the proxy's upload limit to 65 MiB for this
route only; retain authentication, HTTPS, request timeouts and no shared caching.

## Format and scope

Format 1 is an AES-256-GCM authenticated encrypted envelope containing a
PostgreSQL custom archive and authenticated metadata: UTC creation time, source,
exact release, schema migration hash, PostgreSQL major, row counts, SHA-256 and
media-tree fingerprint. The custom dump includes all database schemas and
application tables, identities, private answers, publication state, grants,
audit history and the Drizzle ledger. Database passwords, host configuration,
runtime.env and OAuth client secrets are not exported. Cluster roles and grants
are operator configuration; database ACLs and ownership are deliberately omitted.

**Media bytes are not included.** Preserve the corresponding durable media tree
separately. Restore refuses if its exact filenames/content fingerprint differs.
A database package alone is not a complete website disaster-recovery backup.

The compressed PostgreSQL custom dump may contain up to 64 MiB. The transport
also allows space for the authenticated header and encryption overhead. Database
files can occupy much more disk space because of indexes, empty pages and
compressible data. The worker bounds pg_dump output during export. If it exceeds
the limit, the private audit records `archive-size`, the worker attempts to
restart the original website and the job produces no downloadable package.
The operator allows 20 jobs and requires at least 256 MiB of free package disk space. Each
external command has a five-minute timeout. Completed/imported/failed packages
expire after seven days when another job is submitted; no cleanup runs during
active work. Operators must monitor disk space and PostgreSQL capacity for a
second full database plus the retained original. Interrupted plaintext scratch
files require operator cleanup with the service stopped. Never expose this data
root through Nginx, static assets, browser caches or generic logs.

## Restore and recovery

The Admin uploads and validates a package, reviews its source/time/release and
explicitly types REPLACE. Submission returns a persisted job ID. The worker
acquires the **same flock as update/cleanup**, stops the app, takes a verified
current backup, and restores into a new isolated database. It checks migration
history and all table row counts before touching the active database name.
Restore clears sessions, OAuth states and Developer tokens and revokes all
snapshot staff grants; the operator-configured recovery Admin can sign in and
regrant roles after review. Competition/publication data stays as saved.

### Prepare a pgvector restore template

If the OCLR database has pgvector enabled, have the DBA create a dedicated
[database template](https://www.postgresql.org/docs/17/manage-ag-templatedbs.html)
on the same PostgreSQL server. Use the existing backup operator database role
as its owner. In this example the role is `oclr_migrator`. Run these commands
as the DBA from a maintenance connection:

```sql
CREATE DATABASE oclr_restore_template WITH OWNER oclr_migrator TEMPLATE template0;
REVOKE CONNECT ON DATABASE oclr_restore_template FROM PUBLIC;
\connect oclr_restore_template
CREATE EXTENSION vector WITH SCHEMA public;
```

Use the same pgvector version and extension schema as the OCLR database.
The template contains pgvector and starts empty of application objects and data.
Keep it free of active sessions during a restore. Set
`OCLR_OPERATOR_RESTORE_TEMPLATE=oclr_restore_template` in the private operator
environment and update the [separate operator release](#updating-the-backup-worker-on-an-existing-rocky-installation-1316).
Use the existing role with `CREATEDB` and retain the current website runtime
role. The DBA owns the extension. During the data restore, `pg_restore` skips
SQL object comments so it can use that preinstalled extension.

For a database with pgvector, the worker checks the template before stopping
the website. A failed check records `restore-template` in the private audit
and preserves the active database and service. Exports and import validation
can continue while the template is being prepared. A database without pgvector
continues to use `template0` as its restore source.

### Restore cutover

Database renames happen in one PostgreSQL transaction while the service is
stopped. The original database is retained under a job-specific `_p_` name. The
worker starts the service and verifies exact-release local health. Any failure
after switching keeps the app stopped for deliberate operator recovery. Failed
jobs disclose only a generic state and a recovery classification; diagnostics
and the append-only actor/job audit live outside the restored database.

A failure before switching preserves the original database and attempts to
restart it. Uncertain/interrupted work blocks new jobs until the operator checks
the service, active database and retained candidate/original and updates the
private job recovery record. Never automatically drop recovery databases or
restore over an active database. Audit records survive package expiry and old
snapshot restoration. Back them up separately with restricted access.

When a restore fails with `original-preserved` (including a denied deployment
lock), the Admin may confirm the same validated upload again with REPLACE. This
queues a new job and retains the failed attempt and its audit history. Existing
active or completed restores of that upload remain deduplicated; a failure with
`operator-required` still blocks new jobs pending operator recovery. This retry
fix requires a separately reviewed operator upgrade; updating only the website
does not replace the daemon.

## First installation after a website-only update

A normal `sudo oclr update` installs the application; it does **not** create the
separate privileged backup operator. If only the website was updated, the backup
page cannot create jobs until this one-time provisioning is complete.

From a clean, separately reviewed installer checkout (not the serving application
or operator directory), fetch canonical main and select the reviewed full SHA:

```sh
sudo bash scripts/install-backup-operator.sh --ref FULL_REVIEWED_SHA --dry-run
sudo bash scripts/install-backup-operator.sh --ref FULL_REVIEWED_SHA --apply
```

If more than one client version is installed, explicitly select the existing
matching client directory, for example `sudo OCLR_PG_BIN=/usr/pgsql-17/bin bash
scripts/install-backup-operator.sh --ref FULL_REVIEWED_SHA --apply` for a reviewed
PostgreSQL 17 client. The installer records this path in the unit, so PGDG tools
are available to systemd. It does not install a replacement database server.
Install the Rocky `acl` package (`sudo dnf install acl`) before provisioning;
the installer requires `setfacl` for the separate operator's release-marker access.

The explicit installer provisions the separate account, a private random package
key, an example configuration, root-owned source/dependencies, shared lock access,
unit and narrow sudoers. It keeps control files root-owned throughout provisioning. npm runs as the
backup account in a separate dependency staging tree with lifecycle scripts
disabled; only node_modules is copied into the immutable release. It preserves existing
keys/configuration and refuses existing service/sudoers installations. It does
not read runtime.env, create database roles, start the operator or restart the
website. Review the output before proceeding.

1. Have the DBA provision/review the operator database identity and required
   ownership/CREATEDB permission. Fill `/etc/oclr-backup/operator.env` privately;
   do not send its contents, passwords or package key to chat or logs.
2. Use `OCLR_OPERATOR_RELEASE_FILE=/opt/oclr/current/.oclr-release` in place of a
   hard-coded `OCLR_OPERATOR_RELEASE`. Each job reads the current release marker
   under the shared update lock, so a routine website update does not leave a
   stale backup release or fail the exact-release health check.
   The installer grants the backup UID execute-only ACLs on `/opt/oclr`,
   `releases` and the current release directory, plus a read-only ACL on the
   marker. The updater repeats this for each new release before maintenance,
   including same-SHA retries. These are individual access ACLs, never recursive
   or default ACLs; private release files, media and credentials stay private.
3. Add `OCLR_OPERATOR_SOCKET=/run/oclr-backup/operator.sock` to the website's
   existing private runtime configuration. Both database URLs must identify the
   same canonical host/port/name; the credentials remain separate. Set the
   operator `APP_URL` to the website's public HTTPS origin as well; local health
   requests send its canonical Host header rather than triggering a redirect.
4. Review SELinux policy and back up the package key. The installer grants only
   a fixed root-owned media fingerprint helper, running as `oclr`, so the backup
   account can hash mode-0600 media without receiving raw media access, a shell
   or broader sudo privileges. The default helper path/media root in the example
   configuration must match the fixed sudoers entry; review both explicitly for
   a nonstandard media root.
5. Explicitly enable the operator with
   `sudo systemctl enable --now oclr-backup.service`. Restart the website in an
   approved maintenance window so it loads the socket setting.
6. Check only service state with `sudo systemctl is-active oclr-backup.service`,
   then open `/admin/backups`. Do not paste environment files or general journal
   output into chat; diagnostics can contain private operator information.

The page now distinguishes missing runtime configuration, an unreachable socket
and an operator-rejected connection. Actions remain disabled until the job list
can be read successfully. A missing-configuration message means step 3 has not
reached the running website process. An unreachable message means the daemon,
socket permissions or SELinux need inspection. A rejected-connection message
requires checking the matching database target and operator configuration.

Routine website updates may follow the current release marker, but changes to
the backup/authentication/schema contract still require a separately reviewed
operator upgrade; do not assume an older operator understands a new credential
family. The first-install script intentionally refuses to overwrite an existing
operator installation.

### Updating the backup worker on an existing Rocky installation (#1316)

The website and the operator have separate releases. An operator based on
`332f6ce7` reports the stop command, database inventory and physical size
check under the same `stopping-service` audit phase. Check the database name
and `current_user` on the **operator** connection before changing grants.
`OCLR_OPERATOR_DATABASE_URL` supplies that login. `OCLR_OPERATOR_RUNTIME_ROLE`
names the website role that receives application grants after a restore.
Verify the ledger query above using the operator login in the application database.

For the worker-only fix, the standard Rocky installation can bind the reviewed
worker file read-only into the backup service. This preserves its installed
dependencies, service account, sudo policy, package key and old release files.
Use the commands below from a **clean, trusted installer checkout** after fetching
canonical main. Run in Bash as the maintainer who owns that checkout and has sudo.
Use the full commit containing the reviewed fix. The checks below require the
installed worker and its local imports to match the supported source. If a check
fails, review the installed operator as a separate release upgrade.

The command below installs the first worker drop-in. To update an existing
reviewed drop-in, verify its current bind path and worker against the previous
reviewed commit. Preserve a copy of that drop-in and switch only its worker
path under the same update lock. Use the saved drop-in if activation fails.

```bash
(
  set -euo pipefail
  read -rp 'Full reviewed fix commit: ' fix
  [[ $fix =~ ^[0-9a-f]{40}$ ]]
  git merge-base --is-ancestor "$fix" origin/main
  run=$(systemctl show oclr-backup.service -p WorkingDirectory --value)
  [[ $run =~ ^/opt/oclr-backup/releases/([0-9a-f]{40})$ ]]
  base=${BASH_REMATCH[1]}
  git merge-base --is-ancestor "$base" "$fix"
  for file in worker health package; do
    git show "$base:operator/$file.ts" | cmp - "$run/operator/$file.ts"
  done
  git diff --quiet "$base" "$fix" -- operator/health.ts operator/package.ts
  work=$(mktemp -d)
  trap 'rm -rf -- "$work"' EXIT
  git show "$fix:operator/worker.ts" > "$work/worker.ts"
  grep -Fq 'phase = "archive-size"' "$work/worker.ts"
  patch=/etc/oclr-backup/worker-$fix.ts
  dropin=/etc/systemd/system/oclr-backup.service.d/40-backup-worker.conf
  sudo test ! -e "$dropin"
  sudo install -o root -g root -m 0644 "$work/worker.ts" "$patch"
  printf '[Service]\nBindReadOnlyPaths=%s:%s/operator/worker.ts\n' "$patch" "$run" > "$work/dropin"
  sudo install -d -o root -g root -m 0755 /etc/systemd/system/oclr-backup.service.d
  sudo flock -n /opt/oclr/.update.lock /bin/bash -ec '
    install -o root -g root -m 0644 "$1" "$2"
    systemctl daemon-reload
    systemctl restart oclr-backup.service
    systemctl is-active --quiet oclr-backup.service
  ' bash "$work/dropin" "$dropin"
)
```

Schedule this when the operator is idle. Lock contention aborts activation.
If the backup service cannot start, remove only this drop-in, reload systemd
and start the previous backup service during the same approved maintenance
window. Remove the drop-in when installing a full operator upgrade. In the
Admin page, verify a new backup completes and downloads during a maintenance
window. The backup itself briefly stops the website. Validate any restore
rehearsal on a disposable database with its matching media.

### Repair an existing unreadable release marker

If `sudo -u oclr-backup test -r /opt/oclr/current/.oclr-release` fails and the
current release was created with private owner-only permissions, install `acl`
and grant only the following access on the standard installation. Run with no
update/backup in progress; these commands do not restart either service:

```sh
sudo dnf install -y acl
sudo setfacl -m u:oclr-backup:--x /opt/oclr /opt/oclr/releases
sudo setfacl -m u:oclr-backup:--x "$(readlink -f /opt/oclr/current)"
sudo setfacl -m u:oclr-backup:r-- /opt/oclr/current/.oclr-release
sudo -u oclr-backup test -r /opt/oclr/current/.oclr-release && echo RELEASE_READABLE
```

Do not recursively chmod/chown the release or regenerate the package key. Use
the corrected updater from a reviewed checkout on the next website update;
merely changing the selected application SHA does not update an older updater
script. Existing operator code/configuration need no replacement for this fix.
After `RELEASE_READABLE`, retry backup from the Admin page in a maintenance
window (backup temporarily stops the website). This repairs marker access;
database/tool/health checks still have to pass independently.

## Health target for a private app listener

Copy the app's actual `OCLR_BIND_HOST` and `PORT` into operator.env. For a
loopback app listener, keep the loopback health URL. If Next listens only on a
private IPv4 address, use that exact address in all three values, for example:

```ini
OCLR_BIND_HOST=10.20.0.5
PORT=3000
OCLR_OPERATOR_HEALTH_URL=http://10.20.0.5:3000/api/health
```

The address must be assigned to an interface on the application host, match the
explicit bind value and use the configured app port. Other private hosts, public
addresses, wildcard targets, credentials, query strings and non-health paths are
rejected before service maintenance. Do not change the website to 0.0.0.0 merely
to make this check work. `APP_URL` remains the public HTTPS origin and supplies
the canonical Host header. Write literal values in EnvironmentFile; do not use
`$VAR` substitutions.
