# S7 — Graphite Arena / 石墨競技場

追蹤：[#198](https://github.com/OCLR-dev/OCLR-website/issues/198)。S7 正式主題已由 PR #384 合併至 main `d34378e`。本輪以該實際 UI 修復圖池與管理側欄，功能分支待審閱，尚未合併或部署修復。

## 設計方向

視覺主張：以有方向反射的拉絲銀色金屬與深色鋼材承接原主視覺；標題、統計與頁首有清楚光澤，競技黃細線與六角金屬嵌件延續工業感，表格與重複列保持平整清楚。

內容順序沿用實際頁面：賽季標題 → 完整主視覺與五列統計 → 既有規則區；圖池保留原槽位、譜面、mod 語意；Admin 保留工作表單。沒有插入行銷文案、樣本賽程或虛構規則。

互動沿用現有導覽與偏好控制。標題 180ms 輕入場、導覽 140ms 色彩回饋與按壓 1px 位移只在允許動態時啟用；沒有循環動畫。所有裝飾忽略指標，高對比模式移除線稿並顯示系統選取外框。

- 保留 [1920×1080 原圖](../../../../public/archive/s7/key-visual.jpg)，完整 contain，不裁切、重繪、調色或改字。
- 桌面標題右側採自繪具厚度的六角金屬嵌件，下方 64px 黃色短線呼應金屬原圖；1100px 以下移除右側裝飾，不壓縮長標題。
- 面板／控制項採 2px 圓角。統計是一整塊金屬板，寬幅反射跨越五列，不為每個數值加框；比分採系統等寬數字。
- 主導覽選取透明底色、單一細底線；賽事頁籤用黃色底線，工作側欄採緞面金屬列與金色側線。焦點、狀態與 mod 色保持獨立語意。
- 明版拉絲銀鋁、暗版深色鋼材。反射帶、3px 細刷紋、上緣亮邊與下緣暗邊由靜態 CSS 背景製作；頁首與 Admin 大板採較平緩緞面，按鈕保留小面積頂光。主按鈕亮黃搭深色文字，明版連結採深金色。無遠端字型或新依賴。

## 可審閱實際 UI

[離線截圖圖庫](../s7.html) 可切換頁面、尺寸、明暗與 default 對照。圖庫只切換截圖，不模擬應用業務功能。

- [桌面 Light](desktop-light.webp) / [Dark](desktop-dark.webp)
- [手機 Light](mobile-light.webp) / [Dark](mobile-dark.webp)
- [圖池 Light](mappools-desktop-light.webp) / [Dark](mappools-desktop-dark.webp)
- [Admin Light](admin-desktop-light.webp) / [Dark](admin-desktop-dark.webp)
- [手機選單 Light](menu-mobile-light.webp) / [Dark](menu-mobile-dark.webp)
- [本輪實測報告](verification.json) / [原靜態樣本歷史證據](verification-static-2026-10-24.json)

## MainSheet tokens

主視覺中的明亮裝飾色不直接作內文色；互動、文字、控制框與焦點分別定義。錯誤、成功、警告與 mod 顏色仍需繼承既有語意，不能全改為主色。

| Token                   | Light     | Dark      |
| ----------------------- | --------- | --------- |
| `--site-background`     | `#f3f4f2` | `#171c20` |
| `--site-surface`        | `#ffffff` | `#22292f` |
| `--site-raised`         | `#e9eceb` | `#303940` |
| `--site-tint`           | `#f6edc6` | `#443f27` |
| `--site-foreground`     | `#171c20` | `#f3f4f2` |
| `--site-muted`          | `#596164` | `#b6bfc4` |
| `--site-secondary-text` | `#414a50` | `#d7dce0` |
| `--site-accent`         | `#796000` | `#eacb49` |
| `--site-border`         | `#cdd2d0` | `#485158` |
| `--site-control-border` | `#7b8588` | `#88949b` |
| `--site-primary`        | `#eacb49` | `#eacb49` |
| `--site-primary-hover`  | `#f2d969` | `#f2d969` |
| `--site-on-primary`     | `#171c20` | `#171c20` |
| `--site-focus`          | `#796000` | `#eacb49` |
| `--site-selection`      | `#e9d988` | `#5b5128` |
| `--button-radius`       | `2px`     | `2px`     |
| `--radius-panel`        | `2px`     | `2px`     |

## 正式接入

- CSS：[graphite-theme.css](../../../../src/app/graphite-theme.css)，範圍為 `html[data-appearance="graphite-arena"] .themed-site`。
- 三語名稱：S7 · Graphite Arena／S7 · 石墨竞技场／S7 · 石墨競技場。
- 重用既有選單、訪客 cookie → 當前授權／已發佈賽事預設 → 全站預設、清除繼承、SSR 與獨立明暗。非賽事頁不繼承上一季，OBS／presenter 保持隔離。
- Migration `0048_graphite_arena_appearance` 只擴充全站預設與 audit 的 CHECK 值；不修改任何既有預設、賽事、資料或歷史。透過正常 reviewed update 套用後才儲存為 site default；刻意回退舊版前選回支援值，不刪歷史或對 live DB 降版。
- API 契約及 OpenAPI 由既有產生器同步，沒有新增 API 或權限。
- 素材：[自繪六角金屬嵌件](../../../../public/themes/graphite-arena/honeycomb.svg)，SVG 原生幾何，不使用生成圖。沒有變更原主視覺檔。

## 重現截圖

使用 Node 24、`npm ci`，明確隔離且名稱含 `test` 的 PostgreSQL。以下只用本輪合成預覽 DB；不得改成 demo／production。`prepare.ts` 重設該 test DB 的賽事 fixture，不能當應用 seed。公開頁使用已提交的 S7 歸檔；Admin 為 `Synthetic UI Preview` 合成帳號，沒有真實角色授予或 OAuth。S7 已儲存規則屬網站資料，本輪未讀取私有 DB 或補造規則，預覽保留缺少 saved rules 時的既有狀態。

```sh
export TEST_DATABASE_URL=postgresql://emik@127.0.0.1:55497/oclr_198_design_test
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s7/prepare.ts
DATABASE_URL="$TEST_DATABASE_URL" npm run build
DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 APP_URL=http://127.0.0.1:3197 npm start -- --hostname 127.0.0.1 --port 3197
```

在另一個 terminal 對同一 DB，設定 `S7_UI_BASELINE` 為本輪 runtime 提交，執行：

```sh
S7_UI_BASELINE=5c9f0834548ebe4c0ce91ca5bc24efa94138fb32 node --import tsx docs/design/season-themes/s7/capture.mjs
```

截圖程式核對 runtime／messages／public 與指定 SHA 完全一致，從實際 SSR 外觀偏好與已打包 CSS 產圖；不注入候選 CSS、不更換元件。檢查三個路由 × 四個寬度（320／390／768／1440）× 明暗、Axe AA、DOM／文字不變、五列統計、完整原圖、手機選單／焦點與 sticky stack，另檢查四組 forced colours。另以繁中、937px／390px 擷取管理側欄明暗共四張原生2×局部並進行四次側欄 Axe AA。合成 session 只在記憶體，不進截圖或原始碼。

## 驗證紀錄

2026-10-24 的八組靜態樣本／16 次 Axe AA 結果保留於歷史報告；不套用到本輪正式實作。最新結果與 runtime SHA 以 `verification.json` 及 #198 的本輪紀錄為準；CI、視覺接受與部署各自如實記錄。

### 首版本機結果（2026-10-27，金屬精修前）

- Runtime：`a69cc7f42744aaf17b4c387f89a10f90640f4669`；UI 基於 main `be94ce1`。截圖前已核對 source／messages／public 與 runtime SHA 一致。
- `npm ci`、`npm run check`、`npm run build` 通過。
- Runtime `128ee43` 上隔離 PostgreSQL 的完整 `npm test`：161 檔，1353 passed／1 skipped；包含 0048 升級前拒絕、升級後可儲存，並保留既有 S8 預設與 audit。之後僅補比分 CSS 與對應瀏覽器斷言，最終 production build／截圖及受影響 browser checks 另行重跑。
- `npm run i18n:extract`、`npm run test:i18n`（4 passed）、51 份 read contracts 檢查及 OpenAPI 同步通過；production dependency audit 為 0 vulnerabilities。
- 真實主頁／圖池／Admin：24 組 viewport／明暗、24 次 Axe AA、4 組 forced colours 通過；DOM／文字、五列統計、完整 1920×1080 原圖、手機 Escape 焦點與 sticky stack 保持正確。16 張頁面截圖、2 張手機選單圖、12 張 default 對照已更新。
- 離線圖庫 24 組控制組合圖片全部載入，沒有頁面錯誤或手機溢出；設計文件本地連結、JS 語法、圖庫工具 lint 與 diff 格式檢查通過。

- Chromium 桌面／手機 32 項回歸通過，涵蓋 S7–S10 三語選單、公開／Admin／Captain、site／edition 預設繼承與 OBS／presenter 隔離。最終 `a69cc7f` 再跑 S7 桌面／手機 2 項（含真實賽程比分）通過。
- Header 明暗 × 桌面／手機 4 項通過，涵蓋 320／390／760／950／951／1100／1101／1440px 的選單 hit-testing、偏好／帳戶控制與焦點。該檢查在 `9051bb0`，其後只擴充比分選擇器，header 不變。
- 最終 `a69cc7f` 的 WebKit／Safari 桌面／手機 2 項通過，包含三語明暗與選單、完整原圖、SSR／跨頁、真實比分及高對比。

完整 GitHub CI 的 exact head／狀態見 #198；本機針對本輪風格與整合的 browser checks 不替代全部既有 E2E。未將執行中的 CI 視為通過，沒有部署或修改正式資料。

### 金屬光澤精修（2026-10-27）

主辦方指出原圖是銀色金屬而非單純石墨灰。本輪保留 `graphite-arena` code、三語名稱及原配色 tokens，重新製作材質；沒有改動註冊、資料庫、依賴或介面文案。

- 標題與統計板：112° 寬幅明暗反射、細緻水平拉絲、倒角亮暗邊；暗版亦有獨立深色鋼材反射。
- 頁首、賽事導覽與 Admin 大板：較克制的緞面反光。選取中的主導覽仍透明、無陰影，只有單條底線。
- 控制項：細頂光與壓邊，保留 44px 目標及所有語意狀態。表格、重複卡片與原主視覺不疊刷紋。
- 全部反光靜態、不掃光、不跟隨指標。高對比模式移除金屬背景及陰影，保留系統外框與鍵盤焦點。
- 最不利反射色與刷紋疊色的手算文字對比：light metal label／長字幕 5.86:1、heading eyebrow／連結 5.43:1、satin accent 5.05:1；dark muted 4.62:1、satin muted 4.99:1、accent 5.40:1。Axe 結果另列，避免僅依梯度背景的自動掃描判斷對比。

本輪 runtime：`cf7cc08aa828509840be3beac3e8f6426d607a3b`。最新截圖與材質退場報告以 `verification.json` 為準。

本輪驗證：

- `npm run check` 與 production build 通過；最後僅補高對比 selector 與標題文字對比，已重建最終 bundle。
- `ef415a7` 的 Chrome 桌面／手機 12 項通過，含三語明暗、Header 斷點、公開／Admin／Captain、OBS／presenter 隔離。其後只補高對比退場及長字幕／連結顏色，未改動幾何或業務邏輯。
- 最終 `cf7cc08` 的 Chrome 2 項與 Safari 2 項通過，包含三語明暗、SSR／跨頁、完整原圖、實際比分與所有金屬板高對比退場。
- 最終 24 組實際 UI／24 次 Axe AA 零違規；4 組 forced colours 通過，金屬背景與陰影明確移除。16 張頁面圖、2 張手機選單及12張 default 對照已更新。
- 人工核對明暗與手機材質、原圖完整性及最不利反射對比；設計連結、圖庫工具 ESLint／語法及 `git diff --check` 通過。
- CSS 精修未重跑未受影響的完整 unit/integration、i18n 或依賴稽核；首版結果另列，未當成本輪新跑的結果。交付 head 的 CI／狀態另記於 #198，不將 pending CI 稱作通過。沒有合併或部署。

### 六角金屬嵌件精修（2026-10-27）

依主辦方提供的標題局部與原圖金屬蜂巢參考，將右側線稿改為有實體厚度的切角嵌件：三個六角凹槽、銀色倒角、內壁與底層、兩枚沉頭固定件、低對比細拉絲及單段金黃反光。移除左側漸隱遮罩，保留完整加工邊緣。沒有增加產品文案、圖示操作或互動；1100px 以下與 forced colours 仍收起該裝飾，不覆蓋標題或原主視覺。

素材沿用原生 `honeycomb.svg`，純本地向量／漸層／圖樣，沒有生成圖、外部字型或依賴。標題其餘材質、三語名稱與資料／外觀繼承保持現狀。

本輪 runtime：`348bd7955f3900e0a0f066934a8816879fc4e302`。新增實際頁面 2× 裝置像素的 [Light 局部](detail-desktop-light.png)／[Dark 局部](detail-desktop-dark.png)；直接截取標題右側，沒有後製或候選 CSS overlay。最新全頁圖與實測以 `verification.json` 為準。

- `npm run check`、production build、圖庫工具 ESLint／語法及 `git diff --check` 通過。
- Runtime `348bd79` 的 Chrome 桌面／手機 2 項與 Safari 桌面／手機 2 項通過，包含三語明暗、SSR／跨頁、原圖、實際比分與高對比退場。
- 24 組實際頁面／24 次 Axe AA 零違規、4 組 forced colours 通過；DOM／文字、五列統計、手機焦點與 sticky stack 保持不變。
- 圖庫更新16張頁面圖、2張原生2×局部、2張手機選單與12張 default 對照。人工核對原生 SVG 的厚度、明暗比例及原圖未變；本地文件連結通過。
- 本輪只改裝飾 SVG／定位與設計證據，沒有重跑未受影響的完整 unit/integration、i18n 或依賴稽核。首版 full CI 與前輪 core CI 已各自 success；exact SHA／連結與本輪 CI 狀態分別記錄於 #198，不將舊結果當成本輪結果。沒有建立 PR、合併或部署。

### PR #384 與最新 main 整合（2026-10-27）

建立 PR 時 main 已合併 #383 的系統明暗偏好。正常合併 main `515be9c`，三語 catalog 同時保留系統明暗訊息與 S7 名稱，未覆蓋任一方功能；S7 視覺素材與金屬樣式不變。合併後 runtime 為 `182075a9021b27ab470a6872b18bd8f73da41e8a`，最新圖庫依該實際 UI 重製。

新增 S7 跟隨系統 → 手動覆蓋 → 恢復跟隨 → 跨頁的明暗回歸。相關 141 項單元測試、i18n extraction、check、最終 tsc 與 production build 通過。Chrome 桌面／手機 22 項通過，包含 S7／系統明暗、三語選單、Header 幾何、全站／賽事預設及公開／Admin／Captain／OBS；Safari 桌面／手機 4 項通過。最新 24 組 UI／24 次 Axe AA 零違規，4 組 forced colours 通過；16 張頁面圖、2 張局部、2 張選單與12張 default 對照已更新。沒有重跑未受影響的完整 unit/integration 或依賴稽核，CI 以 PR #384 的 exact head 為準。

### 圖池控制與長標題修復（2026-10-27，PR #384 合併後）

主辦方在 655／699px 圖池頁標註三處：檢視切換外層圓框、NM2 及 ACE1 標題誤套金屬按鈕底板／底板跟隨文字長度。修復分支基於 main `d34378e`，runtime 為 `5ebd16294a21f581d37d9dd70236b1cd11255a18`。

- 圖池檢視切換外層移除 border／radius／padding／底色；保留兩顆獨立控制、選取狀態、鍵盤焦點與高對比標記。
- 通用金屬材質排除 `.map-open-button`；譜面標題在一般、hover、focus、active 都是透明文字操作，沒有金屬漸層、陰影或按壓位移。
- 標題點選區使用整欄寬、至少44px高，沿用所在標題的字體與1.5行高；完整 literal 曲名與難度可換行，不裁切或縮成固定字數。卡片／緊湊表格均可開啟原詳情與還原焦點。
- 699px 實測：修復前 NM2／ACE1 點選區分別338.22／374.30px，所在標題欄為404.89px，且帶有漸層／inset陰影；修復後兩者均為404.89px，背景與陰影為none。外層24px圓角／1px框改為0。

[檢視控制 Light](map-controls-light.png)／[Dark](map-controls-dark.png) · [NM2 Light](map-nm2-light.png)／[Dark](map-nm2-dark.png) · [ACE1 Light](map-ace1-light.png)／[Dark](map-ace1-dark.png)。來自699px實際頁面、原生2×局部，沒有後製。隔離預覽阻擋外部封面服務，因此局部圖使用既有缺圖狀態；修復未更改封面來源。

本輪 check／production build／tsc／lint 通過。更新24組實際UI／24次Axe AA及4組forced colours，零錯誤。新增回歸以每個案例獨立頁面避免 WebKit 快速切換尺寸／cookie 時中斷前頁預取，保留全部pageerror與版面／操作斷言。最終 Chrome 桌面／手機2項與 Safari桌面／手機2項通過，涵蓋三語×明暗、320／390／655／699／1440px，完整文字、44px點選區、卡片／緊湊表格、Space開啟詳情、Escape焦點還原及高對比選取。沒有忽略或移除pageerror斷言。CI於交付另記；未重跑未受影響的完整unit/integration、i18n或依賴稽核。


### 管理側欄修復（2026-10-27）

依主辦方標註 `/admin/tournaments/s7` 第一組導覽，修正共用 private workspace 的999px圓角遺留。Runtime：`5c9f0834548ebe4c0ce91ca5bc24efa94138fb32`，保留此前圖池修復。

- S7 工作側欄連結統一2px圓角、至少44px高度、內距與換行；目前頁採緞面鋼材／銀鋁薄板、3px金色左緣及輕微倒角，移除棕色膠囊底色。
- 管理群組以細分隔線和穩定間距區隔，群組標題使用次要文字。未更改路由、文字、ARIA、角色或資料；手機仍沿用原本展開／切頁收起行為。
- 高對比模式移除金屬材質與陰影，使用系統 Highlight 外框標示目前頁。

[937px Light](admin-sidebar-light.png)／[Dark](admin-sidebar-dark.png) · [390px 展開 Light](admin-sidebar-mobile-light.png)／[Dark](admin-sidebar-mobile-dark.png)。使用隔離測試 DB 的合成 Admin，直接截取實際導覽群組，原生2×，無後製。

本輪 `npm run check`、production build、最終 tsc／ESLint、文件連結與 diff 檢查通過。新增 Chrome 桌面／手機2項與 Safari桌面／手機2項全部通過。原有24組UI／24次Axe AA與4組forced colours重新通過，另四組側欄Axe AA零違規。新增桌面／手機回歸涵蓋三語×明暗、320／390／760／768／937／1440px、44px點選區、無水平溢出、唯一目前頁、鍵盤焦點／Enter導覽、手機切頁收起與高對比。手機焦點驗證先由觸控切換到鍵盤模式，不移除焦點斷言。

前一輪 `a901d8a` 的 core CI（40450166113）已完成但失敗：verify／build／header與remote檢查成功；五個一般E2E shard的匿名無cookie斷言遇到 main #383 新增的 `oclr-system-theme=light`。此處據實保留該未解決的跨功能驗證限制，不將舊版pending狀態或本機S7回歸稱作完整CI通過。本輪未更改該跨功能cookie邏輯／斷言；新head的CI另記於#198。未重跑未受影響的完整unit/integration、i18n或依賴稽核，沒有合併或部署。
