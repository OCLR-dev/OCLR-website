# Deployment and operations

The deployment target is a Rocky Linux 10 Node.js application host, an existing separate PostgreSQL server and an existing separate Nginx proxy. CI verifies Node.js 24 and PostgreSQL 17; the actual external database version, permissions and networking must be rehearsed before launch. No deployment, domain, DNS or OAuth application has been provisioned by this repository. The local isolated tests are not a production launch.

## Recorded release evidence — 2026-10-23

The organizer confirmed the real multi-account captain/staff draft rehearsal passed, in response to the checklist covering captain-direct/staff-on-behalf picks, concurrent conflicts, pause/reconnect and spectator/OBS synchronization. Earlier organizer confirmations cover live OAuth/API access, Rocky/Nginx HTTPS deploy/update, two persisted staging upgrades (one with a migration), backup restore and the designated privacy contact. These are organizer attestations, not production checks performed by the coding agent.

This satisfies the previously outstanding external rehearsal gate in #10. Historical local-only test notes below retain their limited scope; they do not supersede the organizer's later confirmations. Every subsequent release still needs its own normal backup, migration, health and CI checks. A pending CI run is not a pass. The development-tool maintenance review due 2026-11-05 remains scheduled independently of this completed rehearsal.

## Simple deployment and update

Prepare `/etc/oclr/runtime.env` once using the configuration below. Keep your existing PostgreSQL accounts/database and configure the existing Nginx HTTPS upstream to the Rocky app's private IP/port first. In the environment file, `OCLR_BIND_HOST` is that **app private IP**, `APP_URL` is the public HTTPS origin, and the chosen internal database URL may use `sslmode=disable`. Approved OAuth/Admin/privacy settings are still required. The script never creates a database or configures the separate Nginx/DNS/certificates.

Run from a normal sudo-capable operator session on Rocky Linux 10. If you need a new installer checkout (do not modify the release currently serving users):

```sh
sudo dnf install -y git
git clone https://github.com/PhoenixEmik/OCLR-website.git oclr-installer
cd oclr-installer
sudo bash scripts/oclr.sh deploy
```

If OCLR was already installed using the earlier manual instructions, use `sudo bash scripts/oclr.sh update` instead of `deploy`. The installer adds `/usr/local/bin/oclr` before deployment begins, even if a later check fails. Subsequent whole-site updates are simply:

```sh
sudo oclr update
```

To repair a missing command without deploying, starting/stopping the service or touching the database, run the reviewed new installer:

```sh
sudo bash scripts/oclr.sh install-command
command -v oclr
```

Use `sudo /usr/local/bin/oclr update` if your operator/sudo PATH omits `/usr/local/bin`. Any previously managed `/usr/sbin/oclr` copy is refreshed too; unrelated commands are preserved and rejected. A stopped installation must still be inspected/recovered before an update.

The command reads `runtime.env` automatically as the unprivileged app user, prints the pinned release SHA and database target, then asks for the migration username (Enter defaults to `oclr_migrator`) and password. Type the **normal password**; it is hidden and escaped internally. There is no manual connection-URL construction, host/name export, sudoers editing or symlink switching for the operator. Runtime configuration stays outside releases and is never rewritten. Use a reviewed `main` release with passing CI; each invocation fetches `origin/main`, resolves a full SHA and deploys that exact tree. An existing dirty operator clone is preserved and rejected.

On first deployment it prepares the `oclr` Unix account/directories, Node/npm/Git/utilities and systemd service. It queries PostgreSQL's version with the runtime identity and selects compatible existing `pg_dump`/`pg_restore` clients; when needed, it installs **client packages only** from Rocky/the [official PostgreSQL Yum repository](https://www.postgresql.org/download/linux/redhat/). This may add the PGDG repository. No PostgreSQL server is installed, initialized or restarted. Package repositories/network access and sudo privileges are prerequisites.

Root handles packages and service configuration only. It does not source `runtime.env` or run npm/migrations. Those run as `oclr` through the existing engine: separate release build → target/history checks → verified private backup → pending migrations → runtime preflight → service activation → exact-release local/public HTTPS health. First installation uses the same pipeline with `--initial`, requires no existing current/previous release, and leaves the service stopped on a maintenance-stage failure. Existing installations retain the previous release. The service gets no migration credentials; none are saved to disk by the prompt. Private backups/logs remain under `/var/lib/oclr/backups`; apply your backup retention/encryption policy.

The root-owned shortcut and fixed service definition come from the trusted installer invocation, not the app-writable checkout. Ordinary site updates do not silently replace privileged bootstrap code. To upgrade that bootstrap itself, review a new installer checkout and explicitly invoke it with sudo. Existing local service units are retained, and conflicting managed sudo policies are preserved/rejected. Nonstandard paths/services can continue using the advanced commands below.

