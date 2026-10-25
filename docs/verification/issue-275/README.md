# #275 Global contributor management

`/admin/contributors` manages one ordered directory with explicit public/hidden state. A single revision-checked save persists additions, edits, removals and ordering atomically with a site audit event. New entries are hidden. Display names remain literal; osu! links are derived from validated numeric IDs. The directory neither requires a login identity nor changes staff roles. Global Admins can write; Developers can read; edition-only Admins cannot access the global directory.

About now reads only published minimal identities from that directory. Migration `0043_contributor_directory` preserves qi_e and Muziyami in the former order, without recreating entries on a repeated initialization after removal.

Verification performed with isolated PostgreSQL test databases:

- Contributor service/HTTP integration: 9 tests passed, covering publication, ordering, edits/removal, repeat submission, permissions, invalid/duplicate identities, concurrent updates, atomic audit rollback, authentication and same origin.
- Contributor migration test: passed, including repeat migration/initialization after removal.
- i18n extraction and `npm run test:i18n`: passed (4 tests). New Chinese management copy still requires organizer review.
- Desktop 1440px, mobile 390px and 320px visual previews; default/cute-pastel/swiss-minimal light/dark had no horizontal overflow. Screenshots inspected: [desktop](desktop.png), [mobile](mobile.png), [320px](narrow.png).
- `git diff --check` passed. Batch non-e2e checks will be reported in the PR. Local e2e explicitly skipped by the organizer; no deployment performed.
