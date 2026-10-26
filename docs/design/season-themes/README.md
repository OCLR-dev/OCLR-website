# S10 / S9 / S8 / S7 theme samples

2026-10-24 主辦方要求：根據四季原始主視覺設計對應風格，分別提交 issue：[S10 #195](https://github.com/PhoenixEmik/OCLR-website/issues/195)、[S9 #196](https://github.com/PhoenixEmik/OCLR-website/issues/196)、[S8 #197](https://github.com/PhoenixEmik/OCLR-website/issues/197)、[S7 #198](https://github.com/PhoenixEmik/OCLR-website/issues/198)。

這是一組**待審閱的離線設計樣本**，不會出現在正式路由、外觀選單或 Admin 設定。沒有資料庫、API、cookie、localStorage、外部字體或新套件。介面標籤以英文展示，中文為設計註記；正式接入須沿用 next-intl 的 `zh-Hans`、`zh-Hant`、`en`，不將此原型的文字直接搬入產品。

2026-10-26：依主辦方新要求更新 [S10 #195](https://github.com/OCLR-dev/OCLR-website/issues/195)，對照目前九款已註冊 appearance，採用奶油紙面、晴空藍導視、正式 OCLR Logo、置頂賽季導覽及獨立工作分頁。詳見 [S10 設計與 theme 對照](s10/DESIGN.md)。其他三季保留原樣；四季仍待設計審閱。

| Season | 提案                        | 可操作樣本           | 設計規格                | 預覽                                                                                              |
| ------ | --------------------------- | -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| S10    | Skyline Pop · 晴空未來城    | [s10.html](s10.html) | [Design](s10/DESIGN.md) | [Light](s10/desktop-light.webp) / [Dark](s10/desktop-dark.webp) / [Mobile](s10/mobile-light.webp) |
| S9     | Glacier Blue · 冰晶鈷藍     | [s9.html](s9.html)   | [Design](s9/DESIGN.md)  | [Light](s9/desktop-light.webp) / [Dark](s9/desktop-dark.webp) / [Mobile](s9/mobile-light.webp)    |
| S8     | Sakura Circuit · 櫻花折線   | [s8.html](s8.html)   | [Design](s8/DESIGN.md)  | [Light](s8/desktop-light.webp) / [Dark](s8/desktop-dark.webp) / [Mobile](s8/mobile-light.webp)    |
| S7     | Graphite Arena · 石墨競技場 | [s7.html](s7.html)   | [Design](s7/DESIGN.md)  | [Light](s7/desktop-light.webp) / [Dark](s7/desktop-dark.webp) / [Mobile](s7/mobile-light.webp)    |

## 開啟樣本

從完整 checkout 直接用瀏覽器開啟任一 `.html`；所有資產皆為相對路徑。若瀏覽器限制 `file:`，可從 repo 根目錄執行 `python3 -m http.server 3199 --bind 127.0.0.1`，再進入 `/docs/design/season-themes/s10.html`。這是獨立靜態預覽，與 demo / production 程序無關。

- 頂端 S10 / S9 / S8 / S7 切換提案；Light / Dark 即時切換，`?theme=dark` 可直接檢視深色。
- Overview / Schedule / Mappools / Admin sample 是可操作分頁，支援方向鍵、Home、End。
- Admin sample 提供輸入、選擇、預覽、重設和停用狀態。預覽只顯示本機提示，沒有儲存或請求。
- MP 與譜面連結指向既有公開 osu! 網址。

## 圖片與資料

四張圖均使用 repository 的既有原始檔，不裁切、不重繪、不調色。S10 保留透明背景與 1:1，S9 / S8 / S7 保留完整 16:9。原圖的歷史英文副標保持原樣；介面名稱使用官方 **osu! Chinese League Rookie (OCLR)**。

對局、隊名、比分與三張譜面摘自各季已提交的 `docs/imports/s*-archive.json`，只內嵌顯示必要欄位；沒有報名、聯絡資料、逐圖成績或猜測的賽果。S7 的 2021–2022 來自歸檔賽程；S9 / S8 的季節字樣沿用原圖。這些資料是離線快照，**不證明正式站發佈或授權狀態**。不得用原型資料 seed 正式環境。

## 共用設計與接入邊界

先以相同比賽、圖池及表單層級確立結構，再分季調整語意色、角度、線條與圓角。`sample.css` / `sample.js` 是 review-only 組合；更新後的 S10 使用共用基礎 CSS 與獨立 `s10.js`，不改其他季樣本。所有樣本用現有 MainSheet `--site-*` token 命名對照，並非正式 React 元件實作。各季 CSS 的明暗 token 表是候選值，**尚未加入正式白名單**。

正式接入若獲後續授權，應擴充既有外觀系統與元件，不建立另一套前端；保留目前九款外觀（default / cute-pastel / swiss-minimal / claymorphism / manga-halftone / glassmorphism / esports-broadcast / retro-arcade / frutiger-aero）、SSR 首屏、獨立 light/dark，以及「訪客 cookie → 當前有權限／已發佈賽事 defaultAppearance → 全站預設」優先序。清除訪客偏好跟隨當前路由的預設；非賽事路由不繼承上一季。外觀不能改變資料授權、發佈、OAuth/deep link 或 OBS / presenter。

設計依據：[Refactoring UI skill](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 與 hierarchy / layout-spacing / typography / color / depth-and-polish 參考；套用於原有 MainSheet 層級、系統字體、16px 內文、44px 控制項與有限間距尺度。動效僅為進場與 hover / press 回饋；reduced motion 關閉。

## 樣本驗證

執行 `node docs/design/season-themes/verify.mjs`（既有 Playwright、Axe、Sharp 與本機 Chrome）。輸出 `verification.json` 及每季八張 WebP：桌面／手機 overview 與 Admin，各自明暗。驗證包括 320 / 390 / 768 / 1440px × 四季 × 明暗、圖片載入、頁面溢出、分頁鍵盤、表單預覽與重設、overview / Admin Axe AA 掃描。

使用 Node.js 24；可指定 `node docs/design/season-themes/verify.mjs s10` 只重驗 S10，寫入該季報告與八張預覽，不覆蓋歷史全批次報告或其他季預覽。S10 額外檢查完整 1:1 主視覺、sticky 導覽、44px 控制項與工作分頁收起 hero；Admin 預覽為完整頁面。

這是設計樣本的視覺與互動檢查，**不是正式應用的回歸、資料庫／整合測試、production build 或部署驗收**。正式接入時必須另外執行專案完整批次驗證，並審閱三語、長名稱、公開／登入／Admin／Player／Captain、外觀選單及所有繼承／清除狀態。

2026-10-24 原批次結果：**32 組 viewport／明暗組合與 64 次 Axe AA 掃描通過，零違規／零頁面錯誤／零資產請求失敗**。四季共 32 張 WebP 預覽圖；共用 `verification.json` 保留該次歷史結果。

2026-10-26 S10 更新結果：**8 組 viewport／明暗組合、16 次 Axe AA 掃描通過，零違規／零頁面錯誤／零資產請求失敗**；八張 S10 預覽與 [本季報告](s10/verification.json) 已更新。S10 renderer 與驗證腳本 ESLint 為 0 errors、0 warnings；其他三季只做圖片／Admin 分頁 smoke，未重跑完整驗證矩陣。
