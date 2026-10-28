# S6 — Orbital Pulse / 星環脈衝

2026-10-28，依 [#346](https://github.com/OCLR-dev/OCLR-website/issues/346) 與主辦方最新「開發完整的 s6 theme 並 PR」要求正式接入。從 `6321f201c2ec2d3675837a34a3c72e1dfa128fd1` 的 MainSheet 延伸已迭代預覽，註冊 `orbital-pulse`，等待 PR 審閱；尚未合併或部署，也不自動更改任何預設。

## 方向與畫面

依主辦方對原圖的更正，以紅藍雙主色呈現音樂節奏：紅色用於選取／強調，藍色用於主要操作、數字與資料。冷白與深靛藍工作面承接兩色，標題右側是高低起伏的水平音樂頻譜柱，由左紅、經紫色平滑過渡至右藍，完整 S6 原圖仍是主視覺。前版星盤／指針解讀已撤換。

沿用最新 S7 的 MainSheet 結構、內容寬度判斷、完整原圖／五列統計對齊、文字篩選、44px 控制項與工作側欄；改用 6px 控制／8px 面板圓角。新增產品文案僅為三語外觀名稱，預覽的主頁、賽程、圖池與 Admin 都來自目前的 React 元件。

- [可切換圖庫](../s6.html)：四個頁面 × 桌面／手機 × 明暗 × S6／原有風格。
- [桌面 Dark](desktop-dark.webp)／[Light](desktop-light.webp) · [手機 Dark](mobile-dark.webp)／[Light](mobile-light.webp)。
- [賽程](schedule-desktop-dark.webp) · [圖池](mappools-desktop-dark.webp) · [Admin](admin-desktop-dark.webp)。
- [937px 標題](heading-937-dark.png)／[390px 標題](heading-390-dark.png)，原生 2×。
- 音訊分析版頻譜局部：[Dark](spectrum-audio-dark.png)／[Light](spectrum-audio-light.png)。

## 語意 tokens

正式樣式見 [orbital-theme.css](../../../../src/app/orbital-theme.css)；[s6.css](../s6.css) 保留作候選階段歷史參考。紅藍品牌色與成功、警告、錯誤各自使用獨立 tokens，狀態文字與圖示沿用現有元件。

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

## 正式接入與邊界

`orbital-pulse` 加入共用外觀白名單與三語標籤：S6 · Orbital Pulse／S6 · 星环脉冲／S6 · 星環脈衝。沿用外觀選單、SSR cookie、全站及賽事管理設定；優先序仍是訪客選擇 → 當前有權限／已發佈賽事預設 → 全站預設。清除訪客選擇跟隨當前路由，不寫入自動偏好；非賽事頁不繼承上一季，light/dark 獨立，OBS／presenter 不套用。

Migration `0050_orbital_pulse_appearance` 只擴充 site_settings 與 site_setting_events 的外觀約束，不選擇預設、不改歷史。API 契約與 OpenAPI 由現有工具再生成，遠端前端沿用 bundled theme assets。沒有新增音樂播放或音訊下載。

圖庫直接擷取已註冊的實際頁面：先保存 default 對照，再寫入本機測試 context 的 `oclr-appearance=orbital-pulse` 並 reload，核對 SSR 回應，使用建置後的 CSS 與 `/themes/orbital-pulse/music-spectrum.svg`；沒有注入候選 CSS。圖庫本身仍只切換保存的圖片，不連接 API、DB 或儲存偏好。擷取程序封鎖外部流量及非 GET／HEAD 請求，並核對樣式前後內容相同。

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

工具先核對音檔 SHA-256，再輸出頻段數據及 SVG；正式素材為相同 SVG 的完整副本，位於 `public/themes/orbital-pulse/music-spectrum.svg`。使用 OfflineAudioContext，不播放聲音，也不在預覽時載入音檔。

`S6_UI_BASELINE` 指定應用基準 SHA（預設 HEAD，報告記錄解析後的完整 SHA），`S6_PREVIEW_ORIGIN` 可指定另一 loopback 專用預覽。工具會先核對 `src`／`messages`／`public` 與基準相同。圖庫可直接開啟 `s6.html`，不依賴上述服務。

## 本輪驗證

來源實作提交 `66026d17cd6e4cc9f33829e5cc62627bc09954e3`；本節記錄本機結果，CI 與主辦方審閱分開確認。所有資料檢查均限隔離 test DB。

- Node.js 24.22.1，`npm ci`、`npm run check`、`npm run build` 通過。
- `npm test`：175個檔案通過，1424項通過、1項略過。包含 migration0050前後驗證、既有設定與歷史保留，以及各種外觀的共用授權檢查。
- `npm run i18n:extract`、填入新增兩份中文標籤、`npm run test:i18n`（4項）通過；51份延伸契約再生成及`--check`通過，OpenAPI同步。
- `npm audit --omit=dev`：0項漏洞。
- [verification.json](verification.json)：正式 SSR `orbital-pulse`，四路由 × 320／390／768／1440px × 明暗，共32組／32次Axe AA，零違規、無溢出或pageerror。DOM／文字、完整1920×1080原圖、五列統計、四章規則、手機選單／Escape焦點與Admin鍵盤焦點通過；另4組forced colours及937／390px標題不遮字檢查通過。CSS、正式SVG與原圖hash綁定擷取來源。
- [gallery-verification.json](gallery-verification.json)：32種圖片切換及8組尺寸／明暗Axe AA零違規，無溢出或pageerror，鍵盤焦點通過。
- Chrome選定40個桌面／手機案例：涵蓋S6三語、SSR、明暗、完整原圖、長資料、公共／Admin／Captain頁、OBS／presenter隔離、site／tournament設定與S7–S10選單回歸。初次36項通過、4項失敗；補齊導覽載入遮罩等待並將設定audit筆數按註冊外觀計算後，相關12項header及4項設定檢查均取得通過結果，其餘未更動案例沿用本輪結果。後續配色測試等待背景預載入完成，Chrome桌面／手機2項重跑通過。
- `npm run test:e2e:core`：固定核心範圍桌面／手機28項通過。
- Safari／WebKit桌面與手機選定24項：初次23項通過，1項快速跳頁造成背景RSC預載入中斷；保留錯誤斷言、等待讀取完成後，相關桌面／手機2項重跑通過。最終24個選定案例均取得通過結果。
- 遠端前端`frontend.spec.ts`：Chrome桌面／手機2項通過，包含全部註冊外觀及S6頻譜素材GET／HEAD、解碼、SSR偏好、隔離測試授權與撤銷後私人資料清除；前端無本機DB或OAuth配置。
- 修改工具與測試的ESLint／格式、文件連結、`git diff --check`、正式CSS／SVG／原圖hash檢查通過。專用預覽與test PostgreSQL在驗證後停止。

本輪未執行全站完整`full`矩陣；既有日常CI範圍維持不變。未進行真實OAuth、production資料／migration、部署或發佈；issue關閉與正式驗收由主辦方確認。

設計方法沿用專案指定 [Refactoring UI](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 與前端設計指引。名稱與新增三語標籤一併提交主辦方審閱。
