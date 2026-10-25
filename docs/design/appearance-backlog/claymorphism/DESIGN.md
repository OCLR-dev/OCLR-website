# E — 黏土風 / Claymorphism

追蹤：[#237](https://github.com/PhoenixEmik/OCLR-website/issues/237) · **P3** · 已註冊為正式 appearance `claymorphism`，見文末「正式實作」。

## 視覺主張與範圍

讓少量主要控制與 hero 像柔軟黏土般凸起，靠清楚框線與文字維持觸感之外的可操作性。

與已實作 C cute-pastel 的差別是 E 的凸起／凹陷材質，不只是更大圓角或重新調粉色。正式選單不能把兩者合併成同一偏好。

這份文件把附件的視覺語彙整理成可實作規格；本次只交付 docs、CSS 範例與離線 specimen。原檔的適用情境或風險評語是參考資料，並非已驗證的產品結論或額外開發授權。實作時需沿用 OCLR 現有框架、元件與業務規則。

## 原始來源與 CSS 抽取

- 第 2 批：`osu! Cup 風格預覽（第二批）.html`，參考代碼 `E`。
- [原始 HTML 保存副本](../sources/batch-2.html)，SHA-256 `da9be1f7462054c7d415dfd26f282e092aed2ad05c472c36d3ad7c8308f5d511`。保存原始 bytes，不執行或搬入正式應用。
- [source.css](source.css) 僅逐行抽取原 `<style>` 中以 `.E` 起始的所有規則，包含同一行的多個 selector／rule；不改色、不重排、不格式化。
- CSS-block 相對行：28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40。抽取檔 SHA-256：`31f7d1083f1dbebe392b555bfe4614acc1b6d578ada27fbebf2f0d701f15f73e`。
- 原型布局相依：[batch-2-shared.css](../sources/batch-2-shared.css)，包含原 `.mk`／導覽／hero／圖池資料結構與原 mobile media rule。它只用於理解原型，不與正式全域 CSS 合併。
- 原 `.mk .nv/.bd/.se/.tag/.bar/.bt/.tb/.mp/.st` 都是示意 class。原本 `.bt`／分頁使用 `span`，不能因此視為已可操作的按鈕或可存取分頁。

## 視覺語法

粉色底、大圓角、內外雙向陰影、凹槽進度、凸起 CTA 與小面積薄荷選取背景。

**布局與幾何：**面板 24px、控制項 18px；只對 hero／主要按鈕施加材質陰影，表格與反覆資料列保持平面。

**字體：**來源 Fredoka 為圓潤英文標題；範例使用現有系統 sans，候選可評估既有 Quicksand 的可讀性，避免為相似氣質再載入一套字體。

字級採 12／14／16／20／24／32／40／52px 的有限集合。52px 只用於短品牌字，內容標題 20–32px；內文 16px、行高 1.65，控制項 14px。對齊優先於裝飾，比分／星數使用 tabular-nums 並靠右；保持歷史隊名、身分與譜面 metadata 原文。

間距採 4／8／12／16／24／32／48px。區塊之間比區塊內留白更大；表格不套 hero 材質、不加多層空容器，不因風格而隱藏實際比賽資訊。

## 原始版到 MainSheet 的修正

來源用白色高光與低對比粉紅陰影表達邊界，暗版不能直接把陰影顏色反相。控制邊框、focus ring、disabled 與 pressed 需可在移除陰影後分辨。

[mainsheet.example.css](mainsheet.example.css) 是**重新整理的候選 CSS**，不是忠實抽取檔，也不是已完成的整站 skin。範圍限定於 `html[data-appearance="claymorphism"] .themed-site`。候選 key `claymorphism` 只在離線範例出現，未加入 `src/lib/preferences.ts` 或 schema／DB 白名單。

- 原始色、框線、漸層與裝飾可在 `source.css` 查回；候選版另外定義可讀的 light／dark 語意色。
- 文字與互動在減少裝飾、關閉陰影／模糊／字型後仍須可辨；顏色不能是唯一的狀態提示。
- 英文 display 字型為候選素材，不附帶字型授權證據；本次範例只用本機系統回退，不發出 Google Fonts 請求。
- 決定採用後先做一頁功能導向的灰階布局，再套本款 token 與有限效果；不新增框架、不複製原型資料。

## 明暗語意色候選

| MainSheet token         | Light candidate | Dark candidate |
| ----------------------- | --------------- | -------------- |
| `--site-background`     | `#fff3f7`       | `#261b25`      |
| `--site-surface`        | `#fff8fb`       | `#382530`      |
| `--site-raised`         | `#ffeaf2`       | `#442e3c`      |
| `--site-tint`           | `#fbd9e7`       | `#553348`      |
| `--site-foreground`     | `#5a3345`       | `#fff0f7`      |
| `--site-muted`          | `#80566a`       | `#d5b1c5`      |
| `--site-secondary-text` | `#704052`       | `#ecd0df`      |
| `--site-accent`         | `#9c2a5d`       | `#ffbad7`      |
| `--site-border`         | `#e8c4d5`       | `#674457`      |
| `--site-control-border` | `#967080`       | `#b4819b`      |
| `--site-primary`        | `#ffb4cf`       | `#ffb4cf`      |
| `--site-primary-hover`  | `#ffa0c3`       | `#ffc9df`      |
| `--site-on-primary`     | `#4a1f33`       | `#4a1f33`      |
| `--site-header`         | `#fff8fb`       | `#382530`      |
| `--site-accent-strong`  | `#9c2a5d`       | `#ffbad7`      |
| `--site-focus`          | `#9c2a5d`       | `#ffbad7`      |
| `--site-selection`      | `#fbd9e7`       | `#553348`      |
| `--site-highlight`      | `#9c2a5d`       | `#ffbad7`      |
| `--site-connector`      | `#967080`       | `#b4819b`      |
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
- 主要按鈕按下時收斂陰影，120–180ms；不讓元件彈跳、漂浮或跟隨游標。reduced motion 保留即時狀態變化。
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

## 正式實作（#237）

正式樣式位於 [src/app/clay-theme.css](../../../../src/app/clay-theme.css)，以 `html[data-appearance="claymorphism"] .themed-site` 為範圍；OBS／presenter 不受影響。下列為與上方候選 CSS 的差異：

- **配色改為暖黏土色。**候選色（`#fff3f7`／`#9c2a5d`）與 cute-pastel（`#fff4f8`／`#b02a5f`）幾乎相同，正式版改用偏杏桃的暖粉底 `#f8ebe4`、陶土玫瑰強調色 `#a33a3f` 與珊瑚色主要按鈕 `#f2a493`，保留小面積薄荷選取。暗版為「燒製黏土」：深可可色表面，深度來自更深的落影與微弱邊緣高光，不反相粉色陰影。
- **材質分三層。**凸起：hero／資訊橫幅、真實按鈕、header 目前分頁與彈出選單。凹陷：輸入框、進度條、賽事導覽與篩選軌道、階段滾輪目前列。平面：表格、譜面卡、比賽卡與反覆資料列。
- **按鈕材質經由 `--site-button-shadow`。**MainSheet 共用按鈕規則改讀此可選 token（未設定時為 `none`），自訂陰影的元件維持原樣；其他 appearance 不受影響。
- **狀態不依賴陰影。**disabled 為虛線邊框加既有透明度；selected／pressed 為薄荷底、薄荷邊框與粗體；focus 為 3px 實線、4px offset。`forced-colors` 移除所有陰影。
- **字體。**標題沿用已打包的 Quicksand，內文維持系統字體以保持中文可讀性；無遠端字體請求。
