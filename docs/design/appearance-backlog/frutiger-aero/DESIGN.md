# G — Y2K 水晶風 / Frutiger Aero

追蹤：[#239](https://github.com/PhoenixEmik/OCLR-website/issues/239) · **P3** · 已註冊為正式 appearance `frutiger-aero`，見文末「正式實作」。

## 視覺主張與範圍

以天空藍、薄荷綠與受控光澤回應水晶質感，表格與規則書則維持平面高可讀表面。

這是跨賽季材質語彙，與 S10 晴空未來城的原圖／色票提案分開。與 H 的背景模糊也不同：G 強調高光與光澤，並不依賴 blur。

這份文件把附件的視覺語彙整理成可實作規格；本次只交付 docs、CSS 範例與離線 specimen。原檔的適用情境或風險評語是參考資料，並非已驗證的產品結論或額外開發授權。實作時需沿用 OCLR 現有框架、元件與業務規則。

## 原始來源與 CSS 抽取

- 第 2 批：`osu! Cup 風格預覽（第二批）.html`，參考代碼 `G`。
- [原始 HTML 保存副本](../sources/batch-2.html)，SHA-256 `da9be1f7462054c7d415dfd26f282e092aed2ad05c472c36d3ad7c8308f5d511`。保存原始 bytes，不執行或搬入正式應用。
- [source.css](source.css) 僅逐行抽取原 `<style>` 中以 `.G` 起始的所有規則，包含同一行的多個 selector／rule；不改色、不重排、不格式化。
- CSS-block 相對行：58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71。抽取檔 SHA-256：`0e20f5f12dea2f35dbe0b81467831ee14c6b4bab74cb5692620afd6ff3a827d8`。
- 原型布局相依：[batch-2-shared.css](../sources/batch-2-shared.css)，包含原 `.mk`／導覽／hero／圖池資料結構與原 mobile media rule。它只用於理解原型，不與正式全域 CSS 合併。
- 原 `.mk .nv/.bd/.se/.tag/.bar/.bt/.tb/.mp/.st` 都是示意 class。原本 `.bt`／分頁使用 `span`，不能因此視為已可操作的按鈕或可存取分頁。

## 視覺語法

天空藍背景、藍色圓形槽位、玻璃高光、草地綠進度與粉紅光澤 CTA。

**布局與幾何：**面板 20px、控制項 999px；圓形槽位只保留給短碼，長標籤回退普通文字，按鈕高度至少 44px。

**字體：**來源 Varela Round 為圓潤英文字體，中文使用 Noto Sans TC。範例使用 system sans；正式先評估已打包字型與三語回退，不連 Google Fonts。

字級採 12／14／16／20／24／32／40／52px 的有限集合。52px 只用於短品牌字，內容標題 20–32px；內文 16px、行高 1.65，控制項 14px。對齊優先於裝飾，比分／星數使用 tabular-nums 並靠右；保持歷史隊名、身分與譜面 metadata 原文。

間距採 4／8／12／16／24／32／48px。區塊之間比區塊內留白更大；表格不套 hero 材質、不加多層空容器，不因風格而隱藏實際比賽資訊。

## 原始版到 MainSheet 的修正

來源白框落在淺色漸層上太淡、部分 metadata 藍字對比弱、泡泡可能遮字。應改用明確控制邊界，限制光澤只在 CTA／進度與 hero 裝飾，不把每列資料變成玻璃。

[mainsheet.example.css](mainsheet.example.css) 是**重新整理的候選 CSS**，不是忠實抽取檔，也不是已完成的整站 skin。範圍限定於 `html[data-appearance="frutiger-aero"] .themed-site`。候選 key `frutiger-aero` 其後已正式加入 `src/lib/preferences.ts`、三語名稱與 schema／DB 白名單；正式樣式見 [src/app/frutiger-theme.css](../../../../src/app/frutiger-theme.css)。

- 原始色、框線、漸層與裝飾可在 `source.css` 查回；候選版另外定義可讀的 light／dark 語意色。
- 文字與互動在減少裝飾、關閉陰影／模糊／字型後仍須可辨；顏色不能是唯一的狀態提示。
- 英文 display 字型為候選素材，不附帶字型授權證據；本次範例只用本機系統回退，不發出 Google Fonts 請求。
- 決定採用後先做一頁功能導向的灰階布局，再套本款 token 與有限效果；不新增框架、不複製原型資料。

## 明暗語意色候選

| MainSheet token         | Light candidate | Dark candidate |
| ----------------------- | --------------- | -------------- |
| `--site-background`     | `#eef8ff`       | `#112331`      |
| `--site-surface`        | `#ffffff`       | `#203646`      |
| `--site-raised`         | `#e1f1fb`       | `#2a4759`      |
| `--site-tint`           | `#d9eff9`       | `#244c62`      |
| `--site-foreground`     | `#0b3a57`       | `#e6f7ff`      |
| `--site-muted`          | `#46677a`       | `#b4d2e0`      |
| `--site-secondary-text` | `#2c5269`       | `#d0e7f1`      |
| `--site-accent`         | `#106284`       | `#90deff`      |
| `--site-border`         | `#b5d3e2`       | `#49687d`      |
| `--site-control-border` | `#577c90`       | `#80a8bf`      |
| `--site-primary`        | `#ffc3dc`       | `#ffc3dc`      |
| `--site-primary-hover`  | `#ffafd2`       | `#ffdae9`      |
| `--site-on-primary`     | `#4a0d28`       | `#4a0d28`      |
| `--site-header`         | `#ffffff`       | `#203646`      |
| `--site-accent-strong`  | `#0b4f6b`       | `#b6ecff`      |
| `--site-focus`          | `#106284`       | `#90deff`      |
| `--site-selection`      | `#d9eff9`       | `#244c62`      |
| `--site-highlight`      | `#106284`       | `#90deff`      |
| `--site-connector`      | `#577c90`       | `#80a8bf`      |
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
- 只讓 hover 高光或按下陰影有 120–180ms 回饋；不漂浮泡泡、不動畫大型漸層，也不持續追逐高光。
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

## 正式實作（#239）

正式樣式位於 [src/app/frutiger-theme.css](../../../../src/app/frutiger-theme.css)，以 `html[data-appearance="frutiger-aero"] .themed-site` 為範圍；OBS／presenter 使用 `.broadcast-site`，不受影響。下列為與上方候選 CSS 的差異：

- **天空與光澤。**整頁背後是一層固定、`pointer-events: none` 的天空藍到薄荷綠漸層；header 另加上亮下暗的光澤與藍／薄荷細線。edition 概覽標題是一張 20px 的天空卡片，右上角以背景漸層做出水晶高光，不是覆蓋在文字上的泡泡或圓形圖層，因此不會遮字、蓋住主視覺或焦點框。來源中「泡泡可能遮字」的限制因此不存在。
- **只在高光處用材質。**header、面板、edition 標題、主要 CTA 與進度條有光澤；重複的比賽／譜面／選手卡片只有 1px 邊框與圓角，表格與規則頁維持平面白面、tabular-nums 與單一表頭底色。沒有任何 `backdrop-filter`，也不依賴模糊。
- **幾何。**面板 20px、控制項 999px 膠囊且至少 44px；短碼 `.map-slot-badge` 為 52px（手機 44px）藍色圓形，較長的 archive／imported slot 標籤會長成膠囊並換行，不會被固定寬度裁切；長標籤的 `.badge` 亦保持膠囊。textarea 使用 20px 圓角以免長文難以閱讀。
- **配色。**文字與次要文字用深墨藍／深海藍；連結、選取與焦點為藍 `#106284`（暗版 `#90deff`）。主要 CTA 是粉紅光澤膠囊配 `#4a0d28` 深色字；選取中的 tab 是藍色光澤晶片配 `#04334d` 深色字。進度條使用薄荷綠 `#2f7d22`（暗版 `#a7e86a`），只作進度呈現，不覆蓋 success／warning／danger 或 NM／HD／HR／DT／FM 語意。
- **對比。**正常文字與輔助文字 ≥4.5:1；控制邊界、焦點與進度填色 ≥3:1。已量測 background、surface、raised、tint 與 selected 狀態，而非只量主色按鈕；藍色選取晶片與粉紅 CTA 都以深色字維持對比。
- **狀態與降級。**selected 為藍色實心晶片加粗體，hover 只換底色，pressed 改用內陰影，disabled 為虛線邊框加既有透明度，focus 為 3px 實線、4px offset。`forced-colors` 隱藏天空並把表面、卡片、按鈕與輸入框退回 Canvas／CanvasText，移除陰影與漸層，focus 改用 Highlight；`prefers-reduced-motion` 關閉過場。
- **導覽與動作層級。**全域 `.main-nav` 的選取項是 44px 高、左右 18.4px（手機與 1101–1360px 為 16px）留白的水平膠囊；透明邊框常駐，避免選取時尺寸跳動。為容納英文與登入後的帳號按鈕，951–1100px 提前使用手機選單（`menu-toggle` 與全寬下拉），1101–1360px 只收窄 header 間距並把膠囊留白維持在 16px 下限，1361px 以上才回到 18.4px，因此不靠壓縮文字或讓元件互相覆蓋。粉紅光澤保留給實際操作按鈕，`.secondary` 維持中性；表格排序表頭、`.map-open-button`、`.statistics-player` 等文字觸發器則改為透明背景、無邊框，仍有 44px 點擊區，選取狀態以粗體、藍色與底線表示，按下時不會閃回粉色 CTA。footer 改為全寬透明帶，左右內距對齊 1240px 內容，消除兩側露出頁面背景的色塊。`select` 以單一自繪 12×8 chevron 靠右內側 1rem、右側保留 2.75rem 內距，不疊加原生箭頭；`forced-colors` 回退原生控制項。
- **字體。**沿用既有系統 sans 與 `--font-sans`，不新增字型檔、不連 Google Fonts。來源 Varela Round 的授權與中文字形覆蓋未經核實，因此不以它承擔正式介面；圓潤感改由幾何與光澤表現。中文措辭 `Y2K 水晶风`／`Y2K 水晶風` 仍待主辦方審閱。
- **範圍。**首頁 header 在本主題被選取時跟隨同一組 token；首頁主視覺原圖不重繪。非賽事頁不繼承任何季別預設，授權、發佈、歷史資料與 OAuth／deep-link 行為未改變。
