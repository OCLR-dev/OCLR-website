# Known OCLR players and name evidence (#360)

An osu! UID is the identity key. A username never merges accounts, imports or
unresolved people. `/players/{osuId}` uses a known identity independently of its
published participation array. The dashboard always links the authenticated UID,
including login-only users and pending/rejected/withdrawn applicants. A missing
provider snapshot leaves the identity and participation sections usable. Unknown
UIDs fail before provider I/O; reads never create an account or registration.

Public participation combines existing native publication rules with published
historical archives. A UID appears at most once per edition; archive evidence takes
precedence when that edition also has native rows. Historical names, roles, team
identities, source references and recorded standings remain literal. Confirmed
replacement UIDs are included; unresolved people have no inferred UID. An archived
staff UID is a known identity without being counted as player participation.
Historical pages retain their source names and link to the same UID profile in
the selected edition. Current provider statistics do not overwrite archive data.

## Evidence and visibility

Migration `0049_player_name_history` adds `player_names`, independent of `users` so
historical evidence cannot create an OAuth account, appointment or registration.
The key is `(osu_id, username, source, edition_slug, reference)`. Case-insensitive
display grouping collects evidence without joining different UIDs. Reused names
can legitimately lead to multiple distinct UID results.

The migration backfills existing accounts, normalized provider caches, confirmed
archive players/staff/replacements in current edition state and saved edition
revisions. Unresolved archive people and username-only qualifier evidence are
excluded. SQL triggers capture subsequent account-name changes, cache snapshots
and archive imports/edits; login additionally records the provider's returned
`previous_usernames`. Empty/failed/newer snapshots never delete earlier evidence,
and cache eviction does not erase the ledger. The migration does not change old
archive JSON, answers, memberships or account permissions.

`first_observed_at` / `last_observed_at` mean actual OCLR observations, not rename
dates. A valid provider cache `fetchedAt` is preserved as available observation
evidence. Account/archive backfills have null times when the original observation
cannot be established. A later observation can add known times. A competition or
archive capture date is never substituted for a rename date. The read model keeps
current-name availability separate from a verified historical display name.
Unobserved/provider-omitted names remain an acknowledged data limitation.

| Reader           | Identity and name evidence                                                                                                                                                             | Participation                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Anonymous/public | Released native or archive identities; public provider evidence and names from currently published, still-associated archive sources. Private account/login observations are excluded. | Existing published native and historical facts only.                                |
| Actual subject   | Their account and confirmed name evidence, including login-only/zero-participation identities.                                                                                         | Same public participation projection; private applications remain on the dashboard. |
| Authorized staff | A live registration-management read capability and a confirmed UID related to the requested edition; public evidence plus account/provider and that edition's private evidence.        | Public participation only; no answers, notes or other private edition names.        |

Directory lookup checks UID/current name and publicly visible accumulated names.
Archive search includes the same public aliases while preserving its source names.
Hiding an archive immediately excludes its name evidence from public projections.
The internal `published` evidence flag records whether an archive name was released
when captured. An old private revision never becomes public just because a newer
revision of that edition is published; publication releases only its current names.
Public archive evidence must retain a matching UID/source reference association.
Private aliases do not become a public search oracle. Routine cache cleanup must
not clear the ledger; any separately authorized identity correction/privacy purge
must consider this UID-scoped table along with its retained source evidence.

## Read API and remote frontend

Read contract **1.3.0** adds these saved-only resources:

- `GET /api/v1/players/{osuId}/oclr-profile`: public projection,
  `tournaments:read` for a supplied token.
- `GET /api/v1/me/oclr-profile`: actual token subject, `identity:read`.
- `GET /api/v1/staff/tournaments/{edition}/players/{osuId}/oclr-profile`:
  `tournaments:private:read` and `profiles:read`, plus the existing live read
  capability and selected-edition relationship check.

OCLR profiles use osu!standard only and do not accept a `mode` query parameter.
Public/subject profiles accept `edition`. The shared
`OclrProfile` DTO contains a known identity/current-name availability, visible name
evidence, complete public participation and nullable saved statistics/BWS. Public
requests remain public even with a privileged token. No resource fetches osu!,
claims a cache entry, writes evidence or returns private application fields.

The frontend negotiates the version from its freshly verified backend contract
header. With v1.3 it uses the shared resource. An older compatible v1.2 backend
uses all edition-scoped public profile resources, deduplicates by UID/edition and
keeps the actual subject's identity usable even with no public hit. It cannot
provide persistent provenance until the backend is upgraded; it supplies no
invented dates or evidence. Authorization/transport failures never trigger an
anonymous or legacy downgrade. The minimum full-site compatibility stays v1.2.

Before deploying this backend, an authorized operator must apply migration 0049
through the existing migration workflow. This PR does not deploy or migrate any
remote service. After migration, the three backfill SELECTs at the end of 0049
(plus the SELECT over `edition_revisions`) can be repeated safely in an authorized
maintenance session: they add evidence without duplicates or historical rewrites.
Do not replay the CREATE TABLE/FUNCTION/TRIGGER statements over an existing install.
Rollback requires reverting the application before removing the three capture
triggers/functions and the new table; retain/back up evidence before any removal.

## Local verification

Use an isolated database with a separate `test` segment. Tests cover account-only
and private applicants, history-only UIDs, cross-season deduplication, name reuse,
unresolved people, accumulating/empty snapshots, repeatable backfill, public/self/
staff authorization, saved-only APIs, old/new remote contracts and navigation.
The existing profile browser regression covers saved standard statistics,
edition navigation and private lookup permissions on desktop and mobile.
Player pages use standard statistics and have no ruleset selector or mode query.
