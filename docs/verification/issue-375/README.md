# Historical staff categories and identity confirmation (#375)

## Behavior

Public historical Staff pages group explicit duties as `referee` (裁判),
`streamer` (直播) and `commentator` (解說), including known combined duties.
Confirmed UIDs are deduplicated within each group while historical names and
source records remain intact. The source's generic Staff umbrella is not evidence
of three individual duties; unknown duties remain literal and unresolved people
are not merged solely by name.

An edition Admin can select an unresolved saved staff row in **Historical
archive**, look up a current osu! username and explicitly confirm the historical
identity against independent evidence. Saving rechecks the provider candidate,
authorization and archive revision, then changes only that row's UID with a
transactional private audit record. Existing UIDs cannot be overwritten. Numeric
usernames use username lookup. No accounts, role grants, registration records,
competition results or publication flags are changed.

## Local verification — 2026-10-28

- Node.js 24.22.1, `npm ci`, isolated PostgreSQL database `oclr_375_test`.
- `npm run check`: lint and type checks passed.
- Combined `npm test`: 175 files passed, 1,418 tests passed and one skipped.
  After the final private-audit preservation and unknown-duty refinements,
  affected tests were rerun: 42 passed across six files. Provider regression tests
  also passed in the preceding affected run (51 tests across seven files).
- `npm run build`, `npm run test:i18n` and formatting checks passed. Interface
  catalogs were regenerated with `npm run i18n:extract`.
- Staff browser tests: all four desktop/mobile cases passed, covering lookup,
  explicit confirmation, persisted identity, failure handling, numeric username,
  anonymous/Developer/cross-origin denial, private evidence, and scoped WCAG A/AA
  checks. The existing historical-archive browser regression also passed its
  20 desktop/mobile cases.
- The Staff tests check both public and Admin views in three locales and both
  color modes, plus all 13 registered appearances in light/dark at desktop/mobile
  widths. These are targeted checks, not the complete site's browser matrix.
- Integration coverage includes stale revisions, forged IDs, provider failures,
  concurrent confirmations, grant revocation during provider I/O, edition scope,
  read-channel denial and unchanged public notes/statistics keys.
- `npm audit --omit=dev`: zero vulnerabilities. `git diff --check` passed.

Screenshots contain synthetic test identities and placeholder avatars. No
production UID backfill, live provider rehearsal or deployment was performed.
GitHub CI, organizer visual acceptance and review of new Chinese wording remain
separate from this local evidence; the issue remains open for review.

## Screenshots

- [Desktop staff groups, dark](desktop-groups-dark.png)
- [Mobile staff groups, dark](mobile-groups-dark.png)
- [Desktop identity confirmation](desktop-confirmation.png)
- [Mobile identity confirmation](mobile-confirmation.png)
