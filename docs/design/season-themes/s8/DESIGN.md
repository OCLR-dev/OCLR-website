# S8 — Sakura Circuit / 櫻花折線

**2026-10-27 正式接入**：初稿已由主辦方確認，本輪註冊 `sakura-circuit`，選單顯示「S8 · 櫻花折線／樱花折线／Sakura Circuit」。本輪依回饋精修花枝：移除標題橙色折角與統計角標，改為細緻櫻花插畫與漸淡分隔線；名稱沿用原 issue，視覺不強求折線元素。正式 CSS 與素材位於 `src/app/sakura-theme.css`／`public/themes/sakura-circuit/`；migration `0047_sakura_circuit_appearance` 僅擴充設定／稽核約束。下文保留初稿產圖時的歷史流程與證據，正式接入驗證另記於 #197。

**目前狀態（2026-10-27）**：PR #378 已合併；本輪人物及標題比例修復基於 main `d34378e`，最新runtime `ce92b4db2bd5e3397117ee009e9dc872ad36563b`。下方初稿流程與舊驗證保留為歷史，最新人物與驗證見文末；修復尚未合併或部署。

追蹤：[#197](https://github.com/OCLR-dev/OCLR-website/issues/197)。2026-10-27 依主辦方要求啟動，先交付最新實際 UI 的初稿；本輪另依回饋納入使用者提供的 RULES banner，並選用補全女主角的半身像。尚未註冊正式 appearance。

## 設計主張

**春日紙感、櫻花插畫與橙色折線。** 以原 S8 主視覺的櫻花粉 `#F175AF`、柑橘橙 `#FF762E` 和暖白為主，角色以原 banner 的金髮、琥珀眼、淡藍紫髮帶延伸；莓粉用於可讀的互動文字，橙色用於小面積折角與印刷線。

內容沿用目前頁面：頁面標題／角色 → 完整無框 S8 原圖及五列統計 → 完整規則／原 RULES banner 封面；圖池與 Admin 延續現有工作結構。桌面半身像在標題右側，1100px 以下在文字下方保留獨立區域，避免與標題重疊。資料核心維持實色，裝飾集中在標題與區段邊緣。原圖區採自然 16:9 比例減少多餘留白，五列統計保留 24px 水平內距。

互動沿用現有元件：導航選取以莓粉底線與底色辨識，按鈕保留 hover／press 回饋，手機選單沿用現有開合與 Escape 焦點回復。尊重 reduced motion；高對比模式移除角色、花枝與裝飾，規則封面回到歷史原圖，保留系統色選取／焦點。沒有新增持續動畫、字體或套件。

## 最新 UI 與資料

基準為 canonical main `a50e03d`（已合併 S9 正式選項的版本）。直接 production build 並開啟現有 Next.js 應用，瀏覽器加入 [候選 CSS](../s8.css)，不建立替代頁面 renderer。

| 真實路由 | 使用內容 |
| --- | --- |
| `/tournaments/s8` | Header、TournamentShell、HistoricalArchiveView、完整原圖／五列統計、RulesHandbook |
| `/tournaments/s8/mappools` | 現有圖池階段、搜尋、排序、模組篩選、卡片／緊湊視圖 |
| `/admin/settings` | 原有側欄／手機導航、SiteAppearanceForm、真實設定控制 |

使用 repository 已提交的完整 S8 archive 與正常讀模型。歷史名字、賽果、規則、譜面文字、來源與時間皆保持 literal；fixture summary 為 `Design preview using the committed S8 archive.`。公開頁匿名，Admin 只使用隔離 test DB 的合成帳號 `Synthetic UI Preview`，無實際角色授予或 OAuth bypass。產圖時對外連線與非 GET／HEAD 皆封鎖，不按儲存。

## Banner 與角色

- **原 banner**：[source-rules-banner.png](source-rules-banner.png)，750×110，使用者提供，保留原檔。圖中文字是 RULES，因此沿用現有 RulesHandbook 規則封面位置，完整 contain；既有三語規則標題與正文保留，不將 RULES 置於無關頁面。
- **半身女主角**：[heroine-half.webp](heroine-half.webp)，1536×1024 透明插畫。使用內建 image_gen，依原 banner 補全後按回饋改為半身；金髮、琥珀眼、髮帶及手靠臉的姿態呼應原圖。衣飾為候選延伸，並非原圖未顯示部分的還原保證。保留 [PNG](heroine-half.png) 與 [完整提示詞／來源](ARTWORK.md)。
- **櫻花枝紋**：[sakura-sprig.svg](sakura-sprig.svg)，自繪五瓣缺口櫻花、細枝與橙色折角。只佔用非閱讀區。
- **原主視覺**：[thumbnail.jpg](../../../../public/archive/s8/thumbnail.jpg)，完整 1920×1080／16:9、無框 contain；不裁切、重繪、調色或修改原圖文字。

## 候選 tokens

| Token | Light | Dark |
| --- | --- | --- |
| `--site-background` | `#FFF8FA` | `#241A22` |
| `--site-surface` | `#FFFFFF` | `#30212B` |
| `--site-raised` | `#FFF0F5` | `#3C2A36` |
| `--site-tint` | `#FCE8F0` | `#492D3E` |
| `--site-foreground` | `#492738` | `#FFEEF5` |
| `--site-muted` | `#805C6D` | `#D6B3C5` |
| `--site-secondary-text` | `#704357` | `#F0CEDE` |
| `--site-accent`／`--site-primary` | `#A92E62` | `#FFA6CF` |
| `--site-border` | `#ECD0DB` | `#634352` |
| `--site-control-border` | `#986778` | `#BD8FA5` |
| `--site-on-primary` | `#FFFFFF` | `#422337` |
| `--site-selection` | `#F7CCDF` | `#623E54` |
| panel／control radius | 8px | 8px |

正常文字與控制框分別使用可讀深色／淺色 tokens；明亮粉橙屬裝飾，不作小字。成功、警告、錯誤與 mod 語意保持獨立。系統 sans 與 tabular 數字沿用目前實作。

S8 保留現有十一款 appearance 的 MainSheet 結構與偏好優先序，原有 S9／S10 成果亦保留；本版不增加正式選項、不自動更改歷史賽事預設。這是本次「先給初步設計」的交付範圍。

## 檢視與重現

[離線圖庫](../s8.html) 切換真實頁面、明暗、手機／桌面與最新原有風格。它只檢視已提交截圖，不提供假管理操作或儲存偏好。看圖庫無需 DB／帳號。

重新產圖需獨立 loopback 應用及明確命名的可丟棄 test DB；不要使用 demo／production：

```sh
npm ci
export TEST_DATABASE_URL=postgresql://YOUR_LOCAL_TEST_CONNECTION/oclr_197_design_test
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s8/prepare.ts
npm run build
APP_URL=http://127.0.0.1:3197 DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 PRIVACY_CONTACT_OSU_ID=60001 npm start -- --hostname 127.0.0.1 --port 3197
# 另一終端保留相同 TEST_DATABASE_URL：
node --import tsx docs/design/season-themes/s8/capture.mjs
```

工具核對應用 `src`／`messages`／品牌資產與 UI 基準一致，套色前後 DOM 元素與顯示文字相同；輸出明暗 × 320／390／768／1440px × 三個路由的結果，另查原圖、手機選單、焦點、sticky stack 與 forced colours。可用 `S8_UI_BASELINE` 指定經核對的完整 SHA，`S8_PREVIEW_ORIGIN` 指定另一 loopback 來源。

本次實際結果見 [verification.json](verification.json)。2026-10-24 靜態樣本證據保留為 [verification-static-2026-10-24.json](verification-static-2026-10-24.json)，不視為本版結果。初稿檢查不代表完整應用回歸、三語正式整合、CI 或部署驗收。

設計方法依 [Refactoring UI skill](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 的層級、留白、色彩與材質指引，並沿用 frontend skill，落在現有 MainSheet 元件上。

## 後續審閱

先確認角色半身構圖、原 banner 搭配、粉橙比例與明暗／手機方向，再安排正式 appearance 的三語名稱、白名單、migration、SSR／繼承、角色頁面、完整回歸與發佈驗收。授權、公開邊界及 OBS／presenter 隔離遵循既有設計。

## 本版實際檢查（2026-10-27）

- Node.js 24 `npm ci`、最新 main 的 production build 通過。
- 最終候選版：明暗 × 320／390／768／1440px × overview／mappools／Admin，共 24 組／24 次 Axe AA 無違規，無水平溢出或頁面錯誤。
- 4 組 forced-colours 通過；原圖 1920×1080／contain、五列統計、完整規則、DOM／文字保留、手機選單／Escape 焦點與 sticky stack 通過。
- 已檢視桌面／手機、明暗、Admin、規則區與原 banner 截圖；輸出 16 張主頁／圖池／規則／Admin 設計圖、2 張手機選單、12 張原有風格對照。
- 離線圖庫 24 種切換組合皆載入對應圖片，零 page errors；capture／prepare／gallery／共用 verifier 的 lint／語法、文件相對連結、SVG 及 `git diff --check` 通過。
- 本次為設計參考檔與產圖工具變更，未跑完整應用回歸或重新驗證其他季；上述結果不視為三語正式整合、CI、主辦方驗收或部署證據。


## 正式接入精修與驗證（2026-10-27）

- 移除標題橙色折角、統計角標與硬直花枝；改用 [精修櫻花插畫](blossom-spray.webp) 與漸淡 1px 分隔線。角色、原 RULES banner 與完整原主視覺保留。
- 正式名稱「S8 · 櫻花折線／樱花折线／Sakura Circuit」，`sakura-circuit`。三語 label、訪客 SSR 偏好、網站／賽事預設、讀取合約與 OpenAPI 共用既有白名單。
- `0047_sakura_circuit_appearance` 只擴充網站設定／稽核約束，不更動預設或歷史。套用 migration 後才可保存 S8 網站預設；刻意回退舊版前先選擇該版本支持的網站／賽事預設。
- Node.js 24 check／build、i18n extraction／4 項檢查、生成合約檢查、production audit（0 vulnerabilities）通過。161 個單元／整合測試檔，1,351 passed／1 skipped；含 0047 前拒絕、升級後保存及原 S9 預設／歷史保留。
- 34 項桌面／手機整合檢查通過：S8 三語明暗、S9／S10 選單、網站／賽事預設、公開／Admin／Captain 角色頁與 OBS／presenter 隔離。
- 本版 24 組／24 次 Axe AA 與 4 組 forced-colours，使用真正 `sakura-circuit` SSR cookie 和打包素材，沒有 CSS overlay。DOM／文字、原圖、選單與 sticky stack 保留；[紀錄](verification.json) 的應用基準為 `316c0eb`。

正式模式重現：先 checkout 本輪已提交應用，依前述步驟啟動獨立 test DB／loopback 應用，然後執行：

```sh
S8_REGISTERED_PREVIEW=1 S8_UI_BASELINE=316c0eb6f41bbae68071b0808b1f9c7982d835c5 node --import tsx docs/design/season-themes/s8/capture.mjs
```

工具保留同一應用來源核對；未來來源更新時須先核對新 SHA，不能將歷史證據當作新版本驗證。完整 CI 與主辦方審閱狀態另見 #197；本次沒有部署。

WebKit 桌面／手機兩項 S8 整合重驗通過；新增導航請求完成等待，避免測試在舊 RSC 預取尚未結束時改寫 cookie／重載，所有 pageerror 與畫面斷言保留。相同 S8 測試亦重驗 Chromium 桌面／手機兩項通過。


## 橙色細線補充（2026-10-27）

依主辦方回饋加入少量 1px 橙色印刷細線：頁首底緣使用淡暖橙，標題分隔線由橙色自然漸入原有粉色，統計資料面頂緣使用中央漸淡的細線。保留花枝與半身像；不加入折角或粗外框。明版 `--sakura-orange: #E7834B`／`--sakura-orange-soft: #EDB59A`，暗版 `#EDAA7A`／`#896048`，只作裝飾，不改主操作、狀態或焦點色。forced colours 下移除裝飾線，沿用系統色與原有選取／焦點。

本輪橙色細線版 production build、S8 Chromium 桌面／手機兩項、實際註冊主題 24 組／24 次 Axe AA 與 4 組 forced-colours 通過；版面、原圖、DOM／文字、選單焦點及 sticky stack 保留。未重跑無關單元／整合測試；前次接入證據與目前 CI 分開記錄。


## 頁首導覽顯示修正（2026-10-27）

依主辦方截圖移除主導覽選取背景；原本 68px 高選取區的 2px border-bottom 與 3px inset shadow 疊加，造成粉色長條與過粗底線。現在主導覽使用透明背景、莓粉選取文字與單條 1px 底線，清除選取陰影。側欄與賽事導覽的選取樣式各自保留。S8 整合檢查加上目前頁面連結不填底色、沒有重複陰影且只有細底線的回歸斷言。

本輪 build、S8 桌面／手機兩項回歸及四項頁首斷點／選單檢查通過；24 組／24 次 Axe AA 與 4 組 forced-colours 通過。回歸測試依主導覽實際 href 進入目前賽事後驗證選取，不假設歷史 S8 是全站目前賽事。一般／hover 的實際量測皆為透明背景、無 box-shadow、1px border-bottom；未重跑無關單元／整合檢查。


## 女主角樣貌修復（2026-10-27）

依主辦方對 `/tournaments/s8` 的人物標註，以原 RULES banner 為臉部／眼神／髮型參考，修整雙眼比例、頭部傾斜、臉型及髮絲線稿。保留既有半身姿勢、金髮、琥珀眼、淡藍紫髮帶、櫻花髮飾與衣飾延伸；仍是原圖角色的候選補全，不宣稱未顯示服裝是官方原稿。

正式引用 [heroine-half-refined.webp](heroine-half-refined.webp)，[生成 PNG](heroine-half-refined.png) 與完整內建 image_gen 提示詞保留於 [ARTWORK](ARTWORK.md)。1536×1024 的 PNG 轉為 quality 92 WebP，alpha 逐像素相同，約423KiB，較舊素材451KiB小。使用新檔名避免舊快取，舊素材保留作歷史。只更換人物素材引用，沿用既有340px／手機背景圖、底端淡出、高對比退場與 reduced motion，沒有新增產品文字、依賴、資料、權限或 migration。

[937px Light](heroine-937-light.png)／[Dark](heroine-937-dark.png) · [390px Light](heroine-390-light.png)／[Dark](heroine-390-dark.png)。直接取自實際頁面、繁中與原生2×像素，沒有候選CSS overlay、後製或拼貼；原 banner、主視覺、花枝及版面保持原有設計。人物樣貌修復當時的runtime為 `08851a1`；現有圖庫以頁首最新runtime為準。

重現時使用獨立 test DB，依上方流程 migrate／prepare／build／start，並執行：

```sh
S8_REGISTERED_PREVIEW=1 S8_UI_BASELINE=08851a183a94252bb831988f49d311b2849f5ba3 node --import tsx docs/design/season-themes/s8/capture.mjs
```

工具核對完整 `src`／`messages`／`public` 與 runtime SHA 一致，以正式SSR偏好和素材擷取24組UI／24次Axe AA、4組高對比與四張人物局部。最新實際結果以 [verification.json](verification.json) 與 #197 為準。此輪為插畫素材修復，不重跑未受影響的完整unit/integration、i18n或依賴稽核；既有正式接入證據不是本輪新跑結果，CI與合併／部署各自記錄。

本輪 Node.js24 `npm ci`、check／production build／最終tsc、工具ESLint／語法、文件連結與diff檢查通過。Chrome桌面／手機2項及Safari桌面／手機2項通過，涵蓋三語明暗、正式選單、SSR／跨頁、原圖／原banner、焦點與高對比。24組實際UI／24次Axe AA零違規，4組forced colours通過；16張頁面圖、四張人物2×局部、兩張手機選單與12張default對照已更新。新head的CI狀態另記於#197，未將本機結果稱為完整CI／部署通過。


## 標題大小／留白修復（2026-10-27）

依主辦方937px標題區標註，修正1100px以下一律切成上下排列、預留178px底部空間而人物僅164px高的比例。沿用 `codex/fix-s8-heroine`，保留前輪新人物素材，沒有再生成或重繪人物。

公開賽事內容區以 `sakura-content` inline-size container 判斷可用寬度。達680px時採左右排列，標題最小高度218px，人物寬在304至340px間收斂；文字與人物間隔24px。左下花枝縮至96×64px，並以獨立底部空間避開文字。窄內容維持上下排列；私有側欄工作區、原banner／主視覺、橙色細線及素材同人／來源紀錄延續原樣。文字可自然換行，不以固定高度裁切。

937px實測標題871.41×218px、人物331.13×217px；390px為358px寬的上下排列，人物250.59×164px。明暗版幾何相同。[937px Light](heading-937-light.png)／[Dark](heading-937-dark.png) · [390px Light](heading-390-light.png)／[Dark](heading-390-dark.png)。直接擷取正式SSR頁面、繁中與原生2×像素，沒有候選CSS overlay、拼貼或後製。summary使用主辦方標註的公開原文 `osu! Chinese League Rookie — Season 8. 2023 年歷史賽事歸檔。`，僅存於隔離合成test DB，不修改正式賽事；前輪英文fixture summary屬舊預覽紀錄。

最新重現命令（獨立test DB prepare／build／start後）：

```sh
S8_REGISTERED_PREVIEW=1 S8_UI_BASELINE=ce92b4db2bd5e3397117ee009e9dc872ad36563b node --import tsx docs/design/season-themes/s8/capture.mjs
```

工具核對完整 `src`／`messages`／`public` 與runtime SHA相同，使用正式SSR樣式產生24組UI／Axe AA、4組高對比、四張人物局部與四張完整標題2×圖。此輪只有CSS尺寸修復，未新增介面文字、依賴、資料或migration；沒有重跑未受影響的完整unit/integration、i18n或依賴稽核。前輪人物修整與正式接入結果不當成本輪新跑結果，CI狀態於#197分別記錄。尚未合併或部署修復。

本輪check／production build／最終tsc、工具ESLint／語法、文件連結與diff檢查通過。新增Chrome桌面／手機2項與Safari桌面／手機2項全部通過，每種瀏覽器涵蓋三語×明暗×十個尺寸（320／390／699／744／745／768／937／1100／1101／1440px）共60組幾何檢查，驗證文字／人物／花枝分隔、正常換行、無水平溢出、937px緊湊高度、Axe AA與高對比退場。另24組實際UI／24次Axe AA零違規、4組forced colours通過，原圖、五列統計、規則、手機選單焦點與sticky stack保留；16張頁面、四張人物局部、四張完整標題2×圖、兩張手機選單與12張default對照已更新。新head的CI於#197如實記錄。
