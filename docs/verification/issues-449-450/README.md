# Player message read ordering and conflict recovery (#449, #450)

Base: upstream main `25b7fc1`. The changes are local and are not deployment or
maintainer acceptance evidence.

## Behavior

- Each list read has a generation. Only the newest read can update the board or
  report a load error. Successful POST/PATCH/DELETE responses invalidate all older
  reads; POST/PATCH retain the confirmed message selection, including before the
  initial lazy GET completes.
- An edit conflict blocks saving the stale version. Reloading disables actions
  until the read finishes. A successful reload ends the old edit session, shows
  the latest message and preserves a copyable draft. Only **Edit latest message
  with this draft**, followed by Save, submits that draft against the new version.
  **Discard draft** cancels recovery. A failed reload keeps the original edit and
  draft; an unavailable/deleted message leaves only the recoverable draft.
- Server permissions, version checks, text limits, rate limits and POST request
  IDs are unchanged. No write is repeated to repair the list display.

## Local checks (2026-10-28, America/Los_Angeles)

- `npm ci`: passed (Node 24.19.0, npm 11.17.0).
- `npm run check`: passed, without warnings on the final source.
- `npm run build`: passed.
- `npm audit --omit=dev`: zero vulnerabilities.
- `npm run i18n:extract` and `npm run test:i18n`: passed (4 tests).
- Focused player-message-board, beatmap-cache, beatmap-attributes and i18n unit
  tests: 14 passed.
- `npm run test:components -- --workers=2`: 22 passed, Chromium desktop and
  mobile. These run the actual component, React, next-intl and loading component
  in a loopback-only browser host with synthetic intercepted HTTP. They cover late
  initial GET success/failure after POST, late reads after PATCH/DELETE, reversed
  GET completion order, player isolation, conflict -> reload -> explicit version-2
  edit/save, unavailable messages, failed reloads, and Chinese draft discard.
  The host does not expose a route or authentication bypass in the application.
- Full `npm test`: 945 passed, 58 failed, 492 skipped; 116 files passed, 11 failed,
  58 skipped. Failures concern Bash execution/symlink permissions, Python replay
  and archive tools, private media paths, and generated read-contract comparison
  (the local checked-out JSON contains CRLF). These are outside the changed
  message component. This is **not** a full-suite pass.
- Database integration and full desktop/mobile application E2E were not available:
  no `TEST_DATABASE_URL` was supplied and the Docker engine is stopped. Component
  browser coverage does not replace backend or authenticated application E2E.
- No CI run or production deployment was performed by this session.

## New Chinese wording for organizer review

Catalog completeness and browser behavior were verified; substantive wording
still awaits organizer review under the repository instructions.

| English                                                                                | 简体中文                                               | 繁體中文                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Review the latest message before applying your saved draft.                            | 请先查看最新留言，再决定是否套用保留的草稿。           | 請先查看最新留言，再決定是否套用保留的草稿。           |
| This message is no longer available. Your unsaved draft is kept below for you to copy. | 这条留言已无法查看。未保存的草稿保留在下方，供你复制。 | 這則留言已無法查看。未儲存的草稿保留在下方，供你複製。 |
| Latest message                                                                         | 最新留言                                               | 最新留言                                               |
| Your unsaved draft                                                                     | 未保存的草稿                                           | 未儲存的草稿                                           |
| Edit latest message with this draft                                                    | 用此草稿编辑最新留言                                   | 用此草稿編輯最新留言                                   |
| Discard draft                                                                          | 丢弃草稿                                               | 捨棄草稿                                               |
