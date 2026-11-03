# #766 配置依賴一鍵核對

使用實際 RefereePanel、合成 HTTP 工作區與獨立 PostgreSQL 17 loopback 測試資料庫驗證，未使用真實場次、帳號、憑證或外部 osu!／Bancho。

## 行為

- `#referee-dependencies` 導向並聚焦核對區，載入不寫入；單擊／快速雙擊只產生一次最新資料讀取及一次核對請求。
- 使用最新 revision／fingerprint；已相符時不新增事件。衝突、讀取失敗及新出現的選禁步驟不回報成功。
- 儲存回應遺失時保留相同 requestKey／payload 重試，只追加一次事件。只讀、模擬與已記錄步驟保護仍有效。
- 延續既有後端 stale → 撤銷 → 明確核對的整合案例，不自動撤銷或發送 IRC。

## 畫面

以下為實際元件合成截圖，使用現有繁中訊息，核對區零 Axe 違規。三語各驗證明暗；手機檢查 320×720 無橫向溢位，按鈕及焦點可見。

| 尺寸        | 亮色                      | 暗色                     |
| ----------- | ------------------------- | ------------------------ |
| 桌面        | [畫面](desktop-light.png) | [畫面](desktop-dark.png) |
| 手機 320 px | [畫面](mobile-light.png)  | [畫面](mobile-dark.png)  |

## 驗證記錄

2026-11-03 Node.js 24.22.2：npm ci；npm run check；完整 npm test（270 檔案、2,344 passed／2 skipped）；受影響 Chrome 元件測試 56 passed（桌面／手機）；i18n:extract／test:i18n（4 tests）；read-api:check（57 contracts、182 rows、8 tests）；production audit 0 vulnerabilities。production build 與最終 diff 結果於 PR 記錄。

按 repository 規則未執行耗時的全站／所有外觀 E2E 矩陣；本次定向 browser 驗證涵蓋新增錨點、焦點、核對互動及既有 RefereePanel 回歸。這些不是部署、真實網站登入或 Windows／Linux 實機驗收。
