# S6 — Orbital Pulse / 星環脈衝

2026-10-28，依 [#346](https://github.com/OCLR-dev/OCLR-website/issues/346) 與主辦方「以最新 theme 為範本，先預覽」製作候選。應用基準為 main `0c93609b3a7f267dce3dd4545384b4d4f0ff8d91`，包含最新 S7 精修 #413。此輪只交付預覽，尚未註冊 `orbital-pulse`、修改任何預設或加入正式選單。

## 方向與畫面

依主辦方對原圖的更正，以紅藍雙主色呈現音樂節奏：紅色用於選取／強調，藍色用於主要操作、數字與資料。冷白與深靛藍工作面承接兩色，標題右側是高低起伏的水平音樂頻譜柱，由左紅、經紫色平滑過渡至右藍，完整 S6 原圖仍是主視覺。前版星盤／指針解讀已撤換。

沿用最新 S7 的 MainSheet 結構、內容寬度判斷、完整原圖／五列統計對齊、文字篩選、44px 控制項與工作側欄；改用 6px 控制／8px 面板圓角。沒有新增產品文案或假介面，預覽的主頁、賽程、圖池與 Admin 都來自目前的 React 元件。

- [可切換圖庫](../s6.html)：四個頁面 × 桌面／手機 × 明暗 × 候選／原有風格。
- [桌面 Dark](desktop-dark.webp)／[Light](desktop-light.webp) · [手機 Dark](mobile-dark.webp)／[Light](mobile-light.webp)。
- [賽程](schedule-desktop-dark.webp) · [圖池](mappools-desktop-dark.webp) · [Admin](admin-desktop-dark.webp)。
- [937px 標題](heading-937-dark.png)／[390px 標題](heading-390-dark.png)，原生 2×。
- 音訊分析版頻譜局部：[Dark](spectrum-audio-dark.png)／[Light](spectrum-audio-light.png)。

## 候選語意 tokens

完整值見 [s6.css](../s6.css)。紅藍品牌色與成功、警告、錯誤各自使用獨立 tokens，狀態文字與圖示沿用現有元件。

| Token                   | Light     | Dark      |
| ----------------------- | --------- | --------- |
| `--site-background`     | `#F4F6FC` | `#0C1428` |
| `--site-surface`        | `#FFFFFF` | `#14213B` |
| `--site-raised`         | `#E9EEF9` | `#1D2E4B` |
| `--site-foreground`     | `#152746` | `#F1F5FF` |
| `--site-muted`          | `#596B88` | `#B8C4DE` |
| `--site-accent`         | `#B4324C` | `#FF8D9A` |
| `--site-accent-strong`  | `#96263D` | `#FFB5BE` |
| `--site-primary`        | `#2455D6` | `#648CFF` |
| `--site-on-primary`     | `#FFFFFF` | `#09162F` |
| `--site-border`         | `#CCD6E8` | `#344462` |
| `--site-control-border` | `#7183A4` | `#8193B3` |
| `--site-focus`          | `#2455D6` | `#92B0FF` |
| `--site-success`        | `#17634C` | `#8DE0C4` |
| `--site-warning`        | `#835600` | `#F2CD84` |
| `--site-danger`         | `#B12B1C` | `#FFB5A4` |

標題在實際內容寬度達 720px 時保留右側水平音樂頻譜空間；窄欄收起裝飾。保留輕量標題入場、導覽顏色過渡與實體控制按壓回饋，尊重 reduced motion；沒有旋轉、閃爍或掃光。Forced colours 移除裝飾與背景漸層，使用系統 Highlight 標示目前頁。

## 素材與資料來源

- [原圖](../../../../public/archive/s6/key-visual.jpg)：原有 1920×1080 JPEG，完整呈現，不裁切、重繪、調色或改字；原圖歷史英文保留原樣。
- [music-spectrum.svg](music-spectrum.svg)：32 根分段柱的高度來自音樂片段的實際頻域分析，取消手工安排的四組尖峰及峰值帽。保留左紅→右藍漸變與克制的微光；作為靜態頻譜快照，不取代原主視覺。
- 音樂樣本為 MDN 官方範例的 [Outfoxing the Fox](https://github.com/mdn/webaudio-examples/blob/main/audio-basics/outfoxing.mp3)，作者 Kevin MacLeod，署名依 [MDN 範例原始碼](https://github.com/mdn/webaudio-examples/blob/main/audio-basics/index.html)。僅供頻譜造型分析，不是 S6 賽事音樂；音檔只下載至暫存目錄，不加入 repository 或產品。
- [spectrum-data.json](spectrum-data.json) 記錄來源 URL／SHA-256、取樣時間、頻段邊界、能量與亮格數。使用瀏覽器原生 Web Audio `AnalyserNode`，FFT 8192；取約12.8–13.2秒五個快照，40Hz–16kHz分成32個對數頻段，先加總各頻段FFT bin功率，再對五幀平均。以固定−80至−20dB範圍映射至0–24格，各柱均使用同一刻度，沒有逐柱手工調高或製造規律尖峰。分析方法參考 [MDN Web Audio 頻譜指南](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API)。
- 資料使用已提交的 `s6-confirmed-archive.json` 與 `s6-configured-rules.json`，沿用既有 S6 presentation fixture 的純函式，於隔離 test DB 重現 [2026-10-25 主辦方確認的 33 場紀錄](../../../s6-archive.md)。沒有讀取 production 或執行真實審批；合成 fixture 的來源標記明確註明 Synthetic UI。
- 主頁保留 12 隊、85 位選手／教練、33 場已記錄結果、5 個圖池、71 張譜面與四章規則。未補造缺失對局、日期、名次或隊伍。Admin 只使用隔離 DB 的 `Synthetic UI Preview` 合成帳號；session 僅留在程序記憶體。

## 預覽方法與邊界

目前未修改 `src`、`messages`、`public`、外觀白名單、migration 或正式路由。以目前應用的原有外觀作基準，在本機瀏覽器加入 `data-s6-preview` 與候選 CSS 後直接截圖；這是候選 CSS 預覽，尚非正式 S6 SSR 外觀。CSS 中的 SVG 由工具內嵌為本地 data URI。

圖庫只切換保存的圖片，不連接 API、DB，不儲存 cookie 或 localStorage。擷取程序封鎖外部流量及非 GET／HEAD 請求；各次樣式前後核對 body 文字與元素數目相同。

## 重現

Node.js 24、npm 與既有 lockfile。僅限新建、明確含 `test` 名稱的隔離 PostgreSQL；`prepare.ts` 是可丟棄測試 fixture，不能當應用 seed 或對 demo／production 執行。

```sh
export TEST_DATABASE_URL=postgresql://emik@127.0.0.1:55426/oclr_s6_theme_preview_test
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s6/prepare.ts
npm run build
DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 APP_URL=http://127.0.0.1:3196 npm start -- --hostname 127.0.0.1 --port 3196
```

在另一個 terminal，使用同一 `TEST_DATABASE_URL`：

```sh
node --import tsx docs/design/season-themes/s6/capture.mjs
```

若要重建頻譜，先將上述 MDN 範例音檔另存至本機暫存目錄，再執行：

```sh
node docs/design/season-themes/s6/analyse-spectrum.mjs /private/tmp/oclr-s6-spectrum-source.mp3
```

工具先核對音檔 SHA-256，再輸出頻段數據及 SVG；使用 OfflineAudioContext，不播放聲音，也不在預覽時載入音檔。

`S6_UI_BASELINE` 指定應用基準 SHA，`S6_PREVIEW_ORIGIN` 可指定另一 loopback 專用預覽。工具會先核對 `src`／`messages`／`public` 與基準相同。圖庫可直接開啟 `s6.html`，不依賴上述服務。

## 本輪驗證

- 沿用前輪 Node.js 24.22.1 `npm ci` 與已通過 production build／TypeScript 的同一應用基準。本輪只修改候選 CSS、SVG 與圖庫文件，沒有重建未更動的應用；候選樣式由實際瀏覽器解析並重新驗證。
- [verification.json](verification.json)：四路由 × 320／390／768／1440px × 明暗，共 32 組／32 次 Axe AA，零違規、無水平溢出或 pageerror。
- 保留 DOM／文字、完整原圖、五列統計與四章規則；手機賽事選單開關／Escape 焦點及 Admin 鍵盤焦點通過。
- 4 組 forced colours 通過；937px／390px 的明暗標題局部未遮住文字。
- 圖庫 32 種切換組合全部正確載入，320／390／768／1440px × 明暗共 8 次 Axe AA 零違規；無溢出、pageerror，鍵盤焦點通過。見 [gallery-verification.json](gallery-verification.json)。
- 工具語法／ESLint、格式、文件連結與 `git diff --check` 通過。原圖與基準提交的 SHA-256 相同，候選 CSS hash 與最終擷取報告一致。
- 本輪屬設計預覽，未執行完整單元／整合、全站 E2E、三語／Safari 矩陣或正式 S6 SSR 偏好測試。基準 main 的 [CI](https://github.com/OCLR-dev/OCLR-website/actions/runs/40657007517) 成功，與本輪預覽證據分開記錄。

設計方法沿用專案指定 [Refactoring UI](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 與前端設計指引。等待主辦方預覽回饋；正式名稱／三語文案審閱、外觀註冊與完整整合驗證留待正式接入。
