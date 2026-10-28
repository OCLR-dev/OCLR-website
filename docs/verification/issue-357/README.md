# Staff assignment interface (#357)

Local synthetic verification on 2026-10-28 (Asia/Taipei), for
[#357](https://github.com/OCLR-dev/OCLR-website/issues/357).
The comparison starts from main `7b402d64c4793bf0d400ded3bdb3ceabefb4e119`.
The implementation is on `codex/357-staff-role-ui`; the issue records its commit
and current CI evidence. This is not deployment or organizer acceptance evidence.

## Changes

- Granting and editing use the same visible checkbox grid, role descriptions and
  compact submit row. Developer's explicit global read-only grant remains clear.
- Granting retains the verified osu! ID and authorized scope selector. Editing
  shows the recipient, edition name/global scope and saved role set separately
  from pending selections. Changes still require the existing confirmation.
- Saving disables repeat submission, reports success, and retains server/network
  errors across a server refresh. A changed grant set remounts only the editable
  fields so stale selections are replaced with actual saved roles.
- About visibility and revocation have their own section. Each saved role's
  publication state and actions share a row; these actions never save pending
  checkbox changes. Existing confirmation and visibility concurrency checks stay
  in place.
- The server services, API payloads, edition authorization, grant-ID checks,
  transactional saves/audits and publication rules are unchanged. The grant form
  also rejects unsafe integer IDs and unavailable write scopes locally.

The layout follows the project's
[Refactoring UI skill](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md)
and its hierarchy, layout/spacing and typography references, using the existing
MainSheet tokens and appearance registry.

## Before / after

These are element screenshots of the real `/admin/staff` page in Traditional
Chinese, default appearance, light mode. The viewport is 1440, 390 or 320 CSS
pixels wide; the screenshots themselves have the form/card's width. The fixed
site header and skip link are hidden only during capture so fixed navigation
cannot cover the scrolled card.
Both versions use the same synthetic identity/roles. The recipient for the
grant form is synthetic; no real staff grant or public profile is changed.

| Flow  | Viewport | Before                          | After                         |
| ----- | -------- | ------------------------------- | ----------------------------- |
| Grant | 1440px   | [Before](before-grant-1440.png) | [After](after-grant-1440.png) |
| Edit  | 1440px   | [Before](before-edit-1440.png)  | [After](after-edit-1440.png)  |
| Grant | 390px    | [Before](before-grant-390.png)  | [After](after-grant-390.png)  |
| Edit  | 390px    | [Before](before-edit-390.png)   | [After](after-edit-390.png)   |
| Grant | 320px    | [Before](before-grant-320.png)  | [After](after-grant-320.png)  |
| Edit  | 320px    | [Before](before-edit-320.png)   | [After](after-edit-320.png)   |

## Automated coverage

`tests/e2e/staff-role-ui.spec.ts` exercises both desktop and mobile sessions:

- Multiple-role grant, keyboard selection, scope changes removing Developer,
  confirmation/cancellation and prefilled editing after reload.
- Pending/disabled controls, a rejected save and retry, success and unchanged
  states, stale grant-set rejection and refresh to actual server roles.
- Independent show/hide and confirmed revoke operations; the same user's other
  edition remains intact.
- Both forms in `zh-Hans`, `zh-Hant` and `en`, light/dark, every appearance from
  `src/lib/preferences.ts` (13 at this revision), and 1440/390/320px viewports.
  Checks cover page and control/description overflow, 44px control hit areas,
  and axe WCAG 2 A/AA in English for every appearance and brightness.

The existing role-set, authorization, public staff, Developer and read-channel
tests remain applicable. Test services use a new loopback-only PostgreSQL 17
cluster and separate `oclr_test_357` / `oclr_test_357_preview` databases; no
existing demo, private backend, OAuth account or production service is used.

Verification with Node.js 24.22.1 and PostgreSQL 17:

- `npm ci`, `npm run check`, `npm run build`: passed.
- `npm run i18n:extract` and `npm run test:i18n`: passed (4 tests).
- `npm test`: 168 files passed; 1,348 tests passed and one skipped.
- `npm audit --omit=dev`: zero vulnerabilities.
- The desktop/mobile grant/edit state tests passed (2 tests). The full browser
  regression was started separately (928 remaining tests, including the final
  appearance matrix). Its completed result and commit-specific CI evidence are
  recorded on #357; the coverage inventory alone does not establish a pass.
- `git diff --check`: passed.

## Chinese wording review

These new interface messages are implemented in the existing next-intl catalogs
and await organizer review. Automated checks do not approve the wording.

| English                                                                       | 简体中文                                                           | 繁體中文                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Admin                                                                         | 管理员                                                             | 管理員                                                             |
| Saved roles                                                                   | 已保存职务                                                         | 已儲存職務                                                         |
| Global read-only access. Requires an explicit Developer grant.                | 全局只读访问，须明确授予 Developer 职务。                          | 全域唯讀存取，須明確授予 Developer 職務。                          |
| Full access within the selected scope.                                        | 拥有所选授权范围内的全部权限。                                     | 擁有所選授權範圍內的全部權限。                                     |
| Roles saved.                                                                  | 职务已保存。                                                       | 職務已儲存。                                                       |
| No unsaved changes.                                                           | 没有待保存的修改。                                                 | 沒有待儲存的修改。                                                 |
| Unsaved changes. Review and confirm to apply.                                 | 有待保存的修改，请核对并确认后应用。                               | 有待儲存的修改，請核對並確認後套用。                               |
| Review and confirm to apply.                                                  | 核对并确认后才会应用。                                             | 核對並確認後才會套用。                                             |
| About visibility and revocation                                               | 关于页面公开状态与职务撤销                                         | 關於頁面公開狀態與職務撤銷                                         |
| These actions apply to saved roles independently of the role selection above. | 以下操作分别作用于已保存的职务，与上方职务选择的保存操作相互独立。 | 以下操作分別作用於已儲存的職務，與上方職務選擇的儲存操作相互獨立。 |
