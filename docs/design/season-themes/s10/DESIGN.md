# S10 — Skyline Pop / 晴空未來城

追蹤：[#195](https://github.com/OCLR-dev/OCLR-website/issues/195)。

2026-10-26 主辦方重開 #195，要求更精緻的 city pop、更加鮮豔、明確插畫風格，且色彩貼近原 S10 主視覺。本版沿用最新實際 UI 產圖流程；正式接入仍待指定，S9 設計維持其原有分支版本。

## UI 基準與設計方式

本版基準為 canonical main **`0d3e203d22c33fb61e988f80f2a7ab561c1a8563`**。直接建置該版本的應用，開啟實際路由，向瀏覽器加入 [S10 候選 CSS](../s10.css)；不重畫 HTML、不複製元件、不改頁面內容。

| 實際路由                    | 保留的現有 UI                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/tournaments/s10`          | `Header`、`TournamentShell`、`HistoricalArchiveView` 的頁面標題、完整主視覺、五列統計、`RulesSection`／`RulesHandbook` |
| `/tournaments/s10/mappools` | 真正的五階段、搜尋／排序／模組篩選、卡片／緊湊表格切換、譜面抽屜入口                                                   |
| `/admin/settings`           | 真正的 `StaffNavigation` 側欄／手機管理選單、`SiteAppearanceForm`、獨立偏好控制與原有儲存狀態                          |

頁首 Logo、主導覽、外觀／明暗／語言控制、登入入口與賽季導覽皆來自最新應用；不是前版四個示範 tabs。手機保留現有選單，sticky bar 和規則錨點沿用元件的實際量測。主頁不加入新的行銷 hero、比賽摘錄、假按鈕或額外統計區塊。

[產圖工具](capture.mjs) 會檢查 `src`、`messages`、`public/branding` 與 UI 基準一致；每頁在同一個 DOM 上拍攝「目前原有風格」及「S10 city pop 候選」，並確認套色前後的元素數量和顯示文字一致。前版獨立樣本的 16 次 Axe／74 組色彩結果不當作本版證據。

## 視覺主張與參考

**以原 S10 主視覺的晴空藍、亮青、桃粉與奶油白，形成鮮明的 city pop 插畫主題。** 角色原圖保持完整，另繪海岸城市、夕陽、棕櫚與海浪的場景作為標題插畫。清楚的藍／桃粉輪廓、平塗色塊、粉色雲層與海面高光延續原圖的插畫語彙，暖色只在夕陽與雲邊點綴。

- **場景插畫**：[city-pop-coast.webp](city-pop-coast.webp) 為本輪內建 image_gen 生成，第二步直接以原 S10 圖作配色／筆觸參考；沒有角色、文字、Logo 或虛構賽事資料。[素材來源、尺寸與完整 prompt set](ARTWORK.md)。
- **響應式標題**：桌面標題右側呈現寬景插畫，左側保持文字閱讀區；手機把插畫置於標題文字下方的 96px 區域。沒有插入新的 hero、DOM、假 tabs 或操作控制。
- **完整原圖**：1024×1024 的透明 1:1 S10 主視覺，保留所有構圖、字樣與色彩，維持 contain；不加外框、斜帶或覆蓋插畫。新增場景只用於頁面標題。
- **鮮明導視**：晴空藍控制項、深藍連結／焦點、桃粉數字與彩色短分隔線延續原圖配色。成功／警告／錯誤和 mod 仍保有原有語意。
- **平整閱讀面**：奶油背景與白色資料面，暗版為夜藍與亮青／桃粉；規則、圖池與 Admin 表單不鋪場景插畫。面板 10px、控制項 4px，主操作只有短陰影和清楚邊界。
- **動態與輔助模式**：沿用原有 hover／press、鍵盤焦點、選取底線和 reduced motion；沒有新增持續動畫或模糊。forced colours 移除標題插畫與裝飾分隔線，保留系統色選取與選單。

| 用途 | Light | Dark |
| --- | --- | --- |
| 背景／資料面 | `#fffaf0`／`#ffffff` | `#111d38`／`#1b2e50` |
| 文字／次要文字 | `#173759`／`#4c6280` | `#f0f6ff`／`#b5cae5` |
| 主要操作／文字 | `#36c5ef`／`#123657` | `#83e7ff`／`#123657` |
| 連結與焦點 | `#006395` | `#83e7ff` |
| 數字強調 | `#ae3566` | `#ffb3d9` |
| 裝飾藍／桃粉 | `#55d1ed`／`#ff91bd` | `#3296c4`／`#ff9dcd` |

### 與既有九款 theme 的關係

- `default`：保留 MainSheet、系統字體、目前元件與工作內容。
- `swiss-minimal`：對齊、細分隔線、數字閱讀；S10 加入原圖色系的插畫與彩色短線。
- `cute-pastel`：柔和底面與完整原圖；S10 的藍／桃粉更鮮明，控制項維持 4px 幾何。
- `claymorphism`／`glassmorphism`：保留實色閱讀層級，不加入浮雕或背景模糊。
- `manga-halftone`：插畫與內容分層；本版不把印刷紋理或插畫鋪到資料文字背後。
- `esports-broadcast`／`retro-arcade`：保留操作、選取與狀態分工及非純色提示，不新增 live 標記或像素字。
- `frutiger-aero`：呼應原圖晴空色；以場景插畫表現城市氣氛，不把控制項改成大膠囊。

候選完整 token 定義見 [s10.css](../s10.css)，沿用 `--site-*`，另以 `--pop-*` 定義插畫、數字與分隔線。樣式限定於 `html[data-s10-preview] .themed-site`；沒有新字體／套件、正式 appearance 註冊、cookie 或實際網站設定變更，OBS／presenter 保持隔離。

## 最新 UI 的範例圖

[離線對照圖庫](../s10.html) 可切換頁面、桌面／手機、明暗與套色前後。圖庫只顯示實際應用截圖，不是第二套應用 UI。

| 實際頁面       | 桌面 Light                           | 桌面 Dark                          | 手機 Light                          | 手機 Dark                         |
| -------------- | ------------------------------------ | ---------------------------------- | ----------------------------------- | --------------------------------- |
| S10 主頁       | [Light](desktop-light.webp)          | [Dark](desktop-dark.webp)          | [Light](mobile-light.webp)          | [Dark](mobile-dark.webp)          |
| S10 圖池       | [Light](mappools-desktop-light.webp) | [Dark](mappools-desktop-dark.webp) | [Light](mappools-mobile-light.webp) | [Dark](mappools-mobile-dark.webp) |
| Admin 網站設定 | [Light](admin-desktop-light.webp)    | [Dark](admin-desktop-dark.webp)    | [Light](admin-mobile-light.webp)    | [Dark](admin-mobile-dark.webp)    |
| S10 規則手冊   | [Light](rules-desktop-light.webp)    | [Dark](rules-desktop-dark.webp)    | [Light](rules-mobile-light.webp)    | [Dark](rules-mobile-dark.webp)    |

另附 [手機賽季選單 Light](menu-mobile-light.webp)／[Dark](menu-mobile-dark.webp)。`current-*.webp` 是相同路由／尺寸／明暗的最新原有風格對照，共 12 張。

圖片為真實 viewport 截圖：桌面 1440×1000、手機 390×844，沒有拼貼、後製改字或補造元件。手機圖不強行把整份統計壓入首屏；維持當前頁面正常捲動。

## 資料與權限邊界

S10 內容直接使用已提交的 `docs/imports/s10-archive.json`、原始主視覺和現有規則書；10 隊、80 名選手／教練、30 筆已記錄賽果、5 組圖池、97 個譜面位置由真實讀模型計算。沒有修改原圖、名稱、規則、賽果或譜面文字。預覽 fixture 的 summary 明確標示 `Design preview using the committed S10 archive.`，不是新增正式賽事文案。

產圖只使用本任務專用的隔離 `oclr_195_design_test` 資料庫。公開頁為匿名訪客；Admin 只使用 `Synthetic UI Preview` 合成測試帳號和記憶體內的測試 session，正常通過既有 server 授權。沒有 production／demo 存取、真實角色授予、OAuth secrets、驗證繞過或資料寫入操作。圖池未配置 osu! provider，保留實際「封面暫不可用」狀態，沒有補造封面或新譜面資料。

`capture.mjs` 封鎖瀏覽器對外請求和所有非 GET／HEAD；不點擊儲存、不更改設定。既有外觀選單仍只列出九款已註冊值；S10 是瀏覽器端 review overlay，不偽造已正式註冊的狀態。

## 重現

用 Node.js 24，先依專案指南建立**全新可丟棄的 test DB**，不讀 `.env.local`。設定 `TEST_DATABASE_URL`，明確將同一值作為遷移／應用的 `DATABASE_URL`。本機實際使用獨立 loopback PostgreSQL 55495 和應用 3195。

```sh
npm ci
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s10/prepare.ts
APP_URL=http://127.0.0.1:3195 DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 PRIVACY_CONTACT_OSU_ID=60001 npm run build
APP_URL=http://127.0.0.1:3195 DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 PRIVACY_CONTACT_OSU_ID=60001 npm start -- --hostname 127.0.0.1 --port 3195
```

另一終端在相同 checkout、相同 `TEST_DATABASE_URL` 執行：

```sh
node --import tsx docs/design/season-themes/s10/capture.mjs
```

這些是隔離測試帳號／本機產圖參數，不適用於正式啟動。只看圖庫不需要應用、DB、帳號或伺服器。

## 本版驗證

- 最新應用 production build（Node.js 24）通過。
- 真實三個路由 × 320／390／768／1440px × 明暗共 **24 組**；**24 次 Axe AA 無違規**，無水平溢出、無頁面錯誤。
- 元件樹／顯示文字不變、完整 1024×1024 原圖與 contain、五列統計／歷史手冊存在、手機賽季選單與 Escape 焦點回復、既有 header stack 量測通過。[本版紀錄](verification.json)。
- 4 組 forced-colours 檢查（明暗 × 320／1440px）通過：插畫與裝飾退場，系統色選取可見，320×568px 選單仍在視窗內並可回復焦點。
- S10 gallery、prepare／capture 工具與共用 verifier 的 ESLint、JS 語法、文件相對連結、24 種圖庫組合及 diff 檢查通過。
- `npm audit --omit=dev`：0 vulnerabilities。
- 本版檢查不是完整應用回歸、三語或部署驗收；CI 按本次提交另行查證。未對其他三季重新產圖。

## 後續接入

主辦方審閱本版範例圖與命名後，才安排正式接入。必須重用當前元件，保留九款 appearance、SSR 首屏、獨立明暗、訪客 → 當前授權／已發佈賽事 → 全站預設與清除繼承；不自動修改歷史賽事預設。正式接入另驗證三語、公開／登入／Admin／Player／Captain、完整回歸與實際 CI。中文措辭仍需主辦方審閱。
