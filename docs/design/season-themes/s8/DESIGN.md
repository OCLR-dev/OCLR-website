# S8 — Sakura Circuit / 櫻花折線 · 初步設計

**2026-10-27 正式接入**：初稿已由主辦方確認，本輪註冊 `sakura-circuit`，選單顯示「S8 · 櫻花折線／樱花折线／Sakura Circuit」。本輪依回饋精修花枝：移除標題橙色折角與統計角標，改為細緻櫻花插畫與漸淡分隔線；名稱沿用原 issue，視覺不強求折線元素。正式 CSS 與素材位於 `src/app/sakura-theme.css`／`public/themes/sakura-circuit/`；migration `0047_sakura_circuit_appearance` 僅擴充設定／稽核約束。下文保留初稿產圖時的歷史流程與證據，正式接入驗證另記於 #197。

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
