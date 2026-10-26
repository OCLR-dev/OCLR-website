# S9 — Glacier Blue / 冰晶鈷藍

追蹤：[#196](https://github.com/OCLR-dev/OCLR-website/issues/196)。2026-10-26 依主辦方要求，沿用已合併 #195／PR #362 的方法更新；候選設計待審閱，正式接入另行指定。

本輪延續琪露諾冰妖精方向，精修角色下緣融合、標題留白、雪晶細節、導覽選取與統計層級。角色素材與完整無框原圖維持原樣，實際 UI 範例同步重產。

## 最新 UI 基準

本版基於 canonical main **`cc366f2e80563b3effff6bf25ef8074c6a95258f`**，直接建置並開啟現有應用，在瀏覽器加入 [S9 候選 CSS](../s9.css) 產圖，不建立另一套頁面 renderer。

| 真實路由                   | 保留的實際元件與內容                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/tournaments/s9`          | `Header`、`TournamentShell`、`HistoricalArchiveView`：頁面標題、完整原圖、五列歸檔統計、`RulesSection`／`RulesHandbook` |
| `/tournaments/s9/mappools` | `ArchiveMappools` 的四階段、搜尋／排序／模組篩選、卡片／緊湊表格與詳情入口                                              |
| `/admin/settings`          | `StaffNavigation` 側欄／手機管理選單、`SiteAppearanceForm` 及現有儲存狀態                                               |

頁首的 Logo、主導覽、外觀／明暗／語言控制與登入入口均為目前元件；手機選單、sticky stack 和規則錨點沿用現有量測機制。產圖前檢查 `src`／`messages`／品牌資產與 UI 基準一致，套色前後的 DOM 元素數量和顯示文字必須相同。

## 設計主張

**以琪露諾的冰妖精形象延伸 S9 冰晶材質：角色、六片冰翼、藍白服飾與紅色領結。** 霜白／鈷藍與薄切面保留，角色只出現在頁面標題區，原主視覺維持無框。資料區與表單延續實色閱讀核心與清楚操作層級。

內容順序沿用目前頁面：主頁標題 → 原圖／五列統計 → 完整規則；圖池與 Admin 保留現有工作內容。手機與較窄版面把角色放在標題文字下方的 112px 區域，桌面置於右側；文字區保留獨立寬度；沒有新增 DOM、假 tabs 或操作控制。

冰妖精語彙分工：

- **琪露諾同人插畫**：[透明 WebP](cirno-ice-fairy.webp) 由內建 image_gen 新生成，藍髮、藍色頭蝴蝶結、白色短袖／藍裙、紅色領結、六片冰翼與手上雪晶形成明確識別。[素材、來源與完整提示詞](ARTWORK.md)。
- **角色與雪晶融合**：角色保留自身六片冰翼，下緣以 CSS 漸隱融入霧光；移除外掛的大型冰翼。以 [細雪晶 SVG](crystal-etching.svg) 作單一小刻紋，桌面 72px、較窄版面 48px。桌面標題高 176px，字距收斂；1100px 以下採上下配置，文字與角色不重疊。
- **領結點綴**：角色領口的紅色在統計上沿回應為 16×7px 小蝴蝶結，貼齊上沿。另定義 `--fairy-ribbon`，不修改成功／警告／錯誤或主操作色。
- **霜邊與薄切面**：標題右端的 [霜邊 SVG](frost-rim.svg) 收為 4px 薄刻紋，降低不透明度；資料面頂緣折光漸層延伸至 24px，核心維持實色。標籤 .9rem、數字 2.25rem，列內垂直置中、14px 上下內距。導覽選取使用淡藍底與底線；規則只保留章節分隔線，移除重複的標題底線。
- **無框原圖**：沿用 `.archive-key-visual` 與 contain，不加冰框、內框、霜層、切面背景、額外內距或陰影。[折光 SVG](ice-facets.svg) 僅用於圖池封面區。

角色素材為 **東方Project 二次創作 · 琪露諾 / Cirno ©上海アリス幻樂団 / ZUN**，圖庫、Issue 與素材文件均保留標註；正式接入時也須在實際三語介面保留同人說明。形象參考與官方指南見 ARTWORK，並未將同人素材表述為官方聯名。

capture 將透明 WebP 與三個已知本機 SVG 內嵌為 data URL，不增加應用路由、DOM 或對外資產請求。背景與空內容 pseudo-element 不接受指標事件，不遮蓋焦點。forced colours 移除角色／冰翼／領結與陰影，改用系統色邊界和 Highlight 選取。互動與 reduced motion 延續既有元件，沒有新增持續動畫或背景模糊。

### 與既有 theme 的關係

| 現有 appearance     | S9 的採用與取捨                                                      |
| ------------------- | -------------------------------------------------------------------- |
| `default`           | 保留 MainSheet 元件、系統字體、現有字級／間距、表格與響應式結構。    |
| `swiss-minimal`     | 借鑑對齊、細分隔線與數字閱讀；S9 保留 4px 幾何，以冰斷面和刻紋延伸。 |
| `cute-pastel`       | 沿用柔和閱讀底色與完整原圖；S9 採冷霜白，主操作使用飽和鈷藍。        |
| `claymorphism`      | 保留工作區層級分工；本版用薄冰斷面、亮脊和小幅陰影表達深度。         |
| `manga-halftone`    | 裝飾與內容分層；晶枝與霜邊只在非閱讀區，不加入網點或漫畫字。         |
| `glassmorphism`     | 借鑑材質分層；S9 以冰晶折光邊緣和實色核心表達厚度，不用 blur。       |
| `esports-broadcast` | 借鑑裝飾層與操作分工；晶體面不改變既有選取或狀態語意。               |
| `retro-arcade`      | 保留 tabular 數字與非純顏色狀態；不用像素字、霓虹框或掃描線。        |
| `frutiger-aero`     | 延續冰藍與可讀資料面；不加入亮面膠囊或球體。                         |

S9 的晶枝、霜邊、折光面與冰層厚度共同呼應原圖；主要資料與操作仍來自最新應用結構。

## 原圖與候選 tokens

[原始 S9 主視覺](../../../../public/archive/s9/thumbnail.png) 為 **1920×1080／16:9**。保留完整構圖、所有原圖文字與色彩，維持 `object-fit: contain`；不重繪、不裁切、不調色。原圖內歷史名稱與 `2023 Winter` 原樣呈現；網站介面沿用官方 **osu! Chinese League Rookie (OCLR)**。

| Token                               | Light     | Dark      |
| ----------------------------------- | --------- | --------- |
| `--site-background`                 | `#f4f9fe` | `#0d182c` |
| `--site-surface`                    | `#ffffff` | `#14223b` |
| `--site-raised`                     | `#edf5ff` | `#1d3151` |
| `--site-tint`                       | `#e4efff` | `#203c64` |
| `--site-foreground`                 | `#102c50` | `#eaf6ff` |
| `--site-muted`                      | `#506781` | `#abc3de` |
| `--site-secondary-text`             | `#304e75` | `#cfdef1` |
| `--site-accent`                     | `#1748d5` | `#88dfff` |
| `--site-accent-strong`              | `#1038b2` | `#afeaff` |
| `--site-border`                     | `#ccdced` | `#304869` |
| `--site-control-border`             | `#607c9e` | `#7b9bc3` |
| `--site-header`                     | `#ffffff` | `#0d182c` |
| `--site-primary`                    | `#1748d5` | `#88dfff` |
| `--site-primary-hover`              | `#1038b2` | `#afeaff` |
| `--site-on-primary`                 | `#ffffff` | `#102c50` |
| `--site-focus`                      | `#1748d5` | `#88dfff` |
| `--site-selection`                  | `#c5ddff` | `#2a4c7b` |
| `--button-radius`／`--radius-panel` | `4px`     | `4px`     |

文字、動作、欄位邊界和資料細線各自定義；success／warning／danger 與 mod 狀態保持既有語意，不一律改成藍色。材質另外定義 `--ice-rim`／`--ice-rim-bright`／`--ice-rim-shade`、`--ice-facet`、`--ice-cut`、`--ice-etch`、`--ice-well`、`--fairy-ribbon`、`--ice-contact`、`--ice-panel-depth` 與 `--ice-slab`；文字和狀態 tokens 保持獨立。完整定義見 [s9.css](../s9.css)。樣式只作用於 `html[data-s9-preview] .themed-site`，沒有應用 import、正式 appearance 註冊或 cookie 寫入，OBS／presenter 維持隔離。

## 可審閱成果

[離線實際截圖對照圖庫](../s9.html) 可切換頁面、桌面／手機、明暗及最新原有風格／S9 候選。圖庫只顯示圖片，不是獨立重做的產品頁。

| 真實頁面    | 桌面 Light                           | 桌面 Dark                          | 手機 Light                          | 手機 Dark                         |
| ----------- | ------------------------------------ | ---------------------------------- | ----------------------------------- | --------------------------------- |
| S9 主頁     | [Light](desktop-light.webp)          | [Dark](desktop-dark.webp)          | [Light](mobile-light.webp)          | [Dark](mobile-dark.webp)          |
| S9 圖池     | [Light](mappools-desktop-light.webp) | [Dark](mappools-desktop-dark.webp) | [Light](mappools-mobile-light.webp) | [Dark](mappools-mobile-dark.webp) |
| S9 規則手冊 | [Light](rules-desktop-light.webp)    | [Dark](rules-desktop-dark.webp)    | [Light](rules-mobile-light.webp)    | [Dark](rules-mobile-dark.webp)    |
| Admin 設定  | [Light](admin-desktop-light.webp)    | [Dark](admin-desktop-dark.webp)    | [Light](admin-mobile-light.webp)    | [Dark](admin-mobile-dark.webp)    |

另附 [手機賽季選單 Light](menu-mobile-light.webp)／[Dark](menu-mobile-dark.webp)，以及 12 張相同頁面／尺寸／明暗的 `current-*.webp` 原有風格對照。桌面 1440×1000、手機 390×844；維持當前頁面的正常捲動，不將全部內容強壓入首屏。

## 資料與重現

完整 S9 資料直接來自已提交的 `docs/imports/s9-archive.json` 與現有規則書／讀模型。實際顯示：8 隊、76 名選手／教練、22 筆已記錄賽果、4 組圖池、76 個譜面位置。名字、規則、賽果、原表時間與譜面文字不改；不補造賽果、封面或即時譜面資料。Fixture summary 明確標示 `Design preview using the committed S9 archive.`，不是正式賽事文案。

只使用本任務專用的隔離 `oclr_196_design_test`。公開頁匿名；Admin 使用正常通過現有 server 授權的 `Synthetic UI Preview` 測試帳號，session 僅在記憶體中。沒有真實角色授予、OAuth secrets、驗證繞過或 production／demo 存取。產圖封鎖瀏覽器對外請求及非 GET／HEAD，不點儲存。未配置 provider，圖池保留實際封面暫不可用狀態。

用 Node.js 24，在全新可丟棄 test DB 明確設定 `TEST_DATABASE_URL`，不讀 `.env.local`；同一值供遷移、fixture、應用與產圖使用：

```sh
npm ci
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s9/prepare.ts
APP_URL=http://127.0.0.1:3196 DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 PRIVACY_CONTACT_OSU_ID=60001 npm run build
APP_URL=http://127.0.0.1:3196 DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 PRIVACY_CONTACT_OSU_ID=60001 npm start -- --hostname 127.0.0.1 --port 3196
```

另一終端在相同 checkout 與 `TEST_DATABASE_URL` 執行：

```sh
node --import tsx docs/design/season-themes/s9/capture.mjs
```

本次使用獨立 loopback PostgreSQL 55496／應用 3196。工具預設核對本版 UI 基準 `cc366f2`；未來重產可用 `S9_UI_BASELINE` 指向已核對的完整 commit SHA，仍要求應用來源一致。以上為隔離測試參數，只看圖庫不需要 DB、帳號或伺服器。

## 本版檢查與接入邊界

- 已同步 main `cc366f2`，應用來源與上一輪已通過 Node.js 24 production build 的 `e40db52` 相同，沿用該 build。本輪只精修 review CSS／產圖工具與文件；S10 成果維持最新 main，未重跑無關完整應用回歸。
- 三個實際路由 × 320／390／768／1440px × 明暗，共 **24 組、24 次 Axe AA 無違規**，無水平溢出或頁面錯誤。[本版報告](verification.json)。
- 套色前後 DOM／文字保留、五列統計／完整規則、原始 1920×1080 圖片與 contain、手機選單／Escape 焦點、既有 sticky stack 通過。
- 冰晶材質額外通過明暗 × 320／1440px 的 4 組 forced-colours 檢查：角色／冰翼／霜邊移除、系統色選取可見，320×568px 的選單完整留在視窗內並可由 Escape 回復焦點。
- S9 gallery、prepare／capture 工具和共用 verifier 的 lint／語法、文件連結、24 種圖庫組合與 diff 檢查通過。其他三季未重產或重驗；2026-10-24 的舊樣本結果保留為歷史證據，不套用到本版。

設計方法延續專案指定的 [Refactoring UI skill](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 與前述層級／間距／字體／色彩／深度參考，落在目前 MainSheet 元件上。本版不等同完整應用回歸、三語、CI 或部署驗收。

正式接入另行指定：主辦方確認明暗／手機／Admin 方向與中文名稱後，重用現有元件及 next-intl，保留全部九款 appearance、SSR、獨立明暗、訪客 → 當前授權／已發佈賽事 → 全站預設與清除繼承；不自動改歷史賽事預設。正式接入再驗證三語、全部角色頁面、所有可操作狀態、文字 ≥4.5:1／控制邊界與焦點 ≥3:1、完整回歸與實際 CI，授權／發佈／OAuth／deep links 及 OBS 邊界不變。
