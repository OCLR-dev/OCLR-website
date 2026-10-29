# S4 — Azure Brush / 蒼藍筆鋒

2026-10-29，依 [#344](https://github.com/OCLR-dev/OCLR-website/issues/344) 與主辦方本對話「開始設計並開發」及「應該使用水墨畫風的筆鋒」製作。應用基準為 main `60db020940f90f2549c85bb6dae4f38c04eb1e60`，在 `codex/344-s4-azure-brush` 開發可選外觀 `azure-brush`，本輪交付完整本機預覽，視覺與中文名稱供主辦方審閱。

## 設計

視覺主張是「紙白留白中的一筆蒼藍水墨」：以濃淡墨藍、毛筆飛白、分岔筆尖與自然暈染延伸原圖筆勢，將質感集中於banner；資料區保持平面與清楚的編輯式層級。手機重新取景及降低筆觸強度，保護標題與長說明。完整原圖仍是主頁的主要視覺，不把原圖粗獷手寫字延伸成內文字體。

內容保留既有導覽、完整8:5原圖、五列統計與四章原文規則。主頁／賽程／圖池／管理設定皆使用實際MainSheet元件；面板4px、控制項3px圓角，16px內文與既有44px觸控區。選取狀態以淡藍面與深藍文字呈現，數值沿用等寬數字，成功／警告／錯誤維持獨立語意色。

動效只保留160ms標題入場、140ms導覽過渡與1px按壓回饋，尊重reduced motion。沒有循環動畫；forced colours移除水墨、漸層與陰影，使用系統Highlight識別目前頁。

- [可切換圖庫](../s4.html)：實際頁面32種切換，另有可用鍵盤分頁的本機控制項預覽、輸入錯誤、主要／次要／停用操作及重設。
- [桌面Light](desktop-light.webp)／[Dark](desktop-dark.webp) · [手機Light](mobile-light.webp)／[Dark](mobile-dark.webp)。
- [937px標題](heading-937-dark.png)／[390px標題](heading-390-dark.png)，原生2×。

## Tokens

正式樣式見 [azure-theme.css](../../../../src/app/azure-theme.css)。水墨以透明背景素材疊在紙白／墨藍底上，標題區加漸淡閱讀罩層；同一素材保留自然透明資訊，沒有執行時濾鏡、外部素材請求或新增字型。

| Token                   | Light     | Dark      |
| ----------------------- | --------- | --------- |
| `--site-background`     | `#F2F8FA` | `#0F2132` |
| `--site-surface`        | `#FFFFFF` | `#172E42` |
| `--site-raised`         | `#E3EEF2` | `#213E54` |
| `--site-foreground`     | `#102E46` | `#EEF7FC` |
| `--site-muted`          | `#526D7E` | `#ACC3D3` |
| `--site-accent`         | `#176CA4` | `#9DCCED` |
| `--site-accent-strong`  | `#124D79` | `#C2E5FC` |
| `--site-primary`        | `#126A9F` | `#8CC8EF` |
| `--site-on-primary`     | `#FFFFFF` | `#102B40` |
| `--site-border`         | `#C4D5DE` | `#38566C` |
| `--site-control-border` | `#758E9E` | `#6C8CA3` |
| `--site-focus`          | `#126A9F` | `#69C5F1` |
| `--site-success`        | `#24614D` | `#91D5BD` |
| `--site-warning`        | `#805600` | `#F1D090` |
| `--site-danger`         | `#AC3046` | `#FFB4BD` |

## 素材與資料

- [完整S4原圖](../../../../public/archive/s4/key-visual.avif)：1728×1080 AVIF，SHA-256 `f141a68227ec17015b8b81957e06e010f993840cd7da58da798697ea722e3fc3`。原檔、構圖、比例與歷史文字保持不變，不裁切、重繪或調色。
- [水墨素材](../../../../public/themes/azure-brush/ink-brush.webp)：內建imagegen生成的2172×724透明新素材，保留alpha，僅轉為WebP供應用使用。[原始PNG、完整提示詞與轉製說明](INK.md)一併保存。不是原始賽事素材或新增賽事logo；不將它標成手繪來源。
- 使用已提交的 [S4 archive](../../../imports/s4-archive.json) 與 [原文規則](../../../imports/s4-rules.json)。規則只將`title/content`對應到既有`heading/body`欄位，不改寫文字。
- 來源包含12隊、84位選手與教練、5個圖池及76個譜面位置，四章原文規則。34場來源狀態為27 approved、5 pending、2未記錄review；全部原樣保留，不呼叫核准函式。正常公開投影顯示29個已記錄賽果，不能把這個統計當成本輪核准數量。
- 沒有補造比分、名次、日期或缺漏身分。只使用專用test DB和合成管理帳號，沒有讀取production、真實OAuth或私密申請資料。session僅在擷取程序記憶體使用。

## 接入與邊界

三語名稱：S4 · Azure Brush／S4 · 苍蓝笔锋／S4 · 蒼藍筆鋒。沿用外觀選單、SSR cookie、全站／賽事管理設定；優先序仍是訪客選擇 → 當前有權限／已發佈賽事預設 → 全站預設。清除選擇跟隨目前路由，不寫入自動偏好；非賽事頁不繼承上一季，light/dark獨立，OBS／presenter隔離。

Migration `0052_azure_brush_appearance` 只擴充site settings／audit appearance約束，不變更既有預設、來源審批、發佈或審計歷史。正式使用前依正常審閱更新流程套用migration；退回舊版前先選回支援的站點／賽事預設，不刪除歷史或down-migrate live DB。本輪沒有合併或部署。

圖庫擷取正式建置的實際頁面：先保存default對照，再使用本機context的`oclr-appearance=azure-brush`及reload確認SSR回應，沒有注入預覽CSS。擷取封鎖外部流量與非GET／HEAD請求，核對除目前外觀按鈕名稱外的body文字及元素數量相同。離線HTML只切換圖片及操作本機示範表單，不連API／DB、cookie或localStorage。

## 重現

Node.js24、npm與既有lockfile；只使用名稱有獨立test段的可丟棄PostgreSQL。破壞性測試須用另一資料庫。

```sh
export TEST_DATABASE_URL=postgresql://emik@127.0.0.1:55425/oclr_s4_preview_test
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s4/prepare.ts
npm run build
DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 APP_URL=http://127.0.0.1:3194 npm start -- --hostname 127.0.0.1 --port 3194
```

另開terminal，帶相同TEST_DATABASE_URL：

```sh
node --import tsx docs/design/season-themes/s4/capture.mjs
node docs/design/season-themes/s4/verify-gallery.mjs
```

`S4_PREVIEW_ORIGIN`可指定另一loopback專用預覽。擷取報告保存應用基準、build ID及CSS／水墨／原圖hash。`s4.html`可直接離線開啟，不依賴服務。

## 驗證

Node.js24.22.1與鎖定依賴；`npm ci`、`npm run check`、最終水墨版production build通過，i18n extraction／4項檢查通過，正式套件audit為0漏洞。首版幾何筆勢已依主辦方要求撤換為水墨素材；不將舊畫面的檢查當新版證據。

- [正式頁面驗證](verification.json)：四路由×320／390／768／1440px×明暗共32組／32次Axe AA，零違規、無溢出或pageerror；4組forced colours、原圖／統計／規則、手機選單與焦點、937／390px標題幾何皆通過。
- [離線圖庫驗證](gallery-verification.json)：32種圖片切換、頁面／控制項兩分頁×四寬度×明暗16次Axe AA零違規，無溢出或pageerror，鍵盤分頁、表單錯誤／預覽／重設通過。
- `tests/e2e/azure-appearance.spec.ts`及共用外觀／站點／賽事流程共16項桌面／手機測試全部通過：三語、SSR、完整原圖、偏好繼承、窄螢幕、reduced motion、forced colours及OBS隔離。
- 完整單元／整合初跑為1462通過、1超時、1略過；既有S10名稱升級項目因15000ms上限失敗，單獨重跑1項於2.10秒通過，未改動該測試或放寬上限。不能將初跑描述為全過。

依專案指定Refactoring UI及frontend-skill進行層級、留白、色彩與可讀性設計；水墨素材採imagegen。未執行全站完整functional／header／remote或Safari矩陣，亦未宣稱真實部署或正式發佈驗收。

應用基準 `60db0209` 的 [CI 40792049945](https://github.com/OCLR-dev/OCLR-website/actions/runs/40792049945) 為success；它沒有包含本輪S4分支變更，不作本輪CI通過證據。

工具lint／格式、76個本機文件連結及diff檢查通過；正式CSS、水墨WebP及原圖hash與最終擷取報告一致，原圖及匯入來源檔沒有變更。專用預覽與test PostgreSQL於完成後停止。
