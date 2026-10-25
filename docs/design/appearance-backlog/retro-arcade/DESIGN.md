# D — 街機復古風 / Retro Arcade

追蹤：[#236](https://github.com/PhoenixEmik/OCLR-website/issues/236) · **P3** · 已註冊為正式 appearance `retro-arcade`，見文末「正式實作」。

## 視覺主張與範圍

以像素感標題、霓虹分段與小面積硬陰影表現街機節奏，長文字與成績表採清楚的現代字體。

與 A 的斜切轉播風不同，D 用方角、硬陰影與像素節奏；掃描線不是背景必需條件，關閉仍能辨認此風格。

這份文件把附件的視覺語彙整理成可實作規格；本次只交付 docs、CSS 範例與離線 specimen。原檔的適用情境或風險評語是參考資料，並非已驗證的產品結論或額外開發授權。實作時需沿用 OCLR 現有框架、元件與業務規則。

## 原始來源與 CSS 抽取

- 第 1 批：`osu! Cup 風格預覽.html`，參考代碼 `D`。
- [原始 HTML 保存副本](../sources/batch-1.html)，SHA-256 `9da880c4342b88b0a374543dfdc79f016a3feb5a811d5a8543354f5a6b06f56c`。保存原始 bytes，不執行或搬入正式應用。
- [source.css](source.css) 僅逐行抽取原 `<style>` 中以 `.D` 起始的所有規則，包含同一行的多個 selector／rule；不改色、不重排、不格式化。
- CSS-block 相對行：61, 62, 63, 64, 65, 66, 67, 68, 69。抽取檔 SHA-256：`9a39e41201735f82c804be2314f451927b525845dd1081346fad2f6c44362e8a`。
- 原型布局相依：[batch-1-shared.css](../sources/batch-1-shared.css)，包含原 `.mk`／導覽／hero／圖池資料結構與原 mobile media rule。它只用於理解原型，不與正式全域 CSS 合併。
- 原 `.mk .nv/.bd/.se/.tag/.bar/.bt/.tb/.mp/.st` 都是示意 class。原本 `.bt`／分頁使用 `span`，不能因此視為已可操作的按鈕或可存取分頁。

## 視覺語法

黑底、黃／青／洋紅、方角、4px 邊框與硬偏移陰影；低對比掃描線只在裝飾區出現。

**布局與幾何：**面板與控制項 0px 方角；主互動區 2px 實線與有限 4px 硬陰影，密集資料列不逐列描粗框。

**字體：**來源 Press Start 2P 不支援中文，且 10px 全站內文太小。範例採系統 monospace 展示標題節奏，正式像素字型須驗證授權並本地化打包；不可影響內文、中文與譜面名稱。

字級採 12／14／16／20／24／32／40／52px 的有限集合。52px 只用於短品牌字，內容標題 20–32px；內文 16px、行高 1.65，控制項 14px。對齊優先於裝飾，比分／星數使用 tabular-nums 並靠右；保持歷史隊名、身分與譜面 metadata 原文。

間距採 4／8／12／16／24／32／48px。區塊之間比區塊內留白更大；表格不套 hero 材質、不加多層空容器，不因風格而隱藏實際比賽資訊。

## 原始版到 MainSheet 的修正

來源全畫面掃描線、10px 內文、多色同時搶焦與 4px 框疊加。正式接入需降低裝飾覆蓋面積、補亮色版，區分互動主色與警告／錯誤語意。

[mainsheet.example.css](mainsheet.example.css) 是**重新整理的候選 CSS**，不是忠實抽取檔，也不是已完成的整站 skin。範圍限定於 `html[data-appearance="retro-arcade"] .themed-site`。候選 key `retro-arcade` 只在離線範例出現，未加入 `src/lib/preferences.ts` 或 schema／DB 白名單。

- 原始色、框線、漸層與裝飾可在 `source.css` 查回；候選版另外定義可讀的 light／dark 語意色。
- 文字與互動在減少裝飾、關閉陰影／模糊／字型後仍須可辨；顏色不能是唯一的狀態提示。
- 英文 display 字型為候選素材，不附帶字型授權證據；本次範例只用本機系統回退，不發出 Google Fonts 請求。
- 決定採用後先做一頁功能導向的灰階布局，再套本款 token 與有限效果；不新增框架、不複製原型資料。

## 明暗語意色候選

| MainSheet token         | Light candidate | Dark candidate |
| ----------------------- | --------------- | -------------- |
| `--site-background`     | `#f7f6ee`       | `#09090b`      |
| `--site-surface`        | `#ffffff`       | `#15151b`      |
| `--site-raised`         | `#eeede3`       | `#23232e`      |
| `--site-tint`           | `#fff4b8`       | `#37321a`      |
| `--site-foreground`     | `#20202b`       | `#faf6e6`      |
| `--site-muted`          | `#61606b`       | `#c0bdc9`      |
| `--site-secondary-text` | `#444451`       | `#e0dce8`      |
| `--site-accent`         | `#8b2364`       | `#ffe600`      |
| `--site-border`         | `#cfcec3`       | `#50505e`      |
| `--site-control-border` | `#74737e`       | `#9292a6`      |
| `--site-primary`        | `#e6cc00`       | `#ffe600`      |
| `--site-primary-hover`  | `#f0d92a`       | `#fff04d`      |
| `--site-on-primary`     | `#171717`       | `#111111`      |
| `--site-header`         | `#ffffff`       | `#15151b`      |
| `--site-accent-strong`  | `#8b2364`       | `#ffe600`      |
| `--site-focus`          | `#8b2364`       | `#ffe600`      |
| `--site-selection`      | `#fff4b8`       | `#37321a`      |
| `--site-highlight`      | `#8b2364`       | `#ffe600`      |
| `--site-connector`      | `#74737e`       | `#9292a6`      |
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
- 硬陰影可在按下時縮短，保持 120ms 內；禁止 CRT 閃爍、游標閃爍、閃光或持續掃描動畫。
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

## 正式實作（#236）

正式樣式位於 [src/app/arcade-theme.css](../../../../src/app/arcade-theme.css)，以 `html[data-appearance="retro-arcade"] .themed-site` 為範圍；OBS／presenter 不受影響。下列為與上方候選 CSS 的差異：

- **明暗都是深色機台。**暗版為黑色（`#050508`）；亮版依貢獻者審閱改為略亮一階的深靛色（`#15122b`），而非候選的米白紙色，讓「黑底街機」在兩種模式下都成立。header 在兩種模式皆為黑色跑馬燈並帶 4px 黃線。此處與 issue「補亮色版」的字面要求不同，需主辦方確認。
- **黃／青／洋紅三色固定分工，修正多色搶焦。**黃色：主要動作底色與跑馬燈線；青色：目前選取游標塊、連結、鍵盤焦點、主視覺 4px 外框與霓虹分段線；洋紅：只作裝飾（硬陰影、小標籤），不表示任何狀態。success／warning／danger 另用綠、橙、紅，與互動主色明確區分。所有文字 ≥4.5:1，控制邊框與焦點 ≥3:1。
- **方角、4px 框與硬陰影，但不疊框。**全站 0px 方角（含頭像、指示點）。主要按鈕 2px 邊框 + 4px 洋紅硬陰影，按下時陷入陰影；主視覺橫幅 4px 青框 + 洋紅硬陰影；彈出選單與對話框 2px 邊框 + 硬陰影。面板與卡片 2px 邊，表格與密集資料列只保留細線。
- **霓虹分段。**區塊標題底線、規則章節分隔、圖池發佈標題、首頁「過往賽事」與 footer 上緣改為 4px 青色分段線；進度條同樣為分段能量條。
- **像素字（含中文）。**頁面 h1 與區塊 h2：拉丁字元用 [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P)（SIL OFL 1.1，保留字型名稱，原檔不修改打包），中文用 [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font) 12px（SIL OFL 1.1，無保留字型名稱，原檔不修改打包，含 Ark Pixel、Cubic 11、Galmuri 授權）。其餘所有文字（導覽、按鈕、標籤、內文、表格、表單欄位與譜面／隊伍／新聞標題）皆使用 Fusion Pixel：小字落在原生 12px，內文 16px，標題 48／36／24px。每頁只載入該語系的一個 Fusion 檔（約 0.7 MB），無遠端字體請求。全站像素字為貢獻者審閱時的要求，與 issue「不可影響內文、中文與譜面名稱可讀性」的原始限制不同，需主辦方確認。
- **掃描線只在裝飾區。**只在空狀態與 footer 帶以靜態低對比掃描線出現；關閉後仍可辨識本風格。無閃爍、游標閃爍或循環動畫；`prefers-reduced-motion` 取消按壓位移與過渡，`forced-colors` 移除陰影、分段線與掃描線並改用系統邊線。
- **首頁 header。**選用本外觀時，首頁 header 同樣為黑色跑馬燈；其他外觀仍保留 S11 首頁配色。