Preview either action safely with `sudo bash scripts/oclr.sh deploy --dry-run` or `sudo oclr update --dry-run`; previews perform no configuration reads, downloads or writes. `deploy` refuses to overwrite an installed release. `update` refuses to restart a stopped installation from an uncertain previous failure. On errors, read the reported private log and follow [recovery](#routine-whole-site-updates); no automatic database restore/down migration is attempted. Local simulated service tests and isolated DB fixtures do not verify your real Rocky host, package installation, TLS/proxy, OAuth or organizer rehearsal. #10 remains open until those release gates are met.

## Clean up old release instances

After a successful update, run cleanup separately when disk space needs reclaiming:

```bash
sudo oclr cleanup                         # preview only (default)
sudo oclr cleanup --apply                 # delete eligible old releases
sudo oclr cleanup --keep 5 --dry-run       # preview a different retention count
sudo oclr cleanup --keep 5 --apply
```

For installations with an older root-owned shortcut, review this installer version and run `sudo bash scripts/oclr.sh install-command` from the trusted installer checkout first. The operator checkout at `/opt/oclr/repository` must also contain this release's cleanup scripts (normally obtained by `sudo oclr update`). Cleanup itself never fetches code or updates the application.

The default keeps the newest **3 managed release directories by their UTC timestamped names**, plus the `current` and optional `previous` targets even if those are older. `--keep N` accepts 2–9999; protected targets can make the retained total larger than N. Only direct, real directories with the updater's timestamp/SHA/random name and a matching regular `.oclr-release` marker are eligible. Unknown entries, symlinks, missing/invalid markers and legacy manual releases are preserved and reported. Incomplete builds with a valid marker may be eligible after recovery; keep any needed diagnostic files before applying cleanup. Existing private backup/log directories are retained.

Cleanup runs as `oclr`, uses the same `.update.lock` as the updater and refuses concurrent updates/cleanup, stopped services, mismatched service account/working directory, unsafe release links or nested filesystems. A preview reads installation/service metadata but creates or deletes no files. Neither mode reads `runtime.env`, requests migration credentials, changes systemd state, deletes database/media backups, touches durable upload storage nor removes accounts/services. Cleanup is never automatic during deployment or recovery. Removing an old directory does not establish that the retained previous release is compatible with the current database; follow the recovery procedure before switching releases.

Advanced installations can run `OCLR_INSTALL_DIR=/absolute/install OCLR_SERVICE=your.service npm run production:cleanup -- --dry-run` as the configured deployment account, then repeat with `--apply`. Use an installation previously managed by `update.sh`, with its existing lock file. Never run the cleanup engine as root.

## Required configuration

See `.env.example`. All variables are server-only; never add a `NEXT_PUBLIC_` prefix to credentials, database URLs or the bootstrap Admin IDs.

| Variable                             | Purpose                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                            | Confirmed canonical origin, HTTPS in staging/production, no path or credentials                                                       |
| `DATABASE_URL`                       | PostgreSQL connection; explicitly select internal plaintext or verified TLS, with separate least-privilege runtime/migration roles    |
| `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET` | Organizer-owned OAuth application, exact callback `APP_URL/auth/osu/callback`                                                         |
| `ADMIN_OSU_IDS`                      | Explicitly verified bootstrap global Admin IDs; legacy STAFF_OSU_IDS grants no access. Persistent grants are managed at /admin/staff  |
| `PRIVACY_CONTACT_OSU_ID`             | Explicit single approved public osu! Admin ID (positive safe integer)                                                                 |
| `OCLR_BRACKETS_FILE`                 | Optional absolute path to legacy bracket JSON (ignored for editions with DB fixtures); default is bundled `src/content/brackets.json` |
| `OCLR_ANNOUNCEMENTS_FILE`            | Optional absolute path to approved announcement JSON; default is bundled `src/content/announcements.json`                             |
| `PORT`                               | Optional listening port (Next.js default 3000)                                                                                        |
| `TEST_DATABASE_URL`                  | Isolated destructive-test database with a separate `test` name segment, e.g. `oclr_test`; never set it on production                  |

Next.js reads `.env.local` for local development. Production shell commands expect exported environment variables or a secret manager injecting them. Do not place real secrets in command history, checked-in compose files or CI logs. A secret manager is preferred in production.

## Tournament configuration cutover

Migration `0013` extends the existing `edition_state` anchor rather than replacing its foreign keys. Configuration revisions are separate from draft/setup versions. The migration preserves S11 as unpublished, with no registration/rules/eligibility/dates and its approved local artwork. Existing registration rules-version strings, answers, captains, teams, picks, pools, fixtures and results remain untouched. Historical applications are not assigned invented acknowledgment snapshots; new applications reference an immutable saved configuration revision.

For a fresh installation, run committed migrations before starting the app; S11 is the only prepared edition. An installation without a database shows no public editions. There is no JSON fallback or per-start seeding. Configured database failures remain errors rather than loading stale file content.

For an upgrade, stop mutations and back up the target database before migrating. If the old installation used an external `OCLR_EDITIONS_FILE`, preserve that approved file securely, apply migrations, then run `npm run db:import-editions -- /absolute/path/approved-legacy.json`. The import is transactional and idempotent: identical imported content is a no-op, unknown existing anchors receive their supplied configuration, and differing configured DB content is rejected. To replace the untouched bundled S11 bootstrap once, explicitly add `--replace-bootstrap-s11`; this is accepted only for the exact revision-zero bootstrap and never overwrites a newer Admin revision. S11 stays private and imported registration windows are paused for deliberate review. Missing legacy content is left unconfigured, never fabricated; `release:check` blocks release until those anchors are imported. Intentionally deleted unused drafts also retain a NULL configuration, but a matching `tournament_delete_draft` audit event for the current revision identifies these as reserved slug tombstones. They are excluded from this legacy-import gate without restoring or deleting them. Missing, stale or incomplete deletion evidence still blocks release. Do not run the legacy importer to repair an already deleted draft. Remove the obsolete environment variable after cutover.

Verify the Admin list and each existing edition's identity, rules, links and publication before restoring traffic. Publish approved information deliberately and enable registration separately. Global Admins can create editions; scoped Admins can edit only their assigned editions. Mappooler and Referee assignments grant operational tools without general settings access. Existing URLs and stable slugs remain valid.

Before any post-cutover writes, rollback may restore the verified pre-migration backup with its matching old application release. After new writes, preserve the database and roll back only to a compatible DB-aware application release; do not drop new columns/tables, restore an old backup over new registrations, or resume a stale JSON writer. Review prior configuration snapshots in the private audit history and apply a forward correction with a new revision/rules version. Competition locks remain enforced; configuration rollback must not rewrite draft or result history.

Migration `0014` makes registration rule versions nullable and adds a nullable eligibility acknowledgment. Existing values are preserved and the new column is left null for historical applications; no consent is backfilled. After collecting no-rules applications, roll back only to a release supporting these nullable fields. Do not restore the old NOT NULL constraint or substitute invented versions.

## Deploy a reviewed commit

1. Provision a separate staging database and organizer-owned osu! app. Confirm the actual hostname and HTTPS certificate. Do not infer a domain from the project name.
2. Install from the lockfile with `npm ci`. Keep build dependencies available in the build/release stage.
3. Run `npm run check`, isolated `npm test`, `npm run build` and database-backed `npm run test:e2e` as in CI. CI never uses production credentials/data.
4. For routine releases use [the Bash update command](#routine-whole-site-updates), which reviews the committed/applied journal, backs up and applies pending SQL once before activation. For first install use the Rocky setup steps below. Do not run migrations from application startup or every instance. This release requires migrations through `0017`: `0012` makes routine audit explanations nullable and adds staff-role before/after state; `0013` adds canonical tournament configuration and registration revision references; `0014` supports optional Rules/Eligibility consent; `0015` adds referee assignment revisions; `0016` permits planned fixture participants; `0017` adds private-by-default staff About visibility. The Drizzle configuration loads Next.js environment files (development by default; set `NODE_ENV=production` for production files); an explicitly supplied `DATABASE_URL` takes precedence. Confirm the target before applying migrations. Historical records remain intact; release preflight checks the new columns and missing legacy configuration. Follow the tournament configuration cutover above before restoring traffic. Do not use `drizzle-kit push` in production. Migrations are tracked in the database; repeated migration runs are safe. Coordinate a single release process.
5. Configure approved edition content, privacy/contact policy and verified staff IDs. Run `npm run release:check` using the target environment. This checks configuration and database reachability, not live OAuth consent or deployment.
6. Start `npm start -- --hostname 127.0.0.1` under a supervised process manager. Keep the checkout, `.next`, `public`, runtime dependencies and mounted content available. Build as a separate release directory and switch traffic only when healthy. Full installation is the simplest supported deployment; standalone output is not configured.
7. Put a trusted HTTPS reverse proxy in front. Preserve the canonical **Host** header, reject unexpected hosts at ingress, redirect HTTP to HTTPS and avoid caching authenticated HTML/API responses. Do not expose the Node port directly. Canonical GET/HEAD redirects use `APP_URL`; per-request script nonces, frame restrictions, MIME protection and HTTPS HSTS are emitted by the app.
8. Rate-limit login/callback, metadata/import and mutation routes at ingress. Limit JSON bodies to 32 KiB, except the per-fixture `/results` review and `/api/admin/tournaments/[edition]` settings POSTs, which accept at most 512 KiB for explicit game decisions and structured rules respectively. Redact callback query strings and never log cookies, tokens, Authorization headers or private answer bodies. Rate-limit the minimal public readiness endpoint; restrict database administration to operators.
9. Verify staging with two real osu! accounts: authorize, decline, retry, sign out, expired session, own-data isolation, individual submission, duplicate prevention, permitted withdrawal, staff review and CSV. Check privacy/contact links, keyboard/mobile navigation, approved rules/timezone and a failed database response. Record results in #5/#10.
10. Only after those checks, configure the production environment independently, apply reviewed migrations and verify the actual deployed URL. A passing local build is not evidence of a successful deployment. Keep registration unpublished/closed until the organizer authorizes collection.

## Privacy contact setup

Set `PRIVACY_CONTACT_OSU_ID` to one explicitly approved Admin's positive numeric osu! user ID in private `.env.local` (or the hosting secret/environment configuration). Do not use a comma-separated list, derive the first `ADMIN_OSU_IDS` entry, or publish other bootstrap IDs. About and Privacy share the canonical `https://osu.ppy.sh/users/{id}` contact; no direct-message URL is invented. The public link does not grant any staff permissions.

Verify the designated account is a global Admin, either explicitly provisioned through `ADMIN_OSU_IDS` or an active persistent global Admin grant. `release:check` checks this against the configured allowlist/database; ordinary privacy readiness validates the single ID without exposing or querying role assignments. Organizers must confirm the profile is reachable and the account can actually receive and handle privacy inquiries. A profile link alone does not establish legal compliance.

When upgrading, configure `PRIVACY_CONTACT_OSU_ID`, remove obsolete privacy settings from the private runtime environment, and restart the application. The public Privacy page uses one inline osu! contact for access, correction and deletion requests; no separate free-form retention field is required. Without a valid designated contact, new sign-in and registration remain unavailable. Existing users, sessions and registration records are preserved. Never include private environment values in commits or issue comments.

## Backups, rollback and privacy operations

Use encrypted automated PostgreSQL backups (and point-in-time recovery where available), restricted operator access and restore drills into an isolated database. Before each release, take a recoverable snapshot and verify retention according to the organizer's actual policy. Maintain a secured copy of approved edition/content configuration alongside database backups.

Rollback application code to the last verified commit/release directory and restart; do not automatically reverse destructive migrations. Current migrations are additive, including explicit staff roles, competition fixtures/imports/results and stage group-publication configuration. For future incompatible schema changes, use expand/contract migrations and test the old application against the new schema. If database restore is needed, stop writes, restore to a new isolated target, validate consistency and intentionally switch connections; never overwrite a live database blindly.

Run `npm run db:cleanup` daily to remove expired OAuth state and session records. Signing out revokes the current session. Revoking a persistent role at `/admin/staff` applies on the next server authorization check, including existing sessions. Removing a bootstrap Admin ID from the environment requires an application restart. For account compromise, an operator may revoke all of a player's session hashes using a parameterized database query against `sessions.user_id`.

Organizers remain responsible for factual retention/deletion procedures covering identities, private answers, audit records and backups, including any tournament-integrity exceptions. Handle requests through the designated contact after verifying identity. Use reviewed transactions that respect active tournament obligations and foreign keys; do not promise an unimplemented automatic deletion schedule. Restrict exported CSV access and remove exports according to the actual policy. If the deployment requires a more specific public notice, obtain approved factual wording before collecting data; removing a configuration field does not establish legal compliance.

## Release acceptance and ongoing operator checks

Registration and competition code have isolated PostgreSQL and browser coverage. The organizer-confirmed external evidence is recorded above; the coding agent did not provision DNS or perform those production operations. Actual event content, authorized staff, credentials, privacy handling and hosting configuration remain the operator's responsibility on each deployment.

Issues #12–#15 also have captain-direct/staff-on-behalf concurrency, replay, publication and recovery coverage. The real organizer rehearsal was confirmed on 2026-10-23; its completion is independent of synthetic coverage. Rehearse again when operational conditions materially change before streaming.

## Season 11 preparation and profile verification

The committed `s11` edition is **unpublished**. Rules, eligibility, registration windows and schedule are unset. `UTC` is a neutral display default while all times are TBA; replace it with the organizer-approved IANA zone when entering actual times. Artwork does not publish the edition or enable registration. The homepage uses the supplied text-free background with HTML content; the square logo appears on S11 edition cards and the full key visual is prepared for its overview. Mobile keeps the complete background composition and intrinsic image ratios. Review and save approved content in `/admin/tournaments/s11/settings`, then explicitly publish it and enable registration separately.

Apply migration `0011` before enabling profile pages. `release:check` verifies the cache columns as well as existing operational tables. Using actual server-side API credentials, an authorized Admin should send a same-origin authenticated `POST /api/admin/profiles` with `{ "input": "https://osu.ppy.sh/users/651307/osu" }`. Profile lookup is API-only; Captain cards use the same service in context. Confirm official username/ID, source/time, optional fields and selected ruleset; switch rulesets and check refresh throttling. This lookup must not create an account, approve an application or publish participation. For an explicitly published staging participant, verify anonymous profile access and then withdraw publication: cached statistics must become inaccessible on the next public request. Exercise provider failure with a saved snapshot and confirm the stale label without logging tokens.

The earlier unauthenticated profile request for user `651307` returned HTTP 403 and did not verify their statistics. On 2026-10-20, a local server-side client-credentials request successfully retrieved official beatmap `75`; production credentials and hosted API access still need verification. Real OAuth consent/callback (#5), live profile/MP reads, approved S11 rules and privacy/contact/retention, hosting/HTTPS/secrets/database backups, and the organizer's hosted staging rehearsal remain release gates in #10. The visible privacy page is a baseline notice awaiting organizer policy, not evidence of policy approval. Keep #5/#10 open until those checks are actually recorded.

## Draft operator runbook and rehearsal

Confirm actual captain/team counts, eligibility, maximum roster capacity (including captain), full turn sequence, pool visibility, on-air publication timing and correction policy with organizers. None of these are inferred from the mockup. Keep substitutions/post-finalization changes unavailable until approved rules exist.

1. In an isolated staging edition, review individual applications, appoint captains and save their order; configure one approved team name/capacity per captain. Publish captain and team identities deliberately. Lock setup only after review.
2. In the staff draft room, append the reviewed captain order or select each turn explicitly; save the **entire** sequence. Freeze setup, start and publish the live state. Publication does not create picks.
3. Have Captain A sign in independently and confirm a player. Check the staff preview/audit, then publish. Have staff select on behalf of the next on-clock captain, inspect actual actor/mode and captain/team attribution, then publish. Repeat using both methods. Public/captain views poll every two seconds; network failures retain the last published snapshot with a reconnecting label, and no polling operation mutates state.
4. Test a simultaneous captain/operator attempt for the same turn: exactly one commits, the other sees a conflict, stale selections clear and all views converge after publication. Test duplicate delivery with the same key and altered payload, another captain's direct API call, paused selection, private API access and withheld publication. Private picks, operator identity and audit reasons must never appear in spectator data or page source.
5. For a correction, pause, confirm voiding only the last pick, review/publish the corrected snapshot, resume and publish before picking again. Correct earlier turns in reverse order. For setup/order recovery, pause then explicitly abort and recover; this voids draft picks/memberships while preserving history and reopens audited setup. Do not issue ad hoc roster SQL. Finalized sessions cannot be rewritten.
6. Complete all configured turns, publish the last picks, then finalize. Separately approve final roster publication on the team page. The read-only bracket consumes finalized, published team identities.
7. Disconnect/reconnect spectators and reload all roles. Restart a staging app process during an ongoing draft and verify persisted revision/order/rosters before enabling writes again. Exercise backup restoration separately in a disposable database. Test the actual hosting ingress and organizer-approved event scale before a real broadcast.

`TEST_DATABASE_URL=... npm run test:e2e` performs the isolated multi-browser rehearsal with synthetic accounts/session hashes only (no production authentication bypass). `npm test` additionally checks database races, idempotency, audited correction/finalization and reconstruction of an ongoing draft in a fresh Node.js process. Browser artifacts are saved under Playwright's portable test-results directory. Tests are serialized around the shared isolated database; individual race scenarios still send concurrent server requests. Automated fixtures demonstrate two captains/two planned picks, not a claim of capacity at an unconfirmed real event scale. Live OAuth/staging hosting and organizer rehearsal remain external launch gates.

## Availability and publication safeguards

Registration links check the configured window, required privacy configuration and persisted draft lock. Temporary database failures hide submission controls; server mutations always recheck independently. Static tournament rules/dates remain readable during database outages, while private queries fail closed. An idle database connection failure is handled without terminating the process; subsequent requests reconnect. Polling has a bounded timeout, retains the last published snapshot on network errors and clears protected data after a 401/403.

Once the draft has been explicitly released, committed picks and guarded corrections update spectator/captain snapshots in the same transaction. Finalized team roster release remains separate. Revoking public pool approval removes the published pool immediately, including an older stored snapshot. Browser caches must never override these publication checks.

A local recovery rehearsal also stopped and restarted the scratch PostgreSQL process during an ongoing synthetic draft: the public homepage remained readable, private API access returned a generic failure during the outage, the existing session recovered, and persisted revision/picks/memberships were unchanged. This verifies local recovery only; it does not replace a hosting failover or backup-restore drill.

## OBS browser source

Use `/tournaments/[edition]/draft/overlay` for an opaque canvas, or append `?background=transparent` for compositing. In OBS, add a **Browser** source with the actual approved HTTPS URL, width **1920**, height **1080**, and the default browser-source CSS. The canvas itself controls the opaque variant, so OBS's transparent body CSS does not erase it. See the [official Browser Source settings](https://obsproject.com/kb/browser-source). No privileged cookie, token, login or OBS page permissions are required.

The overlay shows the latest published selection and its receiving captain/team, current published turn/status, recent picks and published roster progress. It uses the existing public snapshot endpoint every two seconds with one request at a time, an eight-second timeout and no credentials. A failed connection retains the last published state with a reconnecting label. Lower revisions of the same session cannot rewind the display; a publication retraction clears it. Reloads establish a baseline without replaying old pick animations. Newly published picks get a short reveal; reduced-motion preferences disable it. No countdown, round format or capacity is inferred. Large rosters remain keyboard-scrollable; test the actual organizer-approved roster count before airing.

The featured pick shows the published player's avatar, cached **osu!standard PP and ordinary Global Rank** (not BWS). The overlay-only `?overlay=1` public feed batches cache reads for already-published picks/rosters; only the featured player can request an existing-cache refresh after the response. No per-roster provider fan-out, session cookie or new credential is needed. Fresh profile values use the existing 30-minute cache expiry; unknown/outdated statistics show `—` with a small loading/unavailable label. Provider failure keeps the board usable. Avatars use trusted osu! image URLs with initials fallback. No private registration answers, unreleased pool identities or staff operators are included.

The canvas has no decorative bottom footer. Two roster teams are shown at a time; larger fields have keyboard-accessible previous/next controls and follow the current team's page on turn changes. Dense rosters use compact columns; exceptionally large rosters remain scrollable, so rehearse the actual configured field before airing. Supported broadcast layouts are 1920×1080, 1600×900 and 1280×720, opaque or transparent. Confirmed new picks, active turns and new list rows have short transitions; initial load/first poll, reconnect, stale/repeated data, corrections and session replacement do not replay old picks. Reduced-motion preference disables motion.

Staff preview the same public URL and explicitly publish from the staff draft room. Hiding a browser source or changing scenes never makes a pick or publishes data. The existing staff publication/confirmation/audit controls govern both captain-direct and staff-on-behalf picks. Keep source refresh/shutdown preferences consistent with the broadcast workflow; reloads are safe but may briefly show the connecting state. OBS is only a renderer here: no video hosting, streaming credentials or streaming automation is part of the app.

The isolated browser rehearsal covers a four-turn repeating A/B/A/B order with both pick modes, withheld publication, stale-response rejection, disconnect/reconnect, pause, audited last-pick correction, finalization, transparent/opaque backgrounds, reduced motion, privacy checks, desktop/mobile reflow and automated accessibility. It runs against the production build and PostgreSQL using synthetic data; it does not establish that real OAuth or public hosting is operational.

A separate local rehearsal also loaded the production application in **OBS 32.0.4** with a 1920×1080 Browser source. Both captain-direct and staff-on-behalf selections were observed with correct team/captain attribution, including an embargoed staff pick, published pause, opaque/transparent variants and recovery after a real Next.js process restart. Four A/B/A/B picks were then finalized. No stream, recording, public deployment or real OAuth session was used. Native automation hit Qt accessibility crashes during dialog/collection changes; the isolated browser source rendered successfully after recovery, and the original OBS collection was restored afterward. Keep an independent organizer rehearsal on the actual broadcast machine as a release gate.

The final local recovery drill used `pg_dump` (custom format) and `pg_restore --no-owner --no-privileges --exit-on-error` to restore the separate synthetic broadcast database into a new UTF-8 test database. Ordered JSON fingerprints matched for all 12 application tables and the migration journal, including the finalized draft, rosters, picks, actor/mode history and test sessions; applying migrations again succeeded without changes. This verifies the local PostgreSQL backup/restore path. The production provider's backup retention, restore permissions, recovery time and operational restore rehearsal still require verification on the actual hosting environment.

## Public Staff visibility

Apply migration `0017` before deploying the public About roster. All existing and new grants default to private. Admins explicitly publish individual role/scope entries through **Show on About** in Staff Management; verify the person has approved public listing. Edition-scoped entries remain hidden while their edition is unpublished. Revoking or hiding a grant removes it on the next public read. Rollback can retain the additive column and audit records; do not promote existing grants or backfill public consent.

## Competition operations release rehearsal

Apply migration `0015` before deploying quick referee assignment. It adds a separate assignment revision without changing fixture/result versions or existing assignments. Roll back application code if needed; retain the additive column and audit history. Referee changes are saved from each fixture card using active edition-authorized Referee/Admin accounts. They do not invalidate an ongoing result review.

Migration `0016` makes fixture participant IDs nullable, retaining all foreign keys, existing fixtures and result history. Apply it before deploying planned/TBD fixture controls. Plan matches and assign referees without dummy teams; confirm two finalized, published teams before MP reporting. Published planned fixtures may expose their approved schedule and TBD/progression labels, never private team identities or referee assignments. To roll back, retain the nullable columns and history; do not restore `NOT NULL` unless every unresolved slot has been legitimately confirmed and checked. Back up before migrations.

Use verified `ADMIN_OSU_IDS` only to bootstrap the first global Admin; legacy `STAFF_OSU_IDS` grants nothing. Sign in with the organizer-confirmed osu! account, grant persistent Admin assignments through `/admin/staff`, verify a second authorized account, then remove the temporary environment bootstrap if desired. Role grants can be global or edition-scoped. Mappoolers receive only mappool capabilities; Referees receive only assigned-fixture reporting. Captains have no staff powers through captain status. Test direct requests with each role, not just navigation visibility.

Before reporting matches, publish finalized official rosters, configure actual Group/Knockout rounds and their approved scoring policies, create/release mappools and schedule fixtures with referee assignments. Publish group membership and point/tiebreak rules explicitly if standings are required. Unconfirmed match times, rules or grouping remain TBA/pending. Do not import a lobby until its two fixture teams are verified.

The server uses the same organizer-owned osu! application's `OSU_CLIENT_ID`/`OSU_CLIENT_SECRET` to request a separate client-credentials `public` token for official beatmap and multiplayer reads; player sessions do not retain provider tokens. Requests go only to fixed official API paths. Requests are paced, have bounded retries/timeouts and never expose tokens. History snapshots are bounded to 100 pages, 10,000 events, 3,000 games, 8 MiB and a two-minute retrieval budget; incomplete/unsupported data cannot become a final score. Allow at least 150 seconds at ingress for paginated imports (individual provider requests time out after ten seconds) and monitor provider rate-limit errors without logging sensitive bodies. Failures preserve stored official results.

In staging, exercise import, repeated import, changed-history comparison, warmup/rematch exclusion, failed/understrength policies, permitted substitutions, ties and extra games under approved rules. Have an assigned Referee submit and an Admin separately approve then publish. Verify anonymous schedule/results/bracket reads and the absence of internal reasons, unapproved games and individual provider scores. Revoke the Referee role and confirm subsequent requests fail. Correct a result through a new reviewed revision and inspect every dependent knockout fixture before publication; conflicting downstream scores are withheld until explicitly reconciled. Approval permanently freezes its associated pool, so create a new pool for future changes rather than altering played maps.

The earlier unauthenticated official request for example MP `117427458` returned HTTP 403; that match remains unverified. The successful local beatmap API check does not establish MP retrieval, pagination or the hosted referee integration. Synthetic fixtures validate parser/scorer, PostgreSQL transactions and browser workflows without claiming that example's teams or result. Verify current official API behavior, a real authorized match and the actual hosted referee workflow before a live event. Production hosting/TLS, OAuth callback consent, approved tournament rules and operational backup/retention remain organizer dependencies; automated CI does not establish deployment.

The competition-operations recovery rehearsal also used an independent synthetic database containing staff roles, finalized rosters, a mappool, imported games, an approved published result, audit history and a session. The production-build server returned the same result and authorized history after a real PostgreSQL stop/start and a separate Next.js process restart. During the database outage, the homepage remained readable and private APIs returned a generic failure. A custom-format backup was restored into a new UTF-8 database; ordered JSON fingerprints matched for all **27 application tables plus the migration journal**, and migration replay succeeded. This is local recovery evidence, not verification of a production provider's backup operations.

## Rocky Linux 10 application host

Rocky 10 uses ordinary DNF packages, not the old AppStream module-enable workflow ([Rocky release notes](https://docs.rockylinux.org/latest/releases/release_notes/10_0/)). Install only the app prerequisites on this host:

```sh
sudo dnf install nodejs nodejs-npm git
node --version
npm --version
```

The base Node.js 22 packages meet the application's **>=22.13** requirement; update them through your managed repositories. Node.js 24 is the CI reference, but versioned `nodejs24` packages can expose `node-24`/`npm-24` rather than standard names. If choosing that runtime, configure a consistent standard `node`/`npm` PATH for both build and service, and adjust the service executable; do not mix runtimes. Package availability is in the [official Rocky repository](https://download.rockylinux.org/pub/rocky/10/AppStream/x86_64/os/Packages/n/).

Use this topology: **Browser → existing Nginx (HTTPS) → Rocky app (private port 3000) → existing PostgreSQL (private TCP or verified TLS)**. The public domain must point to Nginx, not directly to Node. Replace all uppercase/example values below with your actual settings. No production services have been provisioned by this repository.

**1. Prepare your existing database.** Follow [the PostgreSQL steps below](#existing-separate-postgresql-deployment-steps). Obtain a runtime URL and a separate migration URL from its administrator; obtain a trusted CA certificate only if choosing database TLS. Do not install PostgreSQL on the app host. Permit database connections only from the app/deployment host's actual private IP.

**2. Create an app account and first release directory.** On the Rocky application host, run these as your sudo-capable operator (fresh-install examples; reuse an existing account/path when appropriate):

```sh
sudo useradd --system --create-home --home-dir /var/lib/oclr --shell /bin/bash oclr
sudo install -d -o oclr -g oclr -m 0750 /opt/oclr/releases
sudo -u oclr -H git clone https://github.com/PhoenixEmik/OCLR-website.git /opt/oclr/releases/first
sudo -u oclr -H git -C /opt/oclr/releases/first rev-parse HEAD
sudo install -d -o root -g oclr -m 0750 /etc/oclr
```

Use a reviewed commit/release, not an unreviewed moving branch. Node/npm/setup run as `oclr`, never root. Do not run this first-clone command over an existing release directory.

**3. Write the runtime configuration.** Create `/etc/oclr/runtime.env` with your editor (`sudoedit /etc/oclr/runtime.env`). Use plain `KEY='value'` assignments, one per line, without `export`; quote values containing spaces, `&` or `$`. This must be a trusted administrator-written file: the operator shell sources it and systemd reads the same assignments.

```sh
APP_URL='https://oclr.example.com'
DATABASE_URL='postgresql://oclr_runtime:ENCODED_PASSWORD@DB_HOST:5432/oclr?sslmode=disable'
OSU_CLIENT_ID='YOUR_OSU_CLIENT_ID'
OSU_CLIENT_SECRET='YOUR_OSU_CLIENT_SECRET'
ADMIN_OSU_IDS='YOUR_VERIFIED_ADMIN_OSU_ID'
PRIVACY_CONTACT_OSU_ID='YOUR_APPROVED_PUBLIC_CONTACT_OSU_ID'
OCLR_BIND_HOST='APP_PRIVATE_IP'
PORT=3000
```

Use the real public domain for APP_URL and register **exactly** `https://YOUR_REAL_DOMAIN/auth/osu/callback` in your osu! OAuth application. ADMIN_OSU_IDS contains verified numeric IDs, not usernames. The privacy contact must be an approved global Admin; set the actual retention policy. OCLR_BIND_HOST is the Rocky host's own private IP, not Nginx's IP. Keep migration credentials out of this runtime file. Protect the runtime file:

```sh
sudo chown root:oclr /etc/oclr/runtime.env
sudo chmod 0640 /etc/oclr/runtime.env
```

The example uses the organizer-selected internal database connection without TLS. If choosing verified DB TLS instead, set `sslmode=verify-full&sslrootcert=/etc/oclr/db-ca.pem` and install the provided CA with `sudo install -o root -g oclr -m 0640 /PATH/TO/PROVIDED_DB_CA.pem /etc/oclr/db-ca.pem`. Public browser HTTPS remains required.

Keep `.env.local` and other local environment files out of release directories. The shell script never sources them; Next.js/Drizzle themselves can still load Next.js environment files. Do not paste secrets into Git, chat, command arguments or shell history.

**4. Back up and prepare the release.** Verify a recoverable backup of the intended external database first. Then open an unprivileged operator shell:

```sh
sudo -u oclr -H bash
cd /opt/oclr/releases/first
set -a
. /etc/oclr/runtime.env
set +a
bash scripts/production.sh setup --dry-run
read -r -s -p 'Migration database URL: ' MIGRATION_DATABASE_URL
printf '\n'
export MIGRATION_DATABASE_URL
bash scripts/production.sh setup --apply
unset MIGRATION_DATABASE_URL
exit
```

The hidden prompt takes the **migration** connection URL, with the same database/transport settings as the runtime URL and its separate migration-role credentials. It is not written into shell history. Check each command succeeds; stop if setup reports an error. Setup installs locked dependencies, runs committed migrations with migration credentials, checks runtime configuration/schema and builds. Only the migration subprocess receives the privileged URL. Dry-run executes nothing and does not validate real credentials or connectivity. The npm aliases invoke the same Bash script.

These first-install preparation/start commands require explicit `--apply` for setup after operator backup/target review. Use [the guarded update command](#routine-whole-site-updates) for later releases. #10 remains open for full hosted staging upgrades and external launch verification. There is no automatic legacy JSON import, account creation, publication or database rollback.

**5. Start under systemd.** For this fresh installation, point `current` at the prepared release and install the supplied unit:

```sh
sudo ln -s /opt/oclr/releases/first /opt/oclr/current
sudo install -o root -g root -m 0644 /opt/oclr/current/docs/examples/oclr.service /etc/systemd/system/oclr.service
sudo systemctl daemon-reload
sudo systemctl enable --now oclr
sudo systemctl status oclr
```

Adapt [oclr.service](examples/oclr.service) if your account/directories differ. It runs `/bin/bash scripts/production.sh start` and uses `/usr/local/bin:/usr/bin:/bin` to resolve Node/npm. Startup checks configuration/schema and executes Node directly; it never migrates/builds. Runtime credentials are already passed by systemd's EnvironmentFile. If startup fails, inspect `sudo journalctl -u oclr -n 100 --no-pager` privately; do not post unredacted logs.

**6. Configure your existing Nginx.** Follow [the separate-Nginx example below](#existing-separate-nginx-example-configuration). Allow inbound app-port access only from the actual Nginx source IP using your host/cloud firewall. Do not open port 3000 to the Internet. Keep SELinux enforcing.

**7. Verify from Nginx, then the browser.** From the Nginx host, replace both examples before running:

```sh
curl -I -H 'Host: YOUR_REAL_DOMAIN' http://APP_PRIVATE_IP:3000/
curl -I https://YOUR_REAL_DOMAIN/
```

Confirm the upstream is reachable and HTTPS has a valid certificate with no redirect loop. Then sign in through osu!, verify logout, check that ordinary accounts cannot access Admin, and rehearse registration/staff workflows in an isolated staging tournament. Never run destructive test fixtures against production. A browser request alone does not verify OAuth or database writes. This repository has not tested your actual Rocky/external DB/Nginx deployment.

During upgrades, build a separate release directory and switch the service only after setup succeeds; preserve the last verified release. Do not run npm ci/build inside the release currently serving users. Restrict inbound app-port access to the actual Nginx source IP with your host/cloud firewall. Keep SELinux enforcing; do not disable it to solve connectivity failures. This repository has not verified execution on the actual Rocky host.

## Existing separate PostgreSQL: deployment steps

Do **not** install/init a second database, upgrade the existing cluster, or overwrite an existing OCLR database. Confirm the actual server version, host/port, CA certificate, backup procedure and application-source IP with its administrator. PostgreSQL 17 is tested in CI; another version needs migration/staging verification. The names below describe a **new dedicated database**; for an existing installation, have its DBA adapt grants to the current object owner without recreating anything.

1. Connect to your **existing instance** as its database administrator. On a self-managed DB host, this is commonly `sudo -u postgres psql -d postgres`. For the chosen internal connection, use your actual admin login (managed services may enforce their own TLS policy):

```sh
psql 'host=DB_PRIVATE_IP port=5432 dbname=postgres user=DB_ADMIN sslmode=disable' --password
```

Replace the placeholders; do not run `initdb`, reinstall the server or recreate an existing OCLR database. In psql, `\l oclr` and `\du oclr_*` let you check whether these names already exist. For a **new** OCLR database, create restricted roles and use interactive password prompts; no passwords belong in SQL files/history:

```sql
CREATE ROLE oclr_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE oclr_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
SET password_encryption = 'scram-sha-256';
\password oclr_migrator
\password oclr_runtime
CREATE DATABASE oclr OWNER oclr_migrator;
\connect oclr
REVOKE ALL ON DATABASE oclr FROM PUBLIC;
GRANT CONNECT ON DATABASE oclr TO oclr_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO oclr_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE oclr_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oclr_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE oclr_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO oclr_runtime;
```

2. Configure the **existing** database listener and pg_hba.conf to permit only the actual Rocky app/deployment IPs. For the organizer-selected internal connection without TLS, use `hostnossl` with password authentication. Account for rule order and IPv6 where used. Do not introduce broad `trust` or `0.0.0.0/0` access. Managed database providers use equivalent access controls. A typical pair of entries is:

```text
hostnossl oclr oclr_runtime  APP_PRIVATE_IP/32 scram-sha-256
hostnossl oclr oclr_migrator APP_PRIVATE_IP/32 scram-sha-256
```

Use `hostssl` instead if choosing database TLS. You do not need to disable SSL globally on a shared server; `hostnossl` and the client URL select the unencrypted OCLR connection. Also restrict the database firewall/security group to that source. In psql, `SHOW hba_file`, `SHOW listen_addresses` and `SHOW ssl` identify the existing configuration. Reload approved HBA changes with `SELECT pg_reload_conf();`; listener changes may require a DBA-coordinated restart of the shared server. Do not restart it casually or weaken existing clients' policy. See [PostgreSQL client authentication](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html).

3. Put the runtime connection in the app environment: `postgresql://oclr_runtime:ENCODED_PASSWORD@DB_PRIVATE_IP:5432/oclr?sslmode=disable`. Use the actual internal address/port and URL-encode password characters. The migration connection uses the same host/database/transport with oclr_migrator. No CA or certificate parameters are needed when TLS is disabled. Password authentication still applies; traffic is unencrypted, so restrict it to the intended private network.

For verified TLS, use `sslmode=verify-full&sslrootcert=/etc/oclr/db-ca.pem`, the certificate's real host name and its trusted CA. The existing [node-postgres connection-string parser](https://github.com/brianc/node-postgres/blob/master/packages/pg-connection-string/README.md) supports both configurations; no second DB client is required.

From the application host, test the existing runtime account without putting its password into history:

```sh
psql 'host=DB_PRIVATE_IP port=5432 dbname=oclr user=oclr_runtime sslmode=disable' --password
```

Then run `SELECT current_user, current_database();` and `SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid();` (expected `f` for this connection). If PostgreSQL still listens only on localhost, set its listener to the actual database private IP plus any addresses needed by existing clients, and coordinate the required restart with its DBA. HBA-only changes need a reload, not a new database. Keep the existing accounts, grants and data.

4. Back up first, then run production:setup on the app release with the migration URL injected. Migrations create public application tables and the Drizzle migration ledger. Existing configurations and slugs are preserved; S11 stays unpublished on a fresh install. Only use the explicit legacy-import workflow above when required; subsequent deployments never overwrite database content from JSON.

5. For a database that already had objects before default grants, its DBA/actual object owner must also apply:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oclr_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO oclr_runtime;
```

Run release preflight using runtime credentials, then rehearse sign-in, one synthetic staging registration and authorized staff work. Runtime must not be a superuser or have schema-creation/TRUNCATE privileges. Never point TEST_DATABASE_URL at this database. Keep encrypted backups and test restoration into an isolated target before release. On failure, stop writes and follow the existing rollback section; never automatically down-migrate or restore over new player data.

## Routine whole-site updates

Use `scripts/update.sh` on the **single Rocky application host** after the first installation works. It updates server code, public assets, dependencies, the production build and pending database migrations together. Admin-edited tournaments/player records stay in the existing database. Nginx remains separate; ordinary code releases do not need an Nginx reload. This is a maintenance-window deployment, not a zero-downtime claim. Review migration SQL and compatibility before invoking it; the script does not determine whether a reviewed SQL operation is safe for your tournament.

**One-time preparation (sudo-capable operator):** install PostgreSQL **client tools only** (`pg_dump` and `pg_restore`) from an approved repository. Use a matching client version, or a newer version verified against your server; an older pg_dump cannot dump a newer server. Do not install/initialize another PostgreSQL service. Bash, Git, tar, GNU coreutils, util-linux (`flock`), Node/npm and systemd/sudo must also be available. Keep the same Node/npm runtime in the operator and service PATH.

```sh
sudo chown oclr:oclr /opt/oclr
sudo install -d -o oclr -g oclr -m 0700 /var/lib/oclr/backups
sudo -u oclr -H git clone https://github.com/PhoenixEmik/OCLR-website.git /opt/oclr/repository
sudo visudo -f /etc/sudoers.d/oclr-update
```

The parent `/opt/oclr` must be writable by the deployment account for atomic `current`/`previous` symlink changes; do not recursively change unrelated paths. Keep the operator clone clean and separate from the serving release. Add this **narrow** sudoers rule, adapting the real absolute systemctl path and service name if different:

```sudoers
oclr ALL=(root) NOPASSWD: /usr/bin/systemctl stop oclr.service, /usr/bin/systemctl start oclr.service
```

Validate with `sudo visudo -cf /etc/sudoers.d/oclr-update`. Do not grant unrestricted sudo or install a root-running update service. The supplied systemd unit must use `User=oclr` and `WorkingDirectory=/opt/oclr/current`. Backups/logs contain private player data: restrict access, encrypt/transfer them to your approved backup storage, define retention and rehearse restoration. No script automatically deletes old releases/backups.

**Each update (unprivileged deployment shell):** fetch the remote, inspect the proposed commit and its SQL changes, and confirm its CI passed. Resolve the intended release to a full 40-character SHA. Set the actual expected DB host/name explicitly; these are compared against both connection URLs, including matching ports. Never pass a credential URL as a command-line argument.

```sh
sudo -u oclr -H bash
cd /opt/oclr/repository
git fetch origin main
git log -5 --oneline origin/main
# After review, update this clean operator checkout to the intended script version:
git merge --ff-only origin/main
set -a
. /etc/oclr/runtime.env
set +a
export OCLR_ENVIRONMENT=production
export OCLR_EXPECTED_DB_HOST=YOUR_DATABASE_HOST
export OCLR_EXPECTED_DB_NAME=oclr
# Optional: OCLR_INSTALL_DIR, OCLR_BACKUP_DIR, OCLR_SERVICE (defaults shown above).
bash scripts/update.sh --ref FULL_REVIEWED_COMMIT_SHA --dry-run
read -r -s -p 'Migration database URL: ' MIGRATION_DATABASE_URL
printf '\n'
export MIGRATION_DATABASE_URL
bash scripts/update.sh --ref FULL_REVIEWED_COMMIT_SHA --apply
unset MIGRATION_DATABASE_URL
exit
```

Replace the SHA/host examples; a floating `main` is deliberately rejected. The npm equivalent is `npm run production:update -- --ref FULL_REVIEWED_COMMIT_SHA --apply`. The selected commit must exist on `origin/main` and include the updater/preparation contract. Unset inherited `PG*` options; all database connection settings must be explicit in the URLs. Keep all local `.env*` files out of releases; the updater rejects committed production environment files. Secrets remain exported from the protected operator environment and systemd runtime file; migration credentials reach only the database helper, not dependency installation/build/service startup.

`--dry-run` prints the sequence without commands/network/filesystem changes; it does **not** validate live connectivity. `--apply` acquires an installation file lock, verifies a clean operator checkout/service target, archives the exact commit to a new directory, then runs `production.sh prepare --apply` (install/check/build, no DB changes). It checks both DB targets and the applied Drizzle hash/timestamp prefix, prints pending IDs, stops the old service, takes a custom-format dump and verifies both its table of contents and full decoding using pg_restore. A SHA-256 sidecar detects later archive changes. This archive verification is not a substitute for a real restore drill. Pending SQL runs with an advisory DB lock; an already-applied journal is a no-op. Runtime preflight then runs before atomic symlink activation/start.

Health checks require a successful DB query and the **exact new SHA** at `/api/health`, plus public HTML, both through the configured private listener and the real HTTPS origin. The private HTTP client explicitly sends the canonical `Host` header to avoid canonical-host redirects; public HTTPS is checked independently without following redirects. IPv6 wildcard listeners are checked through `::1`. Checks allow about two minutes for startup and report which endpoint failed: HTTP status, invalid JSON/HTML, stale release, database readiness or a safe network/TLS error code. Response bodies/provider error messages are never logged. No session or private records are returned. The canonical hostname must resolve from the app host back through Nginx. A network/certificate/proxy error fails activation verification. The script writes a timestamped private `update.log` including the failed phase/exit status, keeps `previous` and the database archive, and reports their paths. It checks committed migration history and detects a changed schema source without a new journal entry; it does not audit arbitrary out-of-band database DDL. Investigate any drift rather than resetting the ledger.

Both production and staging database URLs must explicitly choose `sslmode=disable` for the approved internal network or `sslmode=verify-full` for verified TLS. Setup, runtime, backups and updates use the chosen transport without a separate opt-in flag. The updater still verifies the environment, host/database, credentials and migration history. Public HTTPS and OAuth requirements remain independent. Staging uses a different database, OAuth app, paths, service and domain.

**Build heap exhaustion (exit 134):** `production.sh setup` and `prepare` give Node-based checks and builds a default 2048 MiB old-space heap budget per process. This avoids a small automatically selected V8 heap limit on constrained hosts. An explicit heap limit in `NODE_OPTIONS` is preserved; `OCLR_BUILD_HEAP_MB` (integer MiB, 128–65536) overrides it for preparation only. Other Node flags are preserved without printing their contents. Dependency installation, migrations and `production.sh start` keep the original environment. Type checking and build errors still stop the update.

For the `sudo oclr update` entry point, configure `OCLR_BUILD_HEAP_MB=3072` in the protected `/etc/oclr/runtime.env` if a larger budget is needed; the worker loads that file after clearing the caller's environment. For direct unprivileged setup/update commands, export the variable in the operator shell. Choose a budget that leaves room for the existing service, native allocations, other build workers and the operating system within RAM/swap and any cgroup limit. The heap budget is not a total-memory cap or a reservation; increasing it cannot fix insufficient host memory. Do not put a build-only heap setting in global `NODE_OPTIONS` merely to fix preparation.

If the private log shows failure during **building and checking the new release**, migration and activation have not begun and the updater leaves the old service online. After checking host capacity and obtaining a reviewed commit containing this fix, retry the normal pinned update command (or `sudo oclr update` for the convenience workflow). The updater creates a fresh candidate; do not build in the serving release, reset migrations, delete backups or restart the service to fix a build OOM. A successful local build does not establish that the affected host has enough memory; verify its next update log and exact-release health checks.

**Failure and recovery:** stop and inspect the script output/private log first. Build/initial preflight failures leave the existing service online. Backup failure before migration/activation requests a restart of the unchanged release. Once `migration.started` exists, or activation began, failures/interrupts deliberately keep the service stopped; the presence of that file means migration was attempted, not necessarily committed. A subsequent update refuses to proceed while the old service is down. Check the migration ledger and compatibility before recovering. Do not reset it or run a second operator concurrently.

Start diagnosis with `sudo journalctl -u oclr.service -n 80 --no-pager` and the reported private `update.log`. If the log confirms **no pending/applied migrations**, runtime preflight passed, activation succeeded and only health failed, you may start that same current release with `sudo systemctl start oclr.service`, then verify the local listener and public site before updating. This does not switch releases or alter the database. If it does not start, inspect the journal rather than repeatedly redeploying. Never paste `runtime.env`, connection URLs or credentials into issue comments. For a release whose compatibility is uncertain, use the deliberate recovery procedure below instead.

For an **application-only rollback**, first confirm the retained release supports the current schema and all writes made since deployment. As the deployment account, use its known full path (not an unreviewed symlink target):

```sh
sudo /usr/bin/systemctl stop oclr.service
ln -s /opt/oclr/releases/KNOWN_COMPATIBLE_RELEASE /opt/oclr/.recovery-current
mv -Tf /opt/oclr/.recovery-current /opt/oclr/current
sudo /usr/bin/systemctl start oclr.service
```

Check the service journal privately, `/api/health`, public pages and the relevant authorized workflow before accepting traffic. The health SHA must match that retained release's `.oclr-release`; older manually installed releases may return null and need separate verification. For incompatible schema/data, keep writes paused, preserve the failed release/logs and involve the DBA. Restore the verified archive or PITR **into a separate empty recovery database**, validate rows/ledger and a matching release there, and explicitly plan a cutover that accounts for all newer writes. Never restore over the live database or auto-run destructive down migrations. Initial interruption recovery, full service/TLS switching, real restore drills and two complete persisted staging upgrades still need rehearsal on the actual Rocky/external-DB/Nginx topology; local tests do not close #10.

## Existing separate Nginx: example configuration

Copy and adapt [oclr-nginx.conf](examples/oclr-nginx.conf) **on the Nginx host**, not the app host. `192.0.2.20`, `oclr.example.com` and certificate filenames are documentation placeholders. Replace them with the Rocky application's private IP, actual canonical public domain and existing certificate paths. Set APP_URL=https://YOUR_REAL_DOMAIN and register the exact OAuth callback https://YOUR_REAL_DOMAIN/auth/osu/callback.

The example terminates HTTPS on the existing proxy and forwards to Node over a restricted private network. If that path crosses an untrusted network, use a verified encrypted tunnel or separately configured TLS upstream instead of plain HTTP. Host and forwarded protocol are set explicitly, which keeps canonical redirects, secure cookies and Origin validation consistent. The public browser's Origin header is preserved. Do not cache authenticated responses or OAuth callbacks; do not hide the application's CSP/no-store headers. Drafts use controlled polling; no WebSocket upgrade is needed. See official [proxy directives](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) and [TLS settings](https://nginx.org/en/docs/http/ngx_http_ssl_module.html).

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Run those commands only after adapting/installing the file and certificates; syntax and hosted traffic have not been verified here. Nginx must reach the app's private port, and the app must reach PostgreSQL; no Nginx-to-database connection is needed. If the existing Nginx host also uses SELinux, follow its approved proxy network policy (Rocky's [Nginx guidance](https://docs.rockylinux.org/it/guides/web/nginx-mainline/) documents httpd_can_network_connect); do not disable SELinux. Verify HTTPS, redirects, real-account OAuth login/logout, POST Origin checks, private cache behavior and draft polling on staging before declaring release ready.

### Team images (#99)

Set `OCLR_MEDIA_DIR=/var/lib/oclr/media` in the existing runtime environment. Provision this directory once as root (`install -d -o oclr -g oclr -m 0700 /var/lib/oclr/media`); updates must retain it outside `/opt/oclr/releases`. The app stores only bounded, decoded/re-encoded 512px WebP images under `teams/<UUID>.webp`; original uploads/metadata are discarded. Images are served through a publication/permission checked route, not a public writable directory. Unconfigured/missing storage falls back to the team monogram; uploads fail clearly.

Apply additive migration `0020_team_avatars` and `0021_registration_eligibility` through the normal stopped-writes backup/migration workflow. Existing teams and historical applications keep NULL image/verification references. Automatic limits default to disabled on existing editions; no invented eligibility rules or retroactive acknowledgment. On application rollback retain these nullable columns; never reverse applied migration history.

On the separate Nginx host, allow the bounded 8 MiB replay plus multipart overhead (team images remain 5 MB) (`client_max_body_size 9m`, as in docs/examples/oclr-nginx.conf), then validate and reload your existing proxy. The application still enforces smaller per-operation JSON limits and the actual image byte/pixel limits.

The updater captures the configured media directory alongside the database while writes are stopped. Restore the matching `database.dump` and `team-media.tar` together, with the service stopped, into the configured durable directory owned by `oclr`; verify `team-media.tar.sha256` before extraction. Retain matching media/database backup sets for the same operator-approved backup period. Replaced/removed images are removed after a successful save. For interrupted uploads or post-commit transport failures, run `npm run media:cleanup` in a maintenance window with the service stopped; it removes only unreferenced UUID WebP files older than 24 hours, leaving current references and historical backup archives intact. Do not manually delete files referenced by active teams.

### Development-tool dependency review (#92, 2026-10-22)

ESLint is temporarily pinned to **9.39.5**, with eslint-config-next **16.4.2** and all existing lint protections retained. This is a **time-bounded development-tool exception**: ESLint 9 has been EOL since 2026-08-06 ([official schedule](https://eslint.org/version-support/)). It is not a supported long-term solution and is never part of the production request runtime.

The clean Node 24.22.1 install of ESLint 10.13.0 succeeded but printed ERESOLVE overrides for **all three** stable Next plugins: import 2.32.0, jsx-a11y 6.10.2 and react 7.37.5 advertise peers only through ESLint 9. `npm ls eslint` failed with ELSPROBLEMS. Sampled import/React/a11y rules executed on 10 (Next supplies compatibility adapters); that does not establish upstream-supported coverage of every rule. The temporary rollback chooses a reproducible, valid peer tree rather than relying on unsupported transitive peers. It removes peer overrides, **not** the visible ESLint 9 EOL or Drizzle deprecation notices. No `--force`, `--legacy-peer-deps`, peer overrides, experimental dependencies or lint-rule removals are used.

CI runs `npm ci --include=dev`, `npm ls eslint`, normal lint/type/build checks and executable rule probes for import, React, accessibility, TypeScript and Next. **Reassess by 2026-11-05** as ongoing dependency maintenance (recorded under #92/#10): check stable `eslint-config-next` and all three plugins' actual peer metadata ([import support tracking](https://github.com/import-js/eslint-plugin-import/issues/3227)). Restore a supported ESLint 10 version together with compatible stable plugin/config releases, regenerate the lockfile, repeat a clean Node 24 install/peer-tree check, rule probes, lint/types/tests/build and isolated Drizzle rehearsal. Do not extend this exception silently; if stable compatibility is still unavailable, record an explicit renewed risk decision or a supported upstream alternative.

Production runtime audit reports no advisories at this checkpoint; the full development tree reports 9 entries (4 moderate/5 high, including parent-path duplicates):

- Stable drizzle-kit 0.31.11 still depends on @esbuild-kit/esm-loader 2.6.5 → core-utils 3.3.2 → esbuild 0.18.20. The upstream replacement is not yet in a stable release (https://github.com/drizzle-team/drizzle-orm/issues/5304). GHSA-67mh-4wv8-2f99 affects esbuild's development HTTP server: OCLR runs Drizzle generation/migration as local CLI commands, never `drizzle-kit studio` or esbuild `serve`, and does not expose those tools on the production listener. Do not open untrusted projects/configuration in privileged migration contexts.
- Next's ESLint plugin → fast-glob → micromatch → braces 3.0.3 is reported under GHSA-vfj7-8cjw-p6xm (deep untrusted glob patterns can exhaust the stack). npm currently lists 3.0.3 as latest stable. OCLR lint uses reviewed repository config, no browser-controlled glob input, and CI/build users remain unprivileged. Do not run untrusted lint configuration with secrets or migration privileges.

The deprecated loader warnings remain visible; adding tsx directly cannot remove this dependency. Do not force audit fixes/downgrade Next to 14, install a Drizzle RC, override incompatible esbuild majors or suppress warnings. This is a temporary, development-tool-only maintenance exception, not a claim that the full tree is advisory-free. Recheck official stable fixes by 2026-11-05 (or before accepting untrusted build configuration); the dated maintenance exception recorded under #92/#10 continues to track the outstanding upstream fixes. Runtime uses reviewed prebuilt Next artifacts; build/migration tools and credentials are separate from normal site requests.

After an edition has saved `automaticEligibility` configuration, releases before #100 may reject that JSON field because configuration parsing is strict. Retaining the additive columns alone does **not** make such an application downgrade compatible. Prefer a reviewed forward repair; any rollback to an older parser needs a stopped-write, explicitly reviewed matching database/configuration recovery. Never automatically erase eligibility settings, verification history or new registrations to make an old build start.

### Independent enrollment pause migration (#104 / PR #105)

Apply additive `0022_separate_registration_pause` through the normal stopped-writes backup/migration workflow before activating this release. It adds nullable `edition_state.registration_paused_at` and copies every existing `locked_at` closure into it. It does not modify edition configuration, enablement, dates, acknowledgments, picks, rosters or results. New installs migrate from zero; populated-upgrade tests verify both backfilled closures and data preservation, and the migration journal makes subsequent deployment a no-op.

After cutover, `locked_at` protects draft structure; the new field independently pauses enrollment/withdrawal. Admin unlock/reset leaves enrollment unchanged. Deliberately resume enrollment only from the Registration settings action after reviewing enablement, dates and privacy readiness. Release preflight checks the column so code cannot be activated ahead of its migration.

Prefer forward repair. Do not mix older application writers with this release: they do not maintain/read the independent enrollment pause, and an application-only downgrade can reopen an unlocked but operationally paused tournament. Before any reviewed downgrade, explicitly disable registration in Admin, verify public enrollment is closed and draft state is compatible, and preserve the new column, history and backups. Keep registration disabled until the independent pause/structural state has been reconciled through reviewed recovery. Never automatically drop the column, reverse the migration journal or restore a live database.

### Registration removal provenance (#107)

Apply additive `0023_registration_event_operations` through the existing backup/migration workflow before activating this release. It adds a nullable operation to the existing registration events; historical events remain unchanged and unattributed rather than backfilled with invented actor methods. New staff removal/restoration and player withdrawal events identify their actual operator and server timestamp. Release preflight checks the column. Fresh/upgrade/repeat migration tests cover record and acknowledgment preservation.

Removal uses the existing Withdrawn status, retains the registration/answers/consent/review history and global identity, and never cascades team or draft changes. Restoring a staff-removed record is an explicit transition to Pending, with its original consent history intact; it does not accept the player, record new consent or change registration availability. Ordinary self-withdrawals are not restored by this tool. Referenced captains, rosters, fixtures and persisted draft-pool participants require their existing supervised correction/recovery tools first. A reviewed older application can ignore the additive column, but lacks staff-withdrawal attribution and restore controls; retain the column and all audit history on downgrade, prefer forward repair, and never delete rows or down-migrate automatically.

### Registration reapplication history (#116)

Apply `0024_registration_attempt_history` through the existing verified-backup migration workflow before activating the new application. Existing registrations/events remain attempt 1 with unchanged contents; earlier withdrawn attempts are archived only when the player explicitly reapplies. Preflight verifies the new columns/table. Keep archive rows and configuration revisions on rollback; do not delete/reinsert participants or down-migrate consent history. An older build may read the current row, but pre-0024 writers do not record the current attempt on review events. After any reapplication, keep writes stopped unless the rollback release has been explicitly verified to preserve attempt provenance; prefer a forward repair.

Migration `0025_weekly_awards.sql` adds edition-scoped award settings and immutable,
versioned releases. It does not create weeks, assign Tiers or publish awards. Apply
with the normal backup/migration procedure. An older application can leave these
additive tables in place; never drop award or registration-attempt history as an
automatic rollback. Review compatibility before switching releases.

### Site default appearance

Migration `0026_site_appearance.sql` adds a single site default and its automatic audit events, preserving the original design until a global Admin changes `/admin/settings`. The normal deployment/update script applies it; no new environment variables are required. Visitor appearance cookies override the site default. Rollback to the previous application can leave these additive tables in place; do not drop them or lose settings/history during recovery.

## Tournament appearance defaults (#143)

Tournament Admins can select Original design, Cute pastel, Swiss minimal, Claymorphism, Manga halftone, Glassmorphism, Esports broadcast, Retro arcade, Frutiger Aero or Use site default in General settings, using the existing versioned tournament configuration and automatic audit. Explicit visitor `oclr-appearance` cookies take priority over tournament and site defaults. Route inheritance never writes a visitor cookie; other pages return to the site default. Light/dark and broadcast output remain independent. The optional `defaultAppearance` JSON field defaults to inheritance when absent, so no schema migration or legacy backfill is required. The Swiss minimal option additionally requires migration `0027_swiss_minimal_appearance` to expand the site settings and audit appearance constraints; apply it through the existing reviewed update workflow before using the new option. This migration preserves existing values and does not opt any visitor or tournament into Swiss. Claymorphism likewise requires migration `0038_claymorphism_appearance`, Manga halftone requires `0039_manga_halftone_appearance`, Glassmorphism requires `0040_glassmorphism_appearance`, Esports broadcast requires `0041_esports_broadcast_appearance`, Retro arcade requires `0042_retro_arcade_appearance`, and Frutiger Aero requires `0044_frutiger_aero_appearance`; each only expands the same constraints. Older strict tournament parsers may reject a newly saved field; retain a compatible reviewed application during recovery rather than silently discarding edition configuration.

### Historical archive imports (#145)

This feature adds an optional `archive` field to versioned tournament configuration, with no additional SQL migration. Deployment does not import the prepared S9 data. Wait for the organizer's deployment confirmation, then use the website's Historical archive import, saved private preview and separate publication action. See [S9 analysis and import handoff](s9-archive.md). Once saved, historical configuration revisions contain the new field; rollback requires a compatible application build. Do not erase source records or audit history to satisfy an older strict parser.

## Private mappool replay storage (#185)

Migration `0035_mappool_replays` adds private replay metadata, Tester/Replayer grants and a separate selection lock/Showcase deadline. It does not infer dates or grant access to names on the About page. Admins grant `tester` or `replayer` to verified accounts through Staff management; Mappoolers manage selection and may read/download but need one of those grants to upload/delete. Developer stays read-only; Admin can manage attachments. All writes use the same time window, including Admin.

On the app host install **Python 3 with the standard-library LZMA module** (Rocky Linux 10: `sudo dnf install python3`; verify with `sudo -u oclr python3 -I -c 'import lzma'`). There are no Python package downloads. The app invokes a fixed decoder with isolated Python mode and no shell; upload bytes travel over stdin. LZMA dictionary memory is capped at 32 MiB, decoded data at 16 MiB/300,000 frames, runtime at 3 seconds and concurrent decoders at two per Node process. Keep the aggregate limit in mind for multiple workers. Unsupported/missing codecs fail closed. The existing systemd PATH must include Python 3; no additional service is installed.

Use the existing **durable absolute** `OCLR_MEDIA_DIR=/var/lib/oclr/media` outside releases and public roots. It must be a real private directory (no symlink); provision it once as documented above. Replay bytes are stored as mode-0600 `replays/<server-generated UUID>.osr` beneath a mode-0700 directory. Original names never become paths. Do not add an Nginx alias/static route for this directory. Every download goes through a session, edition/resource and read-capability check and returns an attachment with `no-store` and `nosniff` headers. Systemd hardening that uses `ProtectSystem=strict` must include only the durable media root in `ReadWritePaths`; retain Python executable/library access and `PrivateTmp`/`NoNewPrivileges`. For SELinux, keep it enforcing: assign the app service an approved writable data-directory context/policy for `/var/lib/oclr/media`, run `restorecon`, and inspect AVC denials for the actual service domain. The separate Nginx host never reads these files and should receive no SELinux permission to this private directory.

On the **existing separate Nginx host**, set `client_max_body_size 9m` as in the example, retaining `client_body_timeout 15s`; validate with `nginx -t` before an operator-approved reload. The app independently bounds the actual multipart stream at 8 MiB + 16 KiB and the replay at 8 MiB, regardless of Content-Length/MIME. File and attachment limits are 10 per map, **1 GiB / 10,000 files total** in the replay directory, including abandoned files. Concurrent quota checks are serialized across processes through PostgreSQL. Keep free disk space for other media, database backups and update releases; exceeding quota returns a clear failure without creating an association.

The existing updater already archives **the entire media root** into the legacy-named `team-media.tar`, including `replays/`, while writes are stopped. Keep that archive, its SHA-256 and the corresponding database dump as one backup set. Verify the checksum, stop writes, restore the matching database and media root owned by `oclr`, restore permissions/SELinux context, then use an authorized download to verify SHA-256 byte equality before resuming. Updating or deleting a release must never delete the media root. A database dump alone cannot restore replays.

Files are flushed and atomically renamed before metadata/audit commit; a rollback cleans the new file when database state can be established. If a COMMIT acknowledgement is lost, the file is retained until its reference can be checked rather than risking deletion of committed content. Deletion commits association removal and audit first, then unlinks the file; an unlink failure leaves a safe orphan. With the service **stopped**, run the existing `npm run media:cleanup` with explicit runtime configuration: it now also removes unreferenced replay UUID files and interrupted temporary files older than 24 hours. It preserves referenced files, fresh files and backup archives. Review backups before cleanup; never run it concurrently with uploads or database restore. Missing/damaged referenced bytes fail download and require restoring the matching backup; duplicate upload does not silently replace content.

Agent verification uses synthetic replay/provider fixtures and an isolated test database. It does not establish a real Rocky deployment, production restore or actual osu! replay playback.
