# #265 賽事主頁與規則樣式

歷史統計改為緊湊對齊的五列；當前賽事標題、主視覺與階段區移出額外面板。規則入口位於賽事導航最後，當前規則重用歷史 RulesHandbook，保留原文和 `#rules-N` 錨點。移除主頁組織團隊與相關連結重複區塊。

`tournament-overview-alignment.spec.ts` 驗證當前及 S10 歷史頁、正確屆別規則 URL、錨點、全部外觀及明暗、無水平溢出與 Axe。

## 批次驗證（2026-10-25）

- `npm run check`、`npm run test:i18n`、production `npm run build` 通過。
- `npm test`：126 個檔案、901 項通過，1 項既有略過。
- 使用獨立 PostgreSQL：`oclr_265_266_260_test`、`oclr_265_266_260_browser_test`；全部為合成資料，未讀取本機 `.env.local`。
- 三個新增 Playwright 情境在 Chrome 桌面及手機皆通過（6/6）。#265、#260 額外逐一覆蓋三種外觀 × 明暗主題及 Axe WCAG A/AA。
- `npm audit --omit=dev --audit-level=low`：0 漏洞。
- 本機驗證不代表 GitHub CI、正式部署或真實 OAuth/API 驗證；CI 狀態見 issue 更新。

## 截圖

Before：基準 `6f1488b`。After：本次修改；相同合成資料、Chrome desktop / iPhone 13 viewport。#265 使用 default/dark。

- [desktop-overview-test-after.png](desktop-overview-test-after.png)
- [desktop-overview-test-before.png](desktop-overview-test-before.png)
- [desktop-s10-after.png](desktop-s10-after.png)
- [desktop-s10-before.png](desktop-s10-before.png)
- [mobile-overview-test-after.png](mobile-overview-test-after.png)
- [mobile-overview-test-before.png](mobile-overview-test-before.png)
- [mobile-s10-after.png](mobile-s10-after.png)
- [mobile-s10-before.png](mobile-s10-before.png)

## 2026-10-25 瀏覽器註解後續修復

依 S11 四項瀏覽器註解，將標題、Banner、階段、賽程與規則置於同一左欄；唯一的規則目錄從右側頂部開始，隨主內容捲動。移除賽程前方的重複概覽目錄。600px 以上維持左右排版，包含回報約 650px 的寬度；更窄的手機只在 Banner 前提供可展開的規則目錄。規則原文與 `#rules`／`#rules-N` 保持有效。窄主欄的階段文字及操作分行，避免擠壓。

- `npm run check`、production build 通過；未變更介面訊息。
- 隔離 PostgreSQL 測試：127 檔案、910 項通過、1 項既有略過。
- Chrome desktop／iPhone 13：2/2 情境通過；涵蓋當前與 S10、三種外觀 × 明暗、647px 右側目錄幾何位置、階段操作不重疊、錨點、無水平溢出與 Axe。
- Production dependency audit：0 漏洞。CI 狀態另見 issue，未部署。
- [桌面](desktop-unified-right-index-after.png)
- [647px：右側規則目錄](tablet-right-index-after.png)
- [手機：單一可展開目錄](mobile-unified-right-index-after.png)

## 2026-10-25 最新註解：恢復完整上方寬度與下方左側目錄

依最新四項註解，標題、Banner、階段與賽程使用整個頁面內容區寬度。規則目錄恢復至下方規則正文左側；手機在規則區使用可展開目錄。移除賽程外框、背景面板及重複的賽事簡介，保持表格資料、規則內容與錨點。此項為本單目前的版面基準。

- lint/types、production build 通過；production dependency audit：0 漏洞。
- 獨立測試 PostgreSQL 完整回歸：127 檔案、910 項通過、1 項既有略過。
- Chrome desktop／iPhone 13：2/2 通過，涵蓋三種外觀 × 明暗、當前／歷史頁、819px／647px 的 Banner 寬度與目錄位置、透明無框賽程、無重複簡介、錨點跳轉、水平溢出與 Axe。
- 未變更介面訊息；CI 狀態另見 issue，未部署。
- [桌面](desktop-full-overview-left-rules-after.png)
- [819px](tablet-819-full-overview-left-rules-after.png)
- [手機](mobile-full-overview-left-rules-after.png)
