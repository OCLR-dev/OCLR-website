# S2 — Verdant Prelude / 青燕春序

2026-10-29，依 [#416](https://github.com/OCLR-dev/OCLR-website/issues/416) 的主辦方新授權，將候選設計接入正式外觀 `verdant-prelude`，並精修雙燕與葉枝。[PR #446](https://github.com/OCLR-dev/OCLR-website/pull/446) 供審閱；未合併或部署，所有既有預設保持不變。

## 視覺與素材

薄荷水彩紙面、青墨文字與開放圓弧構成全幅 banner。雙燕具彎曲肩部、分層飛羽、細羽軸、剪形尾羽、胸腹柔光及眼部高光。葉枝採三種不對稱輪廓、彎曲主脈、分支細葉脈、局部反光與薄透色階；交錯尺寸及朝向讓枝葉自然延伸。明暗版各自配色，紙面和裝飾向文字區漸淡，資料區保持平整。

保留 MainSheet 原圖／五列統計對齊、規則手冊、文字導覽、44px 控制項與管理側欄。面板12px、控制項8px；系統字體、正常換行，937px與390px另檢查標題。入場160ms、導覽140ms與按壓1px僅在允許動態時啟用；reduced motion停用裝飾動效，forced colours移除紋理。

- [正式樣式](../../../../src/app/verdant-theme.css)
- [明版素材](../../../../public/themes/verdant-prelude/paper-light.svg)／[暗版素材](../../../../public/themes/verdant-prelude/paper-dark.svg)／[來源說明](../../../../public/themes/verdant-prelude/README.md)：本輪自繪SVG，無外部圖片、字型、腳本或網路依賴。
- [完整S2原主視覺](../../../../public/archive/s2/key-visual.avif)：1379×862，原比例、原色、原文不變。
- 本目錄的 `candidate.css`、`paper-light.svg`、`paper-dark.svg` 保留作候選階段歷史參考；正式頁面使用上述 `src`／`public` 檔案。

## Tokens

| Token                   | Light     | Dark      |
| ----------------------- | --------- | --------- |
| `--site-background`     | `#F5FAF7` | `#12231F` |
| `--site-surface`        | `#FFFFFF` | `#1B302A` |
| `--site-raised`         | `#E8F3ED` | `#274138` |
| `--site-foreground`     | `#244A43` | `#EDF6F0` |
| `--site-muted`          | `#526D63` | `#B5CBBF` |
| `--site-accent`         | `#2D634D` | `#9BCFC1` |
| `--site-primary`        | `#397B60` | `#9BCFC1` |
| `--site-on-primary`     | `#FFFFFF` | `#17382D` |
| `--site-border`         | `#D4E5DB` | `#3E5B4E` |
| `--site-control-border` | `#718E80` | `#7D9D8C` |
| `--site-focus`          | `#397B60` | `#B3E6D6` |

## 正式接入

外觀選單顯示 S2 · Verdant Prelude／S2 · 青燕春序（三語）。沿用白名單、SSR cookie、全站與edition設定、讀取合約及OpenAPI。優先序仍為訪客明確選擇 → 當前有權限／已發布賽事預設 → 全站預設；清除偏好跟隨當前路由，非賽事頁不沿用上一季，明暗獨立。樣式限 `.themed-site`，OBS／presenter保持隔離。

Migration `0053_verdant_prelude_appearance` 只擴充site settings與audit外觀約束，不選擇預設、不改歷史資料。更新時依正常流程套用；刻意回退舊版前先選回舊版支援的站點／賽事預設，不刪除稽核或down-migrate live DB。新增中文選單名稱仍供主辦方審閱。

## 實際頁面與資料

[離線圖庫](../s2.html)：主頁／賽程／圖池／Admin × 明暗 × 桌面／手機 × S2／default，共32種切換。

- [桌面明](desktop-light.webp)／[暗](desktop-dark.webp)，[手機明](mobile-light.webp)／[暗](mobile-dark.webp)
- [管理桌面明](admin-desktop-light.webp)／[暗](admin-desktop-dark.webp)，[管理手機明](admin-mobile-light.webp)／[暗](admin-mobile-dark.webp)
- [937px明](heading-937-light.png)／[暗](heading-937-dark.png)，[390px明](heading-390-light.png)／[暗](heading-390-dark.png)

截圖來自production build與真正 `oclr-appearance=verdant-prelude` SSR偏好，不注入CSS。工具核對回應、原圖、文字／DOM及素材hash，封鎖外部流量與非GET／HEAD。圖庫只切換保存的圖片，不提供管理寫入。

完整S2公開archive未隨版本庫提交；本輪使用 [明確標示的合成fixture](../../../../tests/fixtures/verdant-preview.ts) 與既有共用元件測試隊伍、選手、賽程、圖池，不讀取私人匯出、不推測歷史統計。規則來自已提交的S2原文，主視覺保持原檔。Admin合成session只留在程序記憶體，沒有真實帳號授權。

## 重現與驗證

Node.js24、npm與既有lockfile。使用專用、可丟棄且名稱含獨立 `test` 段的PostgreSQL；完整測試另外使用 `oclr_s2_acceptance_test`，與預覽資料分開。

```sh
npm ci
export TEST_DATABASE_URL=postgresql://emik@127.0.0.1:55416/oclr_s2_theme_preview_test
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s2/prepare.ts
DATABASE_URL="$TEST_DATABASE_URL" npm run build
DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 APP_URL=http://127.0.0.1:3192 npm start -- --hostname 127.0.0.1 --port 3192
```

另一終端設定相同TEST_DATABASE_URL，再執行：

```sh
node --import tsx docs/design/season-themes/s2/capture.mjs
node docs/design/season-themes/s2/verify-gallery.mjs
```

`S2_PREVIEW_ORIGIN`只接受loopback。[頁面驗證](verification.json) 與 [圖庫驗證](gallery-verification.json) 記錄實際結果。正式接入測試涵蓋三語選單、SSR與完整原圖、窄螢幕／reduced motion／高對比；共用測試涵蓋站點與賽事預設、私有頁與OBS隔離；migration測試驗證升級前拒絕、升級後接受且保留原預設與audit。

候選階段的測試紀錄見Git歷史，不視為正式接入、CI或部署證據。最終本輪執行結果與CI狀態隨PR及issue記錄。

設計方法沿用專案指定 [Refactoring UI](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 與frontend skill，遵守既有元件、閱讀層級及OCLR的權限／發布邊界。

### 正式接入本輪結果

Node.js24鎖定安裝、`npm run check`、production build、i18n extraction與4項檢查、production audit（0漏洞）通過。完整單元／整合首次184檔通過、1檔失敗，1507 passed／4 failed／1 skipped；失敗來自新同步的request-body測試mock漏掉權限函式。以獨立測試修正提交保留原始權限exports後，4項重跑全通過，沒有修改應用權限。

正式SSR預覽32組／Axe AA零違規、4組forced colours，原圖／DOM／文字／規則及手機選單／Admin焦點通過。圖庫32種切換、8次Axe AA與鍵盤順序通過。程式來源對應 `a8255a0087e92a3423d1b6fb4ab8e75c7281ab06`；建置早於提交，但runtime來源一致，驗證檔保留build ID與CSS／SVG／原圖hash。

桌面／手機受影響E2E共16項全通過：三語選單、SSR偏好、明暗獨立、九種公開／私有頁、站點儲存／權限／concurrency、賽事繼承與清除偏好、Captain權限、OBS／presenter隔離、原圖、窄螢幕與高對比。使用Chrome與獨立31416連接埠；本機3100正被其他程序使用，保留原程序。初次較廣篩選的header檢查因寫死3100的URL斷言而失敗，未當作S2通過證據；最終明確選取以上四個測試檔，16項全通過。臨時config／provider副本已移除。

主分支 `3750bc93` 已合併等效的request-body測試修正（#451），本分支同步並採用上游版本；與上游無該測試檔差異。沒有重跑完整全站functional／header／remote或Safari矩陣，普通CI範圍保持原設定。正式上線與主辦方驗收分別處理。

最終同步上游測試修正後再次執行 `npm run check` 通過，工作區保留的只有本輪已提交設計與正式主題檔案。
