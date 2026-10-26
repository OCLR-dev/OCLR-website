# S10 — Skyline Pop / 晴空未來城

追蹤：[#195](https://github.com/OCLR-dev/OCLR-website/issues/195)。

2026-10-26 更新：依主辦方要求，以目前已實作的九款 appearance 重新整理 S10 設計。參考基準為 canonical main `3a75c5beca7b3d7e8d3b073802d7cc82f3a472d9`。本季仍是**待審閱的離線樣本**，不代表正式接入或賽事預設外觀已核准。

## 設計主張

**視覺：奶油紙面、晴空藍導視與完整 S10 插畫，組成一本明亮、俐落的城市賽事手冊。** 蜜桃色只出現在插畫後的斜角色帶。夜間版使用深藍實色資料面與亮青互動色，保留同一套層級。

內容順序：S10 主視覺與賽季定位 → 比分與圖池摘錄 → 來源註記；賽程、圖池與 Admin 分頁直接呈現工作內容。設計說明與色票放在最後，不混入比賽資料。Admin 使用一個有限寬度的表單，輔助說明放在旁邊。

互動主張：主視覺一次性淡入；賽季導覽隨捲動置頂；操作有輕量 hover／press 回饋。方向鍵、Home／End 切換分頁；主視覺按鈕直接打開目標分頁並將焦點移到相應 tab。`prefers-reduced-motion` 停用進場、平滑捲動與轉場，沒有持續動畫。

## 如何參考現有 theme

以下對照的是 `src/lib/preferences.ts` 已註冊的外觀和 `src/app/*-theme.css` 的實作，不把 backlog 或其他季樣本當作已上線功能。

| 現有 appearance     | S10 採用的原則與自己的處理                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `default`           | 延續 MainSheet 的文字／surface／raised／tint 層級、實色表單、tabular 數字及開放式頁面標題。沿用正式 OCLR Logo 的明暗資產。 |
| `cute-pastel`       | 延續溫和色面和完整原圖；S10 用奶油與晴空藍，系統字體、6px 控制項及較緊湊的資料列，狀態標籤才用膠囊。                       |
| `swiss-minimal`     | 採用細分隔線、明確對齊、主次操作及留白；以藍色導視和 16px 表單面板保留 S10 的親和感。                                      |
| `claymorphism`      | 沿用工作區與資料列的層級分工；S10 用平整紙面，沒有黏土浮雕或 inset 陰影。                                                  |
| `manga-halftone`    | 借鑑裝飾與資料分層；斜角色帶限於 hero 的背景層，文字、焦點與原圖不裁切、不旋轉，不加入網點或漫畫字。                       |
| `glassmorphism`     | 保留「閱讀不依賴特效」的原則；S10 所有資料、導覽與輸入面都為實色，不使用 blur 或透明玻璃。                                 |
| `esports-broadcast` | 延續動作、選取、狀態色分工；S10 藍色負責操作與選取，蜜桃色負責裝飾。歷史賽季不顯示 live 狀態，不挪用 OBS 樣式。            |
| `retro-arcade`      | 參考數字對齊及不靠顏色單獨表達狀態；保留勝方底線、選取底線及狀態文字，使用系統字而非像素字。                               |
| `frutiger-aero`     | 延續晴空色與可閱讀實色資料列；S10 使用平面斜角色帶、方圓控制項，沒有亮面膠囊、球體或整頁天空漸層。                         |

本次調整的重點不只是換色：舊版統一樣本的 `OCLR.` 文字標改為既有官方 Logo；Overview 使用全幅主視覺與清楚的資料紙面；導覽移到主視覺之前並置頂；進入其他分頁時收起 hero；Admin 額外展示成功、警告與錯誤的獨立語意。

## 原圖與內容

[原始 S10 主視覺](../../../../public/archive/s10/thumbnail.png) 為 1024×1024。保持透明背景、完整 1:1 和所有原圖文字；不重繪、不裁切、不調色、不合成角色或背景。斜角色帶是原圖後的 CSS 裝飾，`pointer-events: none`。

兩場對局、三張譜面、隊數、圖池數與年份沿用原樣本及 `docs/imports/s10-archive.json` 的離線摘錄。名稱、比分、原表 UTC+8 時間、譜面文字與歷史星數保持原值；沒有補造賽果、選手資料或新規則。歸檔快照不能作為正式站發佈或資料授權的證據，不作 production seed。

## 元件與響應式規格

- 間距：4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px。內容最大 1280px；窄版邊距 16px。不新增字體或套件。
- 系統無襯線；內文 16px / 1.65，輔助資料 12–14px。窄版賽程日期 11px、單行顯示；不縮小隊名或表單文字。比分與星數使用 tabular figures。
- 面板 16px，按鈕與欄位 6px，短 slot 4px；膠囊限於狀態標籤。選取有底線／內框，焦點為 3px 外框加 4px offset；勝方比分有底線，不只改顏色。
- 1000px 以下導覽分兩列、移除次要歸檔側欄；600px 以下 hero 上下排列、完整插畫最大 300px，表單與狀態 specimen 單欄。四個 tabs 均維持至少 44px 高。
- 比分與圖池使用實色 `data-sheet` 及 1px 細線；不為每一列加陰影。表單單獨成面板，輸入框邊界和焦點不靠陰影。
- forced colours 移除裝飾，保留系統色邊界與 Highlight 選取外框；亮／暗都不用 blur，也不依賴透明度。成功、警告、錯誤各帶明確文字與邊線。

樣本的 sticky bar 是獨立 review 導覽，不模擬登入／全站選單。未來接入須沿用目前正式 `.event-context`、`--tournament-header-height`、`--tournament-scroll-offset` 與實際量測，不以原型的 `top: 0` 覆蓋全站 header 和章節錨點。

## 候選 MainSheet tokens

明亮的插畫色不直接用作內文字色。藍色主按鈕使用深藍字；hover 變亮，兩個模式共用同一動作語彙。蜜桃色完全獨立於 success／warning／danger。

| Token                     | Light     | Dark      |
| ------------------------- | --------- | --------- |
| `--site-background`       | `#fffcf4` | `#102536` |
| `--site-surface`          | `#ffffff` | `#173044` |
| `--site-raised`           | `#f0f6f8` | `#203e53` |
| `--site-tint`             | `#dcf2fc` | `#20465c` |
| `--site-header`           | `#fffcf4` | `#102536` |
| `--site-foreground`       | `#173c59` | `#e7f5ff` |
| `--site-muted`            | `#496276` | `#adc5d7` |
| `--site-secondary-text`   | `#355772` | `#cae2f2` |
| `--site-accent`           | `#006c98` | `#79d9ff` |
| `--site-accent-strong`    | `#005477` | `#a0e5ff` |
| `--site-border`           | `#ccdae0` | `#3d596d` |
| `--site-control-border`   | `#66889d` | `#7596ac` |
| `--site-primary`          | `#26b6e8` | `#79d9ff` |
| `--site-primary-hover`    | `#71d4f4` | `#a0e5ff` |
| `--site-on-primary`       | `#10344b` | `#10344b` |
| `--site-focus`            | `#006c98` | `#79d9ff` |
| `--site-selection`        | `#b9e6fa` | `#355b72` |
| `--site-success`          | `#17644b` | `#72e3bc` |
| `--site-warning`          | `#875505` | `#f0cb83` |
| `--site-danger`           | `#a4254a` | `#ff9eaf` |
| `--hero-background`       | `#eaf7ff` | `#142c40` |
| `--skyline-sky`（裝飾）   | `#bce9fa` | `#204c65` |
| `--skyline-peach`（裝飾） | `#ffd3d9` | `#563b51` |
| `--button-radius`         | `6px`     | `6px`     |
| `--radius-panel`          | `16px`    | `16px`    |

`--site-border` 只用於資料分隔，不替代控制框；`--site-control-border` 才承擔可操作欄位邊界。後續接入仍繼承現有 mod、賽果與權限語意，不能將所有狀態染成藍色。

## 可審閱成果

- [可操作樣本](../s10.html)、[S10 CSS](../s10.css)、[S10 review renderer](../s10.js)
- [桌面 Light](desktop-light.webp) / [Dark](desktop-dark.webp)
- [手機 Light](mobile-light.webp) / [Dark](mobile-dark.webp)
- [Admin 桌面 Light](admin-desktop-light.webp) / [Dark](admin-desktop-dark.webp)
- [Admin 手機 Light](admin-mobile-light.webp) / [Dark](admin-mobile-dark.webp)
- [本季驗證報告](verification.json)
- [對比度與輔助操作補充報告](accessibility.json)

完整 checkout 可直接開啟 HTML；或依 [共用說明](../README.md) 啟動獨立 loopback 靜態伺服器。`?theme=dark` 可直接檢視暗版。所有互動只在記憶體，不寫 API、DB、cookie 或 localStorage。

## 樣本驗證與接入邊界

2026-10-26：Node.js 24 執行 `node docs/design/season-themes/verify.mjs s10`，320 / 390 / 768 / 1440px × 明暗共 8 組，16 次 Overview／Admin Axe AA 掃描無違規。完整原圖、圖片載入、頁面溢出、明暗切換、sticky 導覽、44px 控制項、鍵盤分頁、表單預覽與重設通過。重新產生八張預覽；本季 JSON 記錄本次結果，2026-10-24 的全四季報告仍為歷史證據。

另以本機 Chrome 檢查 320 / 390 / 768 / 1024 / 1440px × 明暗共 10 組：hero 目標分頁／焦點、Home 回到 overview、必填欄位、reduced motion、forced colours 均通過；320／390px 的完整 hero 可在 844px 高視窗內呈現。依 computed tokens 計算 74 組實色對比：一般文字與按鈕文字 ≥4.5:1，欄位邊界與焦點 ≥3:1，包含圖說在藍／桃色裝飾底上的最差情況。這是固定 token 的數值檢查，不涵蓋原圖內嵌文字或正式應用的所有狀態。S9／S8／S7 只補做圖片載入與 Admin 分頁 smoke，沒有重跑它們的完整 Axe 矩陣。

設計方法依專案指定的 [Refactoring UI skill](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md)，並參考其 hierarchy、layout-spacing、typography、color、depth-and-polish；使用本專案既有 MainSheet 與 appearance 實作限制。這些檢查只涵蓋離線設計樣本，不證明正式應用回歸、三語、CI 或部署驗收。

後續正式接入仍需另行指定：

- [ ] 主辦方確認明暗、手機與 Admin 方向；中文名稱與未來正式文案另經三語 catalog／中文措辭審閱。
- [ ] 重用既有 React 元件、MainSheet tokens、appearance 白名單、schema、header 選單、Global Admin 預設及 edition `defaultAppearance`；未知值安全回退。
- [ ] 保留訪客 cookie → 當前授權／已發佈賽事預設 → 全站預設、清除繼承、SSR 首屏與獨立 light/dark。非賽事頁不繼承上次賽季；不自動修改歷史賽事設定。
- [ ] 驗證全部九款既有 appearance，公開／登入／Admin／Player／Captain、三語、長名稱、320 / 390 / 768 / 1024 / 1440px、選單、錨點、空／錯誤／焦點狀態及 reduced motion；OBS／presenter 保持隔離。
- [ ] 實際應用文字 ≥4.5:1、控制邊界／焦點 ≥3:1，附真實截圖；不能以靜態樣本取代。
- [ ] 正式接入批次執行專案完整檢查及 i18n extract/test；DB 測試僅使用隔離 test DB。授權、資料發佈、OAuth／deep links、CI 和部署各自驗證。
