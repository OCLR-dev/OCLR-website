# A — 電競轉播風 / Esports Broadcast

追蹤：[#235](https://github.com/PhoenixEmik/OCLR-website/issues/235) · **P3** · 已註冊為正式 appearance `esports-broadcast`，見文末「正式實作」。

## 視覺主張與範圍

以桃紅主互動色、青色數字與有限斜向裝飾建立競技速度感，主要資料表仍維持端正可讀。

「Broadcast」是介面視覺名稱，並不表示改造 OBS 或 presenter。它也不是 S7 的金屬黃或 S10 的天空插畫主題。

這份文件把附件的視覺語彙整理成可實作規格；本次只交付 docs、CSS 範例與離線 specimen。原檔的適用情境或風險評語是參考資料，並非已驗證的產品結論或額外開發授權。實作時需沿用 OCLR 現有框架、元件與業務規則。

## 原始來源與 CSS 抽取

- 第 1 批：`osu! Cup 風格預覽.html`，參考代碼 `A`。
- [原始 HTML 保存副本](../sources/batch-1.html)，SHA-256 `9da880c4342b88b0a374543dfdc79f016a3feb5a811d5a8543354f5a6b06f56c`。保存原始 bytes，不執行或搬入正式應用。
- [source.css](source.css) 僅逐行抽取原 `<style>` 中以 `.A` 起始的所有規則，包含同一行的多個 selector／rule；不改色、不重排、不格式化。
- CSS-block 相對行：28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38。抽取檔 SHA-256：`18734eb84d865c9c3c03fe45f5d122c88d8139d1c77693c29c85d818106b66d6`。
- 原型布局相依：[batch-1-shared.css](../sources/batch-1-shared.css)，包含原 `.mk`／導覽／hero／圖池資料結構與原 mobile media rule。它只用於理解原型，不與正式全域 CSS 合併。
- 原 `.mk .nv/.bd/.se/.tag/.bar/.bt/.tb/.mp/.st` 都是示意 class。原本 `.bt`／分頁使用 `span`，不能因此視為已可操作的按鈕或可存取分頁。

## 視覺語法

深色舞台、桃紅導覽底線、斜向標籤背景、截角 hero 裝飾、分段進度與青色槽位。

**布局與幾何：**面板 6px、控制項 4px；斜切限制在非互動偽元素，不 skew 按鈕文字或裁切容器。

**字體：**來源使用 Barlow Condensed 600／800 italic。正式候選只讓英文活動標題使用斜體／窄體；中英文內文沿用現有 system sans 16px／1.65，比分用 tabular-nums。

字級採 12／14／16／20／24／32／40／52px 的有限集合。52px 只用於短品牌字，內容標題 20–32px；內文 16px、行高 1.65，控制項 14px。對齊優先於裝飾，比分／星數使用 tabular-nums 並靠右；保持歷史隊名、身分與譜面 metadata 原文。

間距採 4／8／12／16／24／32／48px。區塊之間比區塊內留白更大；表格不套 hero 材質、不加多層空容器，不因風格而隱藏實際比賽資訊。

## 原始版到 MainSheet 的修正

來源 A 整站固定深色、整顆按鈕 skew、hero clip-path 及窄體內文。應補獨立亮色版，把斜切改成純裝飾層，並保留表單焦點／選單可見性。

[mainsheet.example.css](mainsheet.example.css) 是**重新整理的候選 CSS**，不是忠實抽取檔，也不是已完成的整站 skin。範圍限定於 `html[data-appearance="esports-broadcast"] .themed-site`。候選 key `esports-broadcast` 只在離線範例出現，未加入 `src/lib/preferences.ts` 或 schema／DB 白名單。

- 原始色、框線、漸層與裝飾可在 `source.css` 查回；候選版另外定義可讀的 light／dark 語意色。
- 文字與互動在減少裝飾、關閉陰影／模糊／字型後仍須可辨；顏色不能是唯一的狀態提示。
- 英文 display 字型為候選素材，不附帶字型授權證據；本次範例只用本機系統回退，不發出 Google Fonts 請求。
- 決定採用後先做一頁功能導向的灰階布局，再套本款 token 與有限效果；不新增框架、不複製原型資料。

## 明暗語意色候選

| MainSheet token         | Light candidate | Dark candidate |
| ----------------------- | --------------- | -------------- |
| `--site-background`     | `#f4f6fa`       | `#0e1116`      |
| `--site-surface`        | `#ffffff`       | `#171c25`      |
| `--site-raised`         | `#edf0f7`       | `#232a36`      |
| `--site-tint`           | `#fce4ef`       | `#3f2334`      |
| `--site-foreground`     | `#151b28`       | `#e9edf2`      |
| `--site-muted`          | `#536075`       | `#b2bccb`      |
| `--site-secondary-text` | `#38465d`       | `#cdd6e2`      |
| `--site-accent`         | `#b71959`       | `#ff75af`      |
| `--site-border`         | `#cbd2df`       | `#3e4a5f`      |
| `--site-control-border` | `#6b7890`       | `#8190a9`      |
| `--site-primary`        | `#b71959`       | `#ff75af`      |
| `--site-primary-hover`  | `#991148`       | `#ff9bc5`      |
| `--site-on-primary`     | `#ffffff`       | `#23101b`      |
| `--site-header`         | `#ffffff`       | `#171c25`      |
| `--site-accent-strong`  | `#b71959`       | `#ff75af`      |
| `--site-focus`          | `#b71959`       | `#ff75af`      |
| `--site-selection`      | `#fce4ef`       | `#3f2334`      |
| `--site-highlight`      | `#b71959`       | `#ff75af`      |
| `--site-connector`      | `#6b7890`       | `#8190a9`      |
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
- 可保留 120–180ms hover／pressed 色彩與小幅位移；分段進度依真實值顯示，不做跑馬燈、閃爍或持續流動。
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

## 正式實作（#235）

正式樣式位於 [src/app/esports-theme.css](../../../../src/app/esports-theme.css)，以 `html[data-appearance="esports-broadcast"] .themed-site` 為範圍；OBS／presenter 不受影響（草稿 overlay 在本款與原有風格下逐像素相同）。整體方向是「賽場轉播包裝」，下列為與上方候選 CSS 的差異：

- **轉播條。**header 在明暗兩版都是黑色轉播條（細斜紋底），底部 3px 桃紅線，線尾接一段青色與黃黑警示膠帶；目前頁以桃紅底線標示。外觀／語言／帳號選單與手機導覽從轉播條展開，沿用同組深色 token。首頁 header 只在選用本款時改為轉播條，其他 appearance 仍保留 `home.css` 的 S11 配色。暗色版整頁是「深色舞台」（`#0b0e14`）。亮色版是獨立配色（冷灰 `#eef1f6`），只在公開頁與登入頁頂部保留深色舞台：麵包屑與賽事導覽、頁面標題，以及賽事主頁 hero 的上半部，坐在全寬深色帶上並以桃紅線收尾；以下內容維持亮色，修正來源整站固定深色的限制。舞台帶以 `border-image` outset 繪製，不改變版面、不產生橫向捲動；`forced-colors` 下移除；有側欄的 Admin／Player／Captain 工作區不套用。
- **材質。**頁面底層是細 LED 點陣；暗版另加頂部桃紅舞台光。分頁軌道帶極淡斜紋。面板與卡片保持實色底，文字不壓在花紋上。
- **配色角色。**桃紅＝操作與主要按鈕（亮 `#c2125f`／暗 `#ff4f9a`）；青色＝資料與選中槽位（分頁、mod 篩選、選單項目、譜面槽位牌、比分、圖池統計）。訊號黃只出現在黑底上（警示膠帶、頁首標籤後的斜線牌），避免與 S7 金屬黃混淆；直播紅標示「目前階段」與對戰卡第 1 方（第 2 方為青色），白字對比 5.33:1。青、黃、紅都只是裝飾或位置提示，不覆蓋 success／warning／danger 或 NM／HD／HR／DT／FM 語意。
- **銳利度。**主要按鈕帶無模糊的硬投影板（亮版黑、暗版青），按下時位移 2px 嵌入；選中槽位帶 2px 黑色硬投影。次要、header、選單與軌道按鈕維持平面。圖池統計改為黑底記分板條，數字青色。
- **斜切只在裝飾層。**頁首 eyebrow 的斜向桃紅底牌與黑底黃斜線牌、段落標題前的三道速度斜線、目前分頁的斜向刻度都是 `pointer-events:none` 的偽元素；面板左上角的桃紅角標由背景繪製；譜面槽位牌的斜尾也是偽元素。主視覺的「截角」是覆蓋在框角的裝飾層（右下角斜線截角、右上角青色框角），容器不 clip-path，原圖不調色。
- **字體。**活動標題（賽事主頁標題、橫幅標題、賽季 hero）使用本地打包的 Barlow Condensed ExtraBold Italic（SIL OFL 1.1，`public/fonts`，只含 Latin 子集的單一 woff2，約 24 KB；來源的 600 字重沒有對應用途，故不打包）；`unicode-range` 只涵蓋 Latin，中文標題維持直立系統字體。頁面標籤與中英文內文沿用系統 sans、16px／行高 1.65，比分使用 tabular-nums。無遠端字體請求。
- **表格。**表頭呼應轉播條並加桃紅底線，在表頭內局部翻轉文字／連結 token；資料列維持端正，偶數列加淡底以利掃讀。
- **狀態。**disabled 為虛線框加 raised 底與 muted 文字且無投影；selected 為青色填色加邊框與粗體；focus 為 3px 實線、4px offset；連續文字中的連結加底線。`forced-colors` 下移除投影與所有裝飾層，選中改用 `Highlight`／`HighlightText`（並關閉文字背板以免蓋住文字）；`prefers-reduced-motion` 移除過渡與按壓位移；無閃爍或持續動畫。
- **對比。**正常文字在 background／surface／raised／tint／selected 上均 ≥4.5:1（亮版最低 4.84，暗版最低 5.03），控制邊框與焦點 ≥3:1（最低 3.51）；轉播條與記分板上文字最低 6.09:1。
