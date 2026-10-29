# S5 — Prism Overture / 稜光序曲

2026-10-29，依 [#345](https://github.com/OCLR-dev/OCLR-website/issues/345) 與主辦方逐輪確認的全幅稜鏡紋理、更多細折面及藝術斜體β設計，接入正式外觀 `prism-overture`。應用／擷取基準為main `96652aa981626d69f682f7f4f6315e7a2dc44ca7`，提交前另同步main `c2a1e2d751814cf639ff12cba55856c5080e3fee` 的OpenAPI／測試修復（無執行時程式差異），新增PR供審閱，尚未合併或部署；原有預設保持不變。

## 視覺與層級

視覺主張是「青紫稜面中的一束暖光」：淡紫白／紫墨工作面、紫色主要操作、低彩度資料區，以110片大小交錯的青紫折面、局部粉桃暖光與淡色β壓印構成整片banner紋理；色面向文字區漸淡，避免裝飾與標題分離。完整原圖是主要視覺，保留 OCLR β 的歷史識別；介面使用 OCLR β (S5) 說明對應，不改寫原圖的β或歷史英文。

主頁保留既有導覽、完整16:9原圖、五列統計與三章規則；賽程、圖池與管理設定皆來自實際 React 元件，使用既有資料與權限流程。面板12px、控制項8px圓角，16px內文與既有44px觸控區；比分與統計數值沿用等寬數字。選取狀態使用淡紫面與深紫文字；成功、警告、錯誤保留獨立語意色。

動效僅保留160ms標題入場、140ms導覽過渡與1px按壓回饋，尊重reduced motion；沒有旋轉、閃爍或掃光。Forced colours移除裝飾與漸層，使用系統Highlight識別目前頁。

- [可切換圖庫](../s5.html)：主頁／賽程／圖池／管理設定 × 桌面／手機 × 明暗 × S5主題／原有外觀，共32種切換。
- [桌面Light](desktop-light.webp)／[Dark](desktop-dark.webp) · [手機Light](mobile-light.webp)／[Dark](mobile-dark.webp)。
- [937px標題](heading-937-dark.png)／[390px標題](heading-390-dark.png)，原生2×。

## Tokens

正式樣式見 [prism-theme.css](../../../../src/app/prism-theme.css)。110片不規則三角折面鋪滿banner，密度為前一版22片的5倍；各面帶有漸層深淺與局部細稜線，保留青紫基調與少量粉桃反光。β採EB Garamond Italic的古典書寫斜體字形，轉為向量壓印融入材質，保留粗細筆畫與Greek beta的下伸筆畫。內文限制在54ch以維持閱讀節奏；手機調整背景取景與閱讀罩層，使β可見並維持文字對比。字體與主要資訊架構沿用MainSheet。

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
- [Light紋理](../../../../public/themes/prism-overture/prism-field-light.svg)／[Dark紋理](../../../../public/themes/prism-overture/prism-field-dark.svg)：原生SVG自繪，每份含110片不規則折面、6組色面漸層、選擇性的細反射稜線與藝術斜體β壓印。β字形已轉成向量，執行時不載入字型或外部資源；不是新增賽事logo。兩份紋理合計約34KB，依明暗分別控制色面與反光強度，沒有腳本或循環動效。
- [β字形來源與轉製說明](fonts/BETA.md)：EB Garamond Italic 400的Greek U+03B2，採SIL OFL 1.1授權，來源及完整版權／授權文字隨文件保存。只嵌入字形輪廓，不加入整套字型或改變MainSheet文字字體。
- 使用已提交的 `s5-reviewed-import.json` 與 `s5-rulebook.json`，沿用既有歷史資料schema及公開投影；來源與限制見 [S5來源整理](../../../s5-archive.md)。
- `reviewed-import` 的34場來源結果仍全部為pending；此fixture沒有呼叫核准函式或改變審批狀態。公開頁沿用正常投影隱藏其比分，因此顯示0個已記錄賽果，不把34個待審來源當作已核准結果。
- 實際主頁顯示12隊、85位選手與教練、5個圖池、77個譜面位置（包含教練資格賽），三章原文規則。沒有補造日期、名次、比分或缺漏身分。
- 只有隔離test DB的合成 `Synthetic UI Preview` 管理帳號；session僅在擷取程序記憶體中使用。沒有讀取production、真實OAuth或私密申請資料。

## 正式接入與邊界

`prism-overture` 加入共用白名單及三語標籤：S5 · Prism Overture／S5 · 棱光序曲／S5 · 稜光序曲。沿用外觀選單、SSR cookie、全站及賽事管理設定；優先序仍是訪客選擇 → 當前有權限／已發佈賽事預設 → 全站預設。清除訪客選擇跟隨目前路由，不寫入自動偏好；非賽事頁不繼承上一季，light/dark獨立，OBS／presenter保持隔離。

Migration `0051_prism_overture_appearance` 只擴充site settings／audit appearance約束，沒有改變任何既有預設、賽事資料或審批狀態。更新前經正常審閱流程套用migration；有意退回舊程式前先選回舊版支援的站點／賽事預設，不刪除歷史或down-migrate live DB。

圖庫直接擷取已註冊的實際頁面：先保存default對照，再寫入本機測試context的`oclr-appearance=prism-overture`並reload，核對SSR回應，使用建置後CSS及正式SVG，沒有注入候選CSS。圖庫只切換保存的圖片，不連接API／DB或儲存偏好。擷取過程封鎖外部流量及非GET／HEAD請求，並核對除目前外觀按鈕名稱外的body文字／元素數量不變。

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

`S5_PREVIEW_ORIGIN`可指定另一loopback專用預覽。工具保存應用基準、build ID、正式CSS／SVG及原圖hash，並確認SSR外觀。圖庫`s5.html`可直接離線開啟，不依賴上述服務。

## 本輪驗證

正式接入後於Node.js24.22.1重新安裝鎖定依賴，執行完整`npm run check`、`npm test`及production build；180個測試檔、1459項測試通過，1項略過。`i18n:extract`／`test:i18n`通過（4項），`npm audit --omit=dev`為0漏洞。首版及候選階段的結果不作本輪正式SSR驗收證據。

- [verification.json](verification.json)：正式SSR主頁／賽程／圖池／Admin × 320／390／768／1440px × 明暗，共32組／32次Axe AA零違規，無溢出或pageerror；4組forced colours、原圖／統計／規則、手機選單／Escape焦點與Admin鍵盤焦點、937／390px標題幾何皆通過。保存build ID及CSS／SVG／原圖hash。
- [gallery-verification.json](gallery-verification.json)：32種切換、四種寬度×明暗共8次Axe AA零違規，無溢出或pageerror，鍵盤焦點通過。
- `tests/e2e/prism-appearance.spec.ts`：三語選單／SSR／完整原圖、reduced motion、forced colours及窄螢幕；共用外觀流程另涵蓋公開／Admin頁面、訪客切換及OBS／presenter隔離。
- 受影響的桌面／手機E2E共16項全部通過：S5專用三語／窄螢幕、共用外觀／OBS隔離、站點設定與賽事繼承。共用migration測試已通過升級前拒絕、升級後接受且保留既有預設及審計歷史檢查。
- 最終同步main後重新產生OpenAPI，並重跑read-api／DX契約檢查。專用預覽與test PostgreSQL於完成後停止。
- 本輪執行範圍為完整單元／整合及受影響的桌面／手機瀏覽器流程，沒有執行全站完整functional／header／remote或Safari矩陣；普通PR CI沿用固定core，不自動提升full。

基準main `9e10f72` 的舊 [CI 40732722069](https://github.com/OCLR-dev/OCLR-website/actions/runs/40732722069) 曾為failure；它沒有包含本輪S5正式接入，不能替代本輪提交的實際CI狀態。

設計方法採專案指定 [Refactoring UI](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 的層級、色彩與留白原則，並沿用前端設計指引。主辦方已確認視覺方向並要求開發提交；新增選單中文名稱仍隨PR供審閱，未宣稱整體發佈或真實部署驗收。
