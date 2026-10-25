# F — 漫畫風 / Manga / Halftone

追蹤：[#238](https://github.com/PhoenixEmik/OCLR-website/issues/238) · **P3** · 已註冊為正式 appearance `manga-halftone`，見文末「正式實作」。

## 視覺主張與範圍

用粗細有序的墨線、少量網點與對話框輪廓建立漫畫辨識度，讓比賽內容保持第一層級。

B Swiss 用細線與留白；F 使用粗墨線、網點及對話框造型。不可把現有 Swiss 單純改成粉紅再稱為漫畫風。

這份文件把附件的視覺語彙整理成可實作規格；本次只交付 docs、CSS 範例與離線 specimen。原檔的適用情境或風險評語是參考資料，並非已驗證的產品結論或額外開發授權。實作時需沿用 OCLR 現有框架、元件與業務規則。

## 原始來源與 CSS 抽取

- 第 2 批：`osu! Cup 風格預覽（第二批）.html`，參考代碼 `F`。
- [原始 HTML 保存副本](../sources/batch-2.html)，SHA-256 `da9be1f7462054c7d415dfd26f282e092aed2ad05c472c36d3ad7c8308f5d511`。保存原始 bytes，不執行或搬入正式應用。
- [source.css](source.css) 僅逐行抽取原 `<style>` 中以 `.F` 起始的所有規則，包含同一行的多個 selector／rule；不改色、不重排、不格式化。
- CSS-block 相對行：42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56。抽取檔 SHA-256：`6c1c5fb8cd9cb8dc5fbb64723a6e8a9733d13321be908654069f1bbb95e6bc27`。
- 原型布局相依：[batch-2-shared.css](../sources/batch-2-shared.css)，包含原 `.mk`／導覽／hero／圖池資料結構與原 mobile media rule。它只用於理解原型，不與正式全域 CSS 合併。
- 原 `.mk .nv/.bd/.se/.tag/.bar/.bt/.tb/.mp/.st` 都是示意 class。原本 `.bt`／分頁使用 `span`，不能因此視為已可操作的按鈕或可存取分頁。

## 視覺語法

3px 墨線、英文漫畫標題、對話框標籤、hero 角落網點與有限速度線。

**布局與幾何：**面板與按鈕 2px 方角，hero 3px 框；只在大區塊用粗框，表格內線回到 1px。

**字體：**來源 Bangers 只負責英文 display；中文採 system sans 600／700。範例不載入遠端字體；正式字型須先確認授權、可用字形、字寬與三語回退。

字級採 12／14／16／20／24／32／40／52px 的有限集合。52px 只用於短品牌字，內容標題 20–32px；內文 16px、行高 1.65，控制項 14px。對齊優先於裝飾，比分／星數使用 tabular-nums 並靠右；保持歷史隊名、身分與譜面 metadata 原文。

間距採 4／8／12／16／24／32／48px。區塊之間比區塊內留白更大；表格不套 hero 材質、不加多層空容器，不因風格而隱藏實際比賽資訊。

## 原始版到 MainSheet 的修正

來源每個數值都加粗框、按鈕 rotate(-2deg)、網點與速度線可能遮字。需固定文字幾何、限制紋理面積，暗版用溫白墨線而非滿頁純白粗框。

[mainsheet.example.css](mainsheet.example.css) 是**重新整理的候選 CSS**，不是忠實抽取檔，也不是已完成的整站 skin。範圍限定於 `html[data-appearance="manga-halftone"] .themed-site`。候選 key `manga-halftone` 只在離線範例出現，未加入 `src/lib/preferences.ts` 或 schema／DB 白名單。

- 原始色、框線、漸層與裝飾可在 `source.css` 查回；候選版另外定義可讀的 light／dark 語意色。
- 文字與互動在減少裝飾、關閉陰影／模糊／字型後仍須可辨；顏色不能是唯一的狀態提示。
- 英文 display 字型為候選素材，不附帶字型授權證據；本次範例只用本機系統回退，不發出 Google Fonts 請求。
- 決定採用後先做一頁功能導向的灰階布局，再套本款 token 與有限效果；不新增框架、不複製原型資料。

## 明暗語意色候選

| MainSheet token         | Light candidate | Dark candidate |
| ----------------------- | --------------- | -------------- |
| `--site-background`     | `#fbfaf8`       | `#171418`      |
| `--site-surface`        | `#ffffff`       | `#251e25`      |
| `--site-raised`         | `#f3edf1`       | `#352b34`      |
| `--site-tint`           | `#fce1ed`       | `#4d2e41`      |
| `--site-foreground`     | `#171515`       | `#fff5fa`      |
| `--site-muted`          | `#64565c`       | `#d6b8c8`      |
| `--site-secondary-text` | `#45343d`       | `#efd7e4`      |
| `--site-accent`         | `#b42366`       | `#ff97c7`      |
| `--site-border`         | `#171515`       | `#bc9aae`      |
| `--site-control-border` | `#171515`       | `#bc9aae`      |
| `--site-primary`        | `#171515`       | `#ff7eb9`      |
| `--site-primary-hover`  | `#40303a`       | `#ffacd3`      |
| `--site-on-primary`     | `#ffffff`       | `#291020`      |
| `--site-header`         | `#ffffff`       | `#251e25`      |
| `--site-accent-strong`  | `#b42366`       | `#ff97c7`      |
| `--site-focus`          | `#b42366`       | `#ff97c7`      |
| `--site-selection`      | `#fce1ed`       | `#4d2e41`      |
| `--site-highlight`      | `#b42366`       | `#ff97c7`      |
| `--site-connector`      | `#171515`       | `#bc9aae`      |
| `--site-success`        | `#21664c`       | `#91e0bd`      |
| `--site-warning`        | `#805500`       | `#f0ce85`      |
| `--site-danger`         | `#b32343`       | `#ffa0b4`      |
| `--site-shadow`         | `#17213725`     | `#0006`        |
| `--site-soft-shadow`    | `#17213714`     | `#0003`        |
| `--site-panel-shadow`   | `#17213720`     | `#0005`        |
| `--site-dialog-shadow`  | `#17213745`     | `#0009`        |
| `--site-backdrop`       | `#10131d80`     | `#050810b3`    |

其他幾何 token 與本款效果可直接閱讀候選 CSS。`--style-detail` 是 review-only 的裝飾輔色，不能拿去覆蓋 `--site-success`／`--site-warning`／`--site-danger` 或既有 NM／HD／HR／DT／FM 的語意 token。來源裡的草綠、黃、青、粉不代表正式賽事狀態。

## 元件對照與資訊層級

| 來源         | OCLR 接入目標                                     | 規則                                                                                 |
| ------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `.nv`        | 既有 `site-header`、navigation、appearance menu   | 保留導航與 menu geometry、授權項目、選中和焦點。裝飾不得裁切展開選單。               |
| `.se`        | `season-overview-hero`、必要的 edition summary    | 保留核准主視覺與實際資料，完整圖片策略依該頁既有規格；不從附件引入 Season 3 或日期。 |
| `.tag`       | `.badge` 與既有狀態／Captain／Tier                | 狀態有文字，Captain 仍逐語系字面 `Captain`；不能用風格改資料意義。                   |
| `.bar`       | 既有真實數值所驅動的進度呈現                      | 有權威分子／分母才顯示，以原生 progress 或既有語意元件實作；不得製造報名容量。       |
| `.bt`        | 真實 `button`／`a` 與既有 loading／disabled       | 全部維持 ≥44px，只有主要動作用實心色；操作與 OAuth／deep-link 路徑不變。             |
| `.tb`        | 既有 mappool stage／mod filters                   | 保留真正 filter／tab 行為、鍵盤、selected 與移動版折行；不能只複製 span。            |
| `.mp`／`.st` | `map-browse-card`、slot badge、metadata、表格     | 譜面名稱不翻譯，長名稱可換行，數字可比對；圖片與資料讀取依現有 service。             |
| 無原型對應   | Admin／Player／Captain 表單、dialog、empty／error | 沿用共用 tokens，另做真實應用驗證，不宣稱單張原型涵蓋所有頁面。                      |

## 手機、鍵盤與動態

- 1440／1024px：保留清楚工作面與次要資訊，表單只用必要寬度；768px：支援標題／工具列換行。
- 390／320px：單欄；長中英標籤、隊名、map title 可換行；header／appearance menu 不與控制台或語言選單重疊。
- 表格僅在原有語意確實需要時使用具名的局部 scroller；不可用 `body overflow-x:hidden` 蓋掉真實頁面溢出。
- 按下可改填色或縮短硬陰影；不做漫畫閃白、震動與持續速度線。裝飾層 pointer-events:none，不取代狀態文字。
- 3px 可見焦點、4px offset；按鈕與輸入 44px 起，hover／focus／selected／pressed／disabled 不互相混淆。
- `forced-colors` 退回系統 Canvas／CanvasText／Highlight，移除陰影與裝飾圖層；減少透明與不支援模糊的情形需保有實色內容背景。

## 對比、效能與降級

正常文字／輔助文字 ≥4.5:1，非文字控制邊界與焦點 ≥3:1；先檢查背景、surface、raised、tint 與 selected 狀態，不能只量主色按鈕。小字不以更淡顏色表現弱層級，先調整位置與重量。

裝飾偽元素必須 `pointer-events:none`，不能覆蓋連結、遮蔽 focus ring 或改變可點區。不要在主視覺原圖上重繪／調色以迎合皮膚。字型核對授權後本地打包、控制字重與檔案數，保留系統回退與可用中文字形。大型資料表、逐列陰影、反覆 blur 與背景動畫需避免；不新增第三方 UI／動畫依賴。

## 如何審閱範例

[preview.html](preview.html) 是功能導向的 CSS specimen：hero／進度、primary／secondary、mod 選取、譜面列、平面表格、表單及錯誤訊息。它使用共用 [component-preview.css](../component-preview.css) 加本款候選 CSS，並重用現有 MainSheet token 名稱；**不使用正式 React 元件或資料 service**。

在完整 checkout 中用瀏覽器開啟；`?theme=dark` 可直接看暗版，或用 Light／Dark 切換。數值與隊名全是標記清楚的測試示意。按鈕、mod 選取與表單只在頁面內更新，不寫入 cookie／localStorage、不呼叫 API、不變更偏好。已生成預覽與檢查結果後，會列在本文件末尾。

## 後續正式接入

以 [INTEGRATION.md](../INTEGRATION.md) 為共用接入與驗收清單。需保留訪客 → 當前授權／已發佈賽事 → 全站預設、SSR 首屏、獨立 light/dark、清除偏好後的當前路由繼承。普通頁共用 MainSheet，OBS／presenter 隔離；授權／發佈邊界與 appearance 無關。

本 issue 維持開啟，直到正式實作與相關驗收完成；文件交付或離線掃描通過不等於此主題已上線。

## 已完成的離線驗證（2026-10-24）

- 原附件 hash 與 CSS 抽取逐字比對通過；來源 CSS 與候選 CSS 均可解析。
- 8 組 viewport／明暗組合通過，8 次 Axe AA 掃描零違規；無頁面溢出／script error／失敗資產請求。明暗切換、mod 選取、可見鍵盤焦點及本機表單預覽／重設通過。
- forced colors 降級通過。
- [Desktop Light](desktop-light.webp)／[Dark](desktop-dark.webp)；[Mobile Light](mobile-light.webp)／[Dark](mobile-dark.webp)。
- [本款機器可讀報告](verification.json)。這些結果只涵蓋離線 CSS specimen，未驗收正式頁面、三語、DB migration 或部署。

## 正式實作（#238）

正式樣式位於 [src/app/manga-theme.css](../../../../src/app/manga-theme.css)，以 `html[data-appearance="manga-halftone"] .themed-site` 為範圍；OBS／presenter 不受影響。實作對照本文件的規格：

- **配色沿用上方候選 token。**亮版白紙 `#fbfaf8`、墨 `#171515`、強調 `#b42366`；暗版 `#171418`／`#251e25`、主要按鈕 `#ff7eb9`。網點粉 `#ff4f9a`（暗版 `#c94a85`）只作裝飾，不作狀態色。所有文字對 background／surface／raised／tint／selected ≥5.0:1，墨線與 focus ≥5.0:1。
- **墨線分級，2px 方角。**3px：hero 橫幅、面板、規則、賽事卡、dialog 等大區塊；2px：按鈕、輸入框、選單、篩選軌道與反覆卡片；1px：表格列線。表格表頭改為黑底白字的旁白帶。來源中每個數值都加粗框的做法不保留。
- **字體。**英文 display 標題、頁面 eyebrow 與譜面 slot 標籤使用 Bangers（SIL OFL 1.1，取自 `@fontsource/bangers` 5.3.0 的 Latin woff2，本地打包於 `public/fonts`）。`unicode-range` 只含 Latin，中文字自動回退系統 sans 並維持 700；Bangers 只有 400，關閉粗體合成。已核對字形涵蓋英文、數字與常用標點（★ 回退系統字體）；無遠端字體請求。
- **漫畫分格（コマ）。**賽事概覽頁以漫畫頁面編排：標題、主視覺與階段滾輪為三個 3px 墨線格，間以窄白縫；標題格切一個斜角，標題上方的對話框突出格框。
- **對話框種類。**對白框：頁面 eyebrow 與狀態提示 `.notice`（含尾巴）；目前階段為對白框，「當前階段」標籤為爆炸框（墨色實心底上的白字，尖角為額外圖層）；空狀態為思考框（圓角雲框加兩個小泡）；規則目錄標題為旁白框。裝飾偽元素皆 `pointer-events: none`。
- **漫畫家工具。**網點：標題格斜角處的大小漸變網點與進度條；網線（斜線網點）：賽事卡片的陰影，由紙張圖層隔開，不會落在內容上；G 筆：章節標題下方粗細漸變的筆觸；速度線：頁面標題下方；墨水與筆尖：頁尾分隔線中央的 G 筆筆尖與墨滴。
- **紋理限定面積。**網點只在標題格的斜角一側，大點靠近角落、小點向外淡出，不疊在賽事主視覺上，768px 以下不顯示；標題文字與網點不重疊（已在 768／1024／1440px 量測）。全部紋理不在文字背後。
- **按鈕不旋轉。**移除來源的 `rotate(-2deg)`；主要按鈕為墨色實心加 3px 粉色套印偏移，按下時偏移縮為 1px 並平移 2px（`transform` 不影響版面）。
- **狀態不依賴陰影或顏色。**selected／目前分頁／已勾選選單為墨色反白加粗；disabled 為虛線框加既有透明度；focus 為 3px 實線、4px offset。`forced-colors` 移除陰影與裝飾，並為選中項加底線。
- **暗版溫白墨線。**暗版所有墨線為溫白 `#e9dccb`，沒有滿頁純白粗框。
- **首頁 header。**與 Claymorphism 相同，只在選擇本款時改用本款墨線 header；其他 appearance 保留 S11 首頁配色。
