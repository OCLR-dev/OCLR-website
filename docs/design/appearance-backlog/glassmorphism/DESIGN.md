# H — 毛玻璃風 / Glassmorphism

追蹤：[#240](https://github.com/PhoenixEmik/OCLR-website/issues/240) · **P3** · 已註冊為正式 appearance `glassmorphism`，見文末「正式實作」。

## 視覺主張與範圍

讓少量面板在柔和背景上呈現玻璃層次，靠接近不透明的內容底色保障文字對比與操作邊界。

H 的辨識點是局部透光層次，不是把已存在 pastel 加大漸層或把整個管理表格套模糊；模糊不支援時仍須完整可用。

這份文件把附件的視覺語彙整理成可實作規格；本次只交付 docs、CSS 範例與離線 specimen。原檔的適用情境或風險評語是參考資料，並非已驗證的產品結論或額外開發授權。實作時需沿用 OCLR 現有框架、元件與業務規則。

## 原始來源與 CSS 抽取

- 第 2 批：`osu! Cup 風格預覽（第二批）.html`，參考代碼 `H`。
- [原始 HTML 保存副本](../sources/batch-2.html)，SHA-256 `da9be1f7462054c7d415dfd26f282e092aed2ad05c472c36d3ad7c8308f5d511`。保存原始 bytes，不執行或搬入正式應用。
- [source.css](source.css) 僅逐行抽取原 `<style>` 中以 `.H` 起始的所有規則，包含同一行的多個 selector／rule；不改色、不重排、不格式化。
- CSS-block 相對行：73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83。抽取檔 SHA-256：`606630c51e41d51031988e798467b392237cc809241d144e8bc4e9b854f54f22`。
- 原型布局相依：[batch-2-shared.css](../sources/batch-2-shared.css)，包含原 `.mk`／導覽／hero／圖池資料結構與原 mobile media rule。它只用於理解原型，不與正式全域 CSS 合併。
- 原 `.mk .nv/.bd/.se/.tag/.bar/.bt/.tb/.mp/.st` 都是示意 class。原本 `.bt`／分頁使用 `span`，不能因此視為已可操作的按鈕或可存取分頁。

## 視覺語法

粉／杏／藍背景、細亮邊、半透明 hero、小幅 backdrop blur、乾淨字體與桃紅主互動。

**布局與幾何：**面板 18px、控制項 12px；內容面板層級最多兩層，不疊加多重透明容器或逐列模糊。

**字體：**來源 Inter 500／600，範例沿用 system sans。內文不使用過輕字重；16px／1.65、caption 至少 12px，亮暗均用固定高對比文字。

字級採 12／14／16／20／24／32／40／52px 的有限集合。52px 只用於短品牌字，內容標題 20–32px；內文 16px、行高 1.65，控制項 14px。對齊優先於裝飾，比分／星數使用 tabular-nums 並靠右；保持歷史隊名、身分與譜面 metadata 原文。

間距採 4／8／12／16／24／32／48px。區塊之間比區塊內留白更大；表格不套 hero 材質、不加多層空容器，不因風格而隱藏實際比賽資訊。

## 原始版到 MainSheet 的修正

來源 rgba(.35–.45) 面板依賴背景，不能保證任意主視覺上的對比。範例先給不透明 fallback，再用 .96／.94 的有限透明與 @supports 啟用 blur；reduced-transparency 與 forced-colors 退回實色。

[mainsheet.example.css](mainsheet.example.css) 是**重新整理的候選 CSS**，不是忠實抽取檔，也不是已完成的整站 skin。範圍限定於 `html[data-appearance="glassmorphism"] .themed-site`。候選 key `glassmorphism` 只在離線範例出現，未加入 `src/lib/preferences.ts` 或 schema／DB 白名單。

- 原始色、框線、漸層與裝飾可在 `source.css` 查回；候選版另外定義可讀的 light／dark 語意色。
- 文字與互動在減少裝飾、關閉陰影／模糊／字型後仍須可辨；顏色不能是唯一的狀態提示。
- 英文 display 字型為候選素材，不附帶字型授權證據；本次範例只用本機系統回退，不發出 Google Fonts 請求。
- 決定採用後先做一頁功能導向的灰階布局，再套本款 token 與有限效果；不新增框架、不複製原型資料。

## 明暗語意色候選

| MainSheet token         | Light candidate | Dark candidate |
| ----------------------- | --------------- | -------------- |
| `--site-background`     | `#f8edf3`       | `#211c2b`      |
| `--site-surface`        | `#ffffff`       | `#30293c`      |
| `--site-raised`         | `#f5edf6`       | `#3a3148`      |
| `--site-tint`           | `#f9deee`       | `#503344`      |
| `--site-foreground`     | `#2a2a33`       | `#f9edf9`      |
| `--site-muted`          | `#5f5262`       | `#d6bdd8`      |
| `--site-secondary-text` | `#4e3d51`       | `#e9d4eb`      |
| `--site-accent`         | `#9d285d`       | `#ffb0d6`      |
| `--site-border`         | `#cdb7cb`       | `#715b7b`      |
| `--site-control-border` | `#84667e`       | `#b799c1`      |
| `--site-primary`        | `#be2e6d`       | `#ffb0d6`      |
| `--site-primary-hover`  | `#9d2458`       | `#ffd0e6`      |
| `--site-on-primary`     | `#ffffff`       | `#39192d`      |
| `--site-header`         | `#ffffff`       | `#30293c`      |
| `--site-accent-strong`  | `#9d285d`       | `#ffb0d6`      |
| `--site-focus`          | `#9d285d`       | `#ffb0d6`      |
| `--site-selection`      | `#f9deee`       | `#503344`      |
| `--site-highlight`      | `#9d285d`       | `#ffb0d6`      |
| `--site-connector`      | `#84667e`       | `#b799c1`      |
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
- 可保留一般 hover／pressed 色彩；禁止動畫 blur、透明度呼吸、大面積背景移動或跟隨游標。低效能手機可完全關閉模糊。
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
- forced colors 降級通過。另以 Chrome emulation 實際驗證 reduced transparency，得到實色背景及 backdrop-filter:none。
- [Desktop Light](desktop-light.webp)／[Dark](desktop-dark.webp)；[Mobile Light](mobile-light.webp)／[Dark](mobile-dark.webp)。
- [本款機器可讀報告](verification.json)。這些結果只涵蓋離線 CSS specimen，未驗收正式頁面、三語、DB migration 或部署。

## 正式實作（#240）

正式樣式位於 [src/app/glass-theme.css](../../../../src/app/glass-theme.css)，以 `html[data-appearance="glassmorphism"] .themed-site` 為範圍；OBS／presenter 不受影響。下列為與上方候選 CSS 的差異：

- **分層玻璃。**由後到前：固定的彩色色場（粉、橙、天藍、紫色光暈與數顆漂浮球體）→ 承載整頁內容的一塊毛玻璃板 → 板上較亮的玻璃磚（面板、表格、卡片）→ 實色的選取晶片、輸入框與選單。每層都有上亮下暗的斜面邊框、光澤與多層投影，玻璃板右下方另露出一片較薄的背板，形成立體層次。球體一半露在玻璃板外（清晰），一半在板下（被模糊），呈現玻璃折射感。
- **模糊只用三處。**僅 header、玻璃板與 footer 使用 `backdrop-filter`；玻璃磚、表格與反覆資料列一律不模糊。header 內的選單維持實色，因為巢狀在已模糊 header 內的 backdrop-filter 看不到下方頁面。
- **透明度與對比（與 issue 數值不同，需主辦方確認）。**各層為 50–72% 不透明，而非 issue 建議的 94–96%。取而代之的保證方式：色場完全由本主題控制，故以色場中最飽和的光暈顏色（未模糊、並套用 saturate 加強）作為最差背景計算，所有文字 token ≥4.5:1、控制邊界 ≥3:1，無論是否有模糊皆成立；sticky header 另以純黑與純白內容為最差背景驗算。玻璃層不會疊在賽事主視覺上，主視覺本身維持原圖，只加玻璃邊框。
- **降級。**不支援 `backdrop-filter` 或 `prefers-reduced-transparency: reduce` 時，所有玻璃層回到實色；`forced-colors` 隱藏色場與球體並移除模糊與陰影。
- **配色。**文字為墨藍 `#1b1830`，連結、選取與焦點為靛藍 `#3a2fa6`；主要按鈕沿用來源桃紅 `#ff4f9a`，配深色文字 `#2a1020` 與內側光澤。暗版為深色煙燻玻璃與較暗的球體。與 cute-pastel（粉底、圓體字）及 Frutiger Aero（水藍光澤、無模糊）區隔。
- **狀態不依賴透明或陰影。**selected／pressed 為白色實心晶片、靛藍邊框與粗體；hover 只改底色；disabled 為虛線邊框加既有透明度；focus 為 3px 實線、4px offset。
- **字體。**沿用系統 sans，標題 600、內文行高 1.65；無遠端字體請求。
