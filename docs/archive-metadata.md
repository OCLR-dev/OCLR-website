# Structured historical metadata (#610)

Archive format 2 accepts optional `season: { startsAt, endsAt, timeZone }`.
Both instants require explicit UTC offsets, start must precede end, and the
zone must be recognized by Intl. `capturedOn` remains the capture/import date;
it must never supply a missing season date or scheduled match time.

Standings may record `scope: group|final`, `placement: { start, end }`,
`tied`, `qualified`, `official` and `note`. `finalPlacements` accepts the same
metadata plus the existing team ID and source, with required placement and
optional `scope: final`. References, duplicate teams, ordered bounds and edition
team count are validated. A range is not automatically a tie. `official` means
an original official ranking; accepted reconstructions can retain `false`.
Existing scalar rank must agree with placement.start when both are supplied.

Matches may supply `round: { phase, index }` (qualifier/group/swiss/knockout/final),
`format: { bestOf }` (positive odd), `timeZone`, and
`adjudication: { kind, note, evidenceUrl }` (technical/forfeit/cancelled/not-played).
These describe evidence, not permission to approve results, invent player scores
or treat an unplayed match as played. Structured phase takes precedence in player
competition classification. Legacy stage classification remains for older data.

Review approval may retain `approvedBy` and an HTTPS `evidenceUrl`. The existing
public projection strips the entire review, including these fields. Adding this
metadata does not release a pending match or alter statistics approval safeguards.

The placement reader uses only explicit final metadata and never parses Chinese
labels. Structured group rows cannot become final places; ranges do not collapse
to a scalar. The legacy scalar reader is retained for unannotated rows to avoid
changing existing published records on deployment. Old archives need an explicit
reviewed metadata update to resolve that historical ambiguity.

## S5 reproducible review package

Run `node --import tsx scripts/prepare-s5-metadata.ts` to regenerate
[the review package](imports/s5-metadata-review.json) from the checked-in approved
standings (publication revision 9), reviewed-import package and MP snapshot.
It covers 12 placement records, 34 matches and 332 raw games. It preserves accepted
joint 5th/7th places and the unsorted 9–12 range without parsing group labels.
It lists candidate pools and unknown/outside-roster UIDs for every game, leaving
all game reviews pending. This package is explicitly non-importable and never
connects to a database or modifies production.

The old MP snapshot lacks accuracy/combo/hit counts. Use the existing normalized
statistics importer to obtain full records, review warmups/replays/non-participants
and publish through edition Admin approval. Pool membership alone is insufficient
to choose scoring games. Unknown UIDs can be unresolved participants, so the report
never automatically excludes them. Confirm the current saved revision before
applying standings metadata; do not replace a live approved archive with the
checked-in pending-review import package.

## Outstanding acceptance

S5 statistics import/review/publication, the 15 unknown identities and official
schedule time zone remain unresolved. `publication.timeZone` alone does not prove
that original schedule cells used that zone. S4/S7/S8 final-ranking approval,
S9 cross-group placement, S10 unplayed fixtures and statistical exceptions,
and official dates/stage windows for every season require authoritative evidence.
No missing dates, UIDs, score decisions or approvals are fabricated here. The
statistics snapshot exception model is unchanged; a future structured replacement
needs explicit migration and command/release validation, not merely a type field.

This is the contract/preparation portion of #610. The issue must remain open until
reviewed data is applied and the public season/match/player acceptance checks pass.

## Verification — 2026-10-31

Node 24.22.2 and `npm ci` were used in an isolated checkout based on main
`3e92a17c`. The full DB-free test run passed 1,371 tests, with 646 skipped
(including unavailable database integration coverage); the final focused archive,
player and read-contract run passed 45 tests. `npm run read-api:generate`, the
contract drift check, `npm run build`, `git diff --check` and the production
dependency audit (zero vulnerabilities) passed. A first restricted-environment
full run hit deployment/listener/lock failures; the normal-permission rerun above
passed. No isolated test database was configured, so database integration and
full desktop/mobile application E2E were not performed. These results do not
establish production import, publication, organizer acceptance or CI success.
