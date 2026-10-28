# Admin overview tournaments (#397)

The overview now searches and paginates the complete authorized collection,
with compact cards and independent URL state. See the [workflow documentation](../../tournament-management.md#overview-tournament-list-397).

## Same-viewport comparison

Both versions use the same 29 synthetic editions, including long names,
published/draft records, three statuses and a historical archive. Before is main
`0625e8db8ccc1aaa6bf8b8e504d96d38aef3f6cb`; after is this implementation.
English/default/light and browser viewport sizes are identical: desktop
1280 × 720, mobile 390 × 664. Screenshots target the accessible-tournament section.
Mobile images are equally downsampled from device pixels to CSS-pixel width.

| View    | Before                        | After                       |
| ------- | ----------------------------- | --------------------------- |
| Desktop | [Before](desktop-before.webp) | [After](desktop-after.webp) |
| Mobile  | [Before](mobile-before.webp)  | [After](mobile-after.webp)  |

The previous list permanently stopped at six full-width cards. The new layout
uses multiple desktop columns, one mobile column and 12 rows per page. All 29
editions are reachable in existing season order, with a five-item tail page.
These fixtures and images are synthetic and do not establish any real account's
edition count or production state.

## Verification scope

Local verification on 2026-10-28 uses Node.js 24.22.1 and isolated PostgreSQL 17
test databases. Lint/types, production build and i18n extraction/checks passed;
the production dependency audit reports zero vulnerabilities. The full
unit/integration run passed 173 files, with 1,397 tests passed and one skipped.
All six focused desktop/mobile overview tests and both remote/database parity
tests passed on the final layout. All 28 desktop/mobile core browser cases
passed as well. Commit-specific CI results are recorded with the delivered issue
evidence.

Model/browser checks cover
empty, single-page and multi-page collections; full-set name/status/combined
filtering; partial tail pages; stable non-duplicated traversal; refresh, back,
direct links and filter reset; malformed/out-of-range pages; legacy registration
redirects; scoped and global Developer access, revocation and denied writes.
Desktop/mobile appearance checks cover 3 locales × 13 registered appearances ×
2 brightness settings × 2 viewports (156 combinations), including long names,
touch target sizes, keyboard focus, horizontal overflow and Axe. Separate remote
browser checks compare names, counts and pagination URLs with database mode and
verify that the frontend never connects to local PostgreSQL.

The design follows the project's [Refactoring UI skill](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md)
and its hierarchy, layout/spacing and typography references, within existing
MainSheet tokens and appearances. Authorization services and business writes are
unchanged.

## Chinese wording awaiting organizer review

| English                | 简体中文               | 繁體中文               |
| ---------------------- | ---------------------- | ---------------------- |
| {count} tournament(s)  | 共 {count} 项赛事      | 共 {count} 項賽事      |
| Tournament pages       | 赛事分页               | 賽事分頁               |
| Page {page} of {pages} | 第 {page} / {pages} 页 | 第 {page} / {pages} 頁 |

CI, organizer wording/visual acceptance and deployment remain separate evidence.
