# #277 Dashboard OCLR profile navigation

The identity panel links to `/players/{authenticated osu! ID}` when the existing public-participation reader confirms that the public profile is available. The global dashboard does not infer an edition. Without public participation it shows a localized unavailable explanation, keeping the external osu! profile link. Existing public profile authorization/publication rules are unchanged.

Player cards no longer print the standalone `osu!` text before the OCLR profile link. Captain/team metadata and external username links remain.

Server-rendered navigation tests and i18n checks: 8 passed, covering two authenticated IDs with identical display names, missing statistics, no public participation and the edition-specific card link. The existing public-participation integration coverage remains applicable. Actual synthetic dashboard screenshots: [desktop](desktop-dashboard.png), [mobile](mobile-dashboard.png); both link to the authenticated synthetic ID.

`npm run i18n:extract` and `git diff --check` passed. New Chinese unavailable-state wording awaits organizer review. Local e2e skipped at organizer request; batch non-e2e/CI evidence is recorded in the PR. No private registration data is published to make the link available.
