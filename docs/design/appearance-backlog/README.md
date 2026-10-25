# 未實作的 osu! Cup 參考風格

2026-10-24，主辦方要求比對兩批附件、追蹤未實作風格，分別建立 **P3** issue，抽取 CSS 並補詳細設計說明。本次交付只有參考文件、範例與 backlog；不註冊新外觀或修改賽事設定。

## 盤點結果

檢查基準 `69c4f7746c0c45c4f3b9b089766def09c613aac5`。`src/lib/preferences.ts` 的正式白名單只有 `default`、`cute-pastel`、`swiss-minimal`。B／C 亦分別有 `src/app/swiss-theme.css`、`src/app/pastel-theme.css`，B 的 #146 已完成。未找到 A／D／E／F／G／H 的既有 issue，這六款新增 P3；不改 B／C 的狀態或優先級。

| 批次／代碼 | 風格                          | 現況／追蹤                                                                             | 詳細設計與 CSS                                                                                                                                                                     |
| ---------- | ----------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 第1批 A    | 電競轉播風／Esports Broadcast | 已實作 `esports-broadcast`，[P3 #235](https://github.com/PhoenixEmik/OCLR-website/issues/235) | [現有 CSS](../../../src/app/esports-theme.css) · [Design](esports-broadcast/DESIGN.md) · [原始 CSS](esports-broadcast/source.css) · [轉接範例](esports-broadcast/mainsheet.example.css) · [Preview](esports-broadcast/preview.html) |
| 第一批 B   | 瑞士極簡／Swiss Editorial     | 已實作 `swiss-minimal`，[#146](https://github.com/PhoenixEmik/OCLR-website/issues/146) | [現有 CSS](../../../src/app/swiss-theme.css)；不重開單                                                                                                                             |
| 第一批 C   | 柔和可愛／Soft Kawaii         | 已實作 `cute-pastel`                                                                   | [現有 CSS](../../../src/app/pastel-theme.css)；不重開單                                                                                                                            |
| 第1批 D    | 街機復古風／Retro Arcade      | 已實作 `retro-arcade`，[P3 #236](https://github.com/PhoenixEmik/OCLR-website/issues/236) | [現有 CSS](../../../src/app/arcade-theme.css) · [Design](retro-arcade/DESIGN.md) · [原始 CSS](retro-arcade/source.css) · [轉接範例](retro-arcade/mainsheet.example.css) · [Preview](retro-arcade/preview.html)                     |
| 第2批 E    | 黏土風／Claymorphism          | 已實作 `claymorphism`，[P3 #237](https://github.com/PhoenixEmik/OCLR-website/issues/237) | [現有 CSS](../../../src/app/clay-theme.css) · [Design](claymorphism/DESIGN.md) · [原始 CSS](claymorphism/source.css) · [轉接範例](claymorphism/mainsheet.example.css) · [Preview](claymorphism/preview.html)                     |
| 第2批 F    | 漫畫風／Manga / Halftone      | 已實作 `manga-halftone`，[P3 #238](https://github.com/PhoenixEmik/OCLR-website/issues/238) | [現有 CSS](../../../src/app/manga-theme.css) · [Design](manga-halftone/DESIGN.md) · [原始 CSS](manga-halftone/source.css) · [轉接範例](manga-halftone/mainsheet.example.css) · [Preview](manga-halftone/preview.html)             |
| 第2批 G    | Y2K 水晶風／Frutiger Aero     | 未實作，[P3 #239](https://github.com/PhoenixEmik/OCLR-website/issues/239)              | [Design](frutiger-aero/DESIGN.md) · [原始 CSS](frutiger-aero/source.css) · [轉接範例](frutiger-aero/mainsheet.example.css) · [Preview](frutiger-aero/preview.html)                 |
| 第2批 H    | 毛玻璃風／Glassmorphism       | 已實作 `glassmorphism`，[P3 #240](https://github.com/PhoenixEmik/OCLR-website/issues/240) | [現有 CSS](../../../src/app/glass-theme.css) · [Design](glassmorphism/DESIGN.md) · [原始 CSS](glassmorphism/source.css) · [轉接範例](glassmorphism/mainsheet.example.css) · [Preview](glassmorphism/preview.html)                 |

S7–S10 的主視覺衍生樣本是另一批提案，仍由 [#195–#198](../season-themes/README.md) 追蹤，尚未出現在正式白名單；不把這四款與上述跨賽季材質風格合併或重開單。`default` 是原有設計，不對應本附件中的 A–H。

## 三層材料

1. `sources/batch-1.html`／`batch-2.html`：使用者附件完整原始 bytes，供來源追溯；保留虛構內容、原 CSS 與 Google Fonts 引用，沒有把它們搬進產品或範例執行。附件中的「適合／注意」是作者觀點，不是經驗證的產品需求。
2. 每款 `source.css`＋各批 `sources/batch-*-shared.css`：忠實抽取，不調色或格式化。原型 class 與正式應用不相同；原抽取檔只作參考，不可直接全域匯入。
3. 每款 `mainsheet.example.css`＋`DESIGN.md`：明確標記為新整理的候選，補獨立明暗 token、安全裝飾、焦點、reduced motion、forced colors 及必要透明降級。它們不是原 CSS，也不是正式整站實作。

## 來源紀錄

| 來源                                                     | Bytes | SHA-256                                                            |
| -------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| [osu! Cup 風格預覽.html](sources/batch-1.html)           | 8635  | `9da880c4342b88b0a374543dfdc79f016a3feb5a811d5a8543354f5a6b06f56c` |
| [osu! Cup 風格預覽（第二批）.html](sources/batch-2.html) | 11936 | `da9be1f7462054c7d415dfd26f282e092aed2ad05c472c36d3ad7c8308f5d511` |

原始附件／抽取 CSS 不經 formatter；其餘文件正常格式化。[manifest.json](manifest.json) 記錄來源 hash、CSS-block 行號、候選 tokens 與對應 issue。所有原始 CSS 都可在完整來源 `<style>` 中重新抽取比對。

## 使用與驗證

從完整 checkout 直接開啟各款 `preview.html`，或在 repo 根目錄啟動獨立 `python3 -m http.server 3199 --bind 127.0.0.1`，進入 `/docs/design/appearance-backlog/<style>/preview.html`。樣本標籤以英文示意、設計文件用繁體中文，不改產品的 next-intl catalogs。

範例沒有遠端請求、字體檔、圖片、認證、資料庫或偏好持久化。原始 Google Fonts 宣告只保留於來源快照；正式採用前須驗授權與本地打包，不能把來源連結當已核准依賴。

`verify.mjs` 使用既有 Playwright／Axe／Sharp，僅在 127.0.0.1 上提供本資料夾，驗證 6 款 × 明暗 × 320／390／768／1440px、鍵盤焦點、控制切換、表單、頁面溢出與 Axe AA，另檢查 forced colors 及毛玻璃減少透明降級。原檔與抽取 CSS 的 hash／結構也會核對。結果與截圖為離線 specimen 證據，不能視為真實應用的公開／登入／後台、三語或部署驗收。

正式實作依 [INTEGRATION.md](INTEGRATION.md)，也須遵守專案完整批次驗證與隔離 TEST_DATABASE_URL 要求。新增 issue 保持開啟，等待後續排程；本次沒有開始實作這六個 theme。

設計參照專案指定 [Refactoring UI skill](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 的 hierarchy、layout-spacing、typography、color、depth-and-polish 準則；應用於 OCLR 現有 MainSheet，不引進新 UI 框架。

## 本次實際結果

六款原 CSS 抽取逐字及 hash 比對、12 份來源／候選 CSS 解析通過；48 組 viewport／明暗與 48 次 Axe AA 掃描零違規，6 款 forced-colors 與 H 的 reduced-transparency 降級通過。每款附桌面／手機明暗四張 WebP（共 24 張）。詳見 [完整報告](verification.json) 與各款報告；正式接入仍未開始。

共用 preview／verify JavaScript 的 ESLint 為 0 errors／0 warnings，兩份腳本語法檢查與所有本資料夾內相對文件／資產連結檢查通過。
