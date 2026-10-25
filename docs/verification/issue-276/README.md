# #276 Numeric season ordering

A shared comparator reads only the existing season field as an integer and sorts descending, with a stable slug tie-breaker. Missing/nonnumeric seasons follow numeric seasons. The authorized operations list supplies both the accessible list, tournament management search/filter results and the admin tournament selector. Public/private API collections and remote frontend collections use the same comparator before pagination/display.

Unit and isolated PostgreSQL integration checks passed: 19 tests across two files, including S7–S12, future seasons, missing/large values, scoped permissions, public visibility and collection pagination. No tournament data is rewritten.

Synthetic actual-page screenshots: [desktop accessible](desktop-accessible.png), [management](desktop-management.png), [selected tournament](desktop-selected.png); [mobile accessible](mobile-accessible.png), [management](mobile-management.png), [selected tournament](mobile-selected.png). The selector retained `visual-s9` while options followed S11 → S10 → S9 → S8 → S7 (the other two previews also use season 11 and retain deterministic slug ordering within that season).

`git diff --check` passed. Local e2e skipped by explicit organizer instruction; batch non-e2e checks and CI status are reported in the PR.
