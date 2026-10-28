# S5 — Prism Overture / 稜光序曲

2026-10-29，依 [#345](https://github.com/OCLR-dev/OCLR-website/issues/345) 與主辦方「開始設計S5主題theme」製作首版候選。基於 main `9e10f727c733ca517d183204c5c3ed97e127ed56` 的實際 MainSheet 元件，先交付視覺預覽供審閱；尚未註冊 `prism-overture`、更改任何預設或加入正式外觀選單。

## 視覺與層級

視覺主張是「青紫稜面中的一束暖光」：淡紫白／紫墨工作面、紫色主要操作、低彩度資料區，將青光、粉桃與有限環弧集中在banner和分隔線。完整原圖是主要視覺，保留 OCLR β 的歷史識別；介面使用 OCLR β (S5) 說明對應，不改寫原圖的β或歷史英文。

主頁保留既有導覽、完整16:9原圖、五列統計與三章規則；賽程、圖池與管理設定皆來自實際 React 元件，使用既有資料與權限流程。面板12px、控制項8px圓角，16px內文與既有44px觸控區；比分與統計數值沿用等寬數字。選取狀態使用淡紫面與深紫文字；成功、警告、錯誤保留獨立語意色。

動效僅保留160ms標題入場、140ms導覽過渡與1px按壓回饋，尊重reduced motion；沒有旋轉、閃爍或掃光。Forced colours移除裝飾與漸層，使用系統Highlight識別目前頁。

- [可切換圖庫](../s5.html)：主頁／賽程／圖池／管理設定 × 桌面／手機 × 明暗 × S5候選／原有外觀，共32種切換。
- [桌面Light](desktop-light.webp)／[Dark](desktop-dark.webp) · [手機Light](mobile-light.webp)／[Dark](mobile-dark.webp)。
- [937px標題](heading-937-dark.png)／[390px標題](heading-390-dark.png)，原生2×。

## Tokens

完整候選值見 [s5.css](../s5.css)。標題以內容寬度720px為門檻保留右側稜鏡空間，窄欄收起裝飾；字體、主要版面及資訊架構沿用MainSheet。

| Token                   | Light     | Dark      |
| ----------------------- | --------- | --------- |
| `--site-background`     | `#F7F5FC` | `#1B1730` |
| `--site-surface`        | `#FFFFFF` | `#26203E` |
| `--site-raised`         | `#EEE8F8` | `#32294E` |
| `--site-foreground`     | `#302644` | `#F5EFFF` |
| `--site-muted`          | `#6C617E` | `#C0B6D4` |
| `--site-accent`         | `#6943AC` | `#D5B8FF` |
| `--site-accent-strong`  | `#4E2D87` | `#ECD9FF` |
| `--site-primary`        | `#6943B8` | `#BF9CF7` |
| `--site-on-primary`     | `#FFFFFF` | `#26143E` |
| `--site-border`         | `#D9D0E7` | `#4D4166` |
| `--site-control-border` | `#8A779E` | `#9B86B4` |
| `--site-focus`          | `#6943B8` | `#83D4DF` |
| `--site-success`        | `#22654F` | `#9BDFC1` |
| `--site-warning`        | `#865500` | `#F4D397` |
| `--site-danger`         | `#B32F48` | `#FFB2C2` |

## 素材與資料

- [完整原圖](../../../../public/archive/s5/key-visual.png)：原有1920×1080 PNG，SHA-256 `26fb173d1641df56a81fa7e9d7a2948b5280927d3c93fbd2324b7f169a9c80e4`，不裁切、重繪、調色或改字，保留原檔與既有透明資訊。
- [Light稜鏡](prism-mark-light.svg)／[Dark稜鏡](prism-mark-dark.svg)：原生SVG自繪，以三角稜面、暖色短弧、細光束與少量星點呼應原圖；沒有文字、腳本、外部素材或循環動效。作為標題裝飾，並非新賽事logo或即時資料。
- 使用已提交的 `s5-reviewed-import.json` 與 `s5-rulebook.json`，沿用既有歷史資料schema及公開投影；來源與限制見 [S5來源整理](../../../s5-archive.md)。
- `reviewed-import` 的34場來源結果仍全部為pending；此fixture沒有呼叫核准函式或改變審批狀態。公開頁沿用正常投影隱藏其比分，因此顯示0個已記錄賽果，不把34個待審來源當作已核准結果。
- 實際主頁顯示12隊、85位選手與教練、5個圖池、77個譜面位置（包含教練資格賽），三章原文規則。沒有補造日期、名次、比分或缺漏身分。
- 只有隔離test DB的合成 `Synthetic UI Preview` 管理帳號；session僅在擷取程序記憶體中使用。沒有讀取production、真實OAuth或私密申請資料。

## 方法與邊界

目前未修改`src`、`messages`、`public`、正式路由、外觀白名單或migration。以已建置的最新main應用作基準，加入 `data-s5-preview` 與候選CSS後直接擷取真實頁面；這是設計候選，尚非正式S5 SSR外觀。SVG由工具內嵌為本機data URI。

圖庫只切換保存的圖片，不連接API／DB或儲存偏好。擷取過程封鎖外部流量及非GET／HEAD請求，並核對套用樣式前後的body文字與元素數量不變。

## 重現

Node.js24、npm與既有lockfile。只用名稱含獨立test段的可丟棄PostgreSQL；`prepare.ts`不是應用seed或正式匯入工具。

```sh
export TEST_DATABASE_URL=postgresql://emik@127.0.0.1:55425/oclr_s5_theme_preview_test
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s5/prepare.ts
npm run build
DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 APP_URL=http://127.0.0.1:3195 npm start -- --hostname 127.0.0.1 --port 3195
```

另開terminal並使用相同TEST_DATABASE_URL：

```sh
node --import tsx docs/design/season-themes/s5/capture.mjs
```

`S5_UI_BASELINE`可指定應用基準，`S5_PREVIEW_ORIGIN`可指定另一loopback專用預覽。工具先確認`src`／`messages`／`public`與基準相同。圖庫`s5.html`可直接離線開啟，不依賴上述服務。

## 本輪驗證

- Node.js24.22.1 `npm ci`、基準main的production build與其TypeScript檢查通過。
- [verification.json](verification.json)：主頁／賽程／圖池／Admin × 320／390／768／1440px × 明暗，共32組、32次Axe AA，零違規、無水平溢出或pageerror。
- 樣式前後body文字／元素數量不變；完整1920×1080 PNG、五列統計與三章規則保留。手機選單／Escape焦點、Admin鍵盤焦點、4組forced colours及937／390px標題不遮字檢查通過。
- [gallery-verification.json](gallery-verification.json)：圖庫32種切換正確載入，四種寬度×明暗共8次Axe AA零違規，無溢出或pageerror，鍵盤焦點通過。
- 工具ESLint／語法、格式、文件連結與`git diff --check`通過；原圖SHA-256與來源相同，候選CSS與兩份SVG hash和最終擷取報告一致。`src`／`messages`／`public`與基準main完全相同；專用預覽與test PostgreSQL於完成後停止。
- 本輪為docs候選設計，未執行完整應用單元／整合、全站E2E、三語／Safari矩陣或正式S5 SSR偏好驗收。

基準main `9e10f72` 的 [CI 40732722069](https://github.com/OCLR-dev/OCLR-website/actions/runs/40732722069) 為 **failure**：verify的OpenAPI同步單元斷言、core首頁內容定位，以及remote-e2e定位檢查失敗，彙總check隨之失敗。此CI沒有包含尚未推送的S5候選文件；本輪本機畫面檢查不代表基準CI已通過，也不作整體應用發佈或正式接入驗收。

設計方法採專案指定 [Refactoring UI](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 的層級、色彩與留白原則，並沿用前端設計指引。名稱、配色與裝飾仍供主辦方審閱；正式接入及其三語文案、SSR偏好與完整應用矩陣留待獲准接入時處理。
