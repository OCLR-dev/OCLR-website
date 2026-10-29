# S2 — Verdant Prelude / 青燕春序

2026-10-29，依 [#416](https://github.com/OCLR-dev/OCLR-website/issues/416) 與主辦方本輪授權，參考最新 S5 `60db0209`、S6 `c537b162`、S7 `f81d1cee` 實作，製作未註冊的候選主題。實際 React 頁面基準為 main `f4b5eb85e363ddf1aed77a9cfcc7f40653c01180`。提交前同步 main `f3b51b7e`（僅 S8 樣式／驗證修正，S2 擷取仍使用上述 build 基準）。未改正式路由、白名單、翻譯、偏好或資料庫結構，也未部署。

## 設計

薄荷水彩紙面、青墨文字與開放圓弧構成全幅標題背景。紙纖維及多層暈染由原生 SVG 表現，右側較濃、文字側淡出；明暗素材分別設計。依主辦方後續回饋，banner 右側新增兩隻自繪飛燕：深青羽色（暗版為淡青）、朱紅喉部、剪形尾羽，以大小與角度差異呼應原圖。另依主辦方回饋加入五片自繪漸層葉片、細葉脈與右下延伸枝條，與雙燕分層配置；手機保留閱讀罩層減淡裝飾。飛燕與葉片不是操作圖示，原始主視覺保持不變。資料面保持平靜，紙紋不進入表格或表單。

沿用最新 MainSheet 的完整原圖／五列統計對齊、規則手冊、文字導覽、44px 控制項與管理側欄。面板 12px、控制項 8px；內文沿用系統字體。標題文字自然換行，裝飾在背景內裁切，沒有預留空白裝飾欄。手機降低紋理對比；937px 另擷取標題與量測文字幾何。

互動沿用 160ms 輕入場、140ms 導覽回饋與 1px 按壓；reduced motion 不執行裝飾動畫，forced colours 移除背景材質。品牌綠與成功／警告／錯誤保持獨立 token。

- [離線圖庫](../s2.html)：四頁 × 明暗 × 桌面／手機 × 候選／default，共 32 種切換。
- [桌面 Light](desktop-light.webp)／[Dark](desktop-dark.webp)。
- [手機 Light](mobile-light.webp)／[Dark](mobile-dark.webp)。
- [管理桌面 Light](admin-desktop-light.webp)／[Dark](admin-desktop-dark.webp)；[管理手機 Light](admin-mobile-light.webp)／[Dark](admin-mobile-dark.webp)。
- [937px Light](heading-937-light.png)／[Dark](heading-937-dark.png)。

## Tokens 與素材

完整樣式在 [candidate.css](candidate.css)。CSS 中的 `__S2_LIGHT__`／`__S2_DARK__` 由擷取工具替換為本地 SVG data URL，不由正式應用載入。

| Token                   | Light     | Dark      |
| ----------------------- | --------- | --------- |
| `--site-background`     | `#F5FAF7` | `#12231F` |
| `--site-surface`        | `#FFFFFF` | `#1B302A` |
| `--site-raised`         | `#E8F3ED` | `#274138` |
| `--site-foreground`     | `#244A43` | `#EDF6F0` |
| `--site-muted`          | `#526D63` | `#B5CBBF` |
| `--site-accent`         | `#2D634D` | `#9BCFC1` |
| `--site-primary`        | `#397B60` | `#9BCFC1` |
| `--site-on-primary`     | `#FFFFFF` | `#17382D` |
| `--site-border`         | `#D4E5DB` | `#3E5B4E` |
| `--site-control-border` | `#718E80` | `#7D9D8C` |
| `--site-focus`          | `#397B60` | `#B3E6D6` |

[paper-light.svg](paper-light.svg)／[paper-dark.svg](paper-dark.svg) 為本輪自繪向量紋理，無外部圖片、字體或腳本。原始 [1379×862 S2 主視覺](../../../../public/archive/s2/key-visual.avif) 保持完整比例、文字及原色，SHA-256 記於驗證檔。

## 資料與預覽邊界

畫面來自目前 production build 的實際 React 頁面，擷取時注入候選 CSS 並在瀏覽器記憶體改為 `data-appearance="verdant-prelude"`。不是正式 SSR 註冊外觀；default 對照取自同頁、同尺寸、同明暗。圖庫只切換截圖，不提供實際管理寫入。

S2 完整公開 archive 未隨版本庫提交，本輪沒有取用私人管理匯出。獨立 test DB 僅含清楚標示的 Synthetic UI Preview，以及 schema 必需的一支合成隊伍與一名合成 Captain；1 隊／1 人不是歷史統計。賽程、圖池、賽果保持空態。原圖及五章規則來自已提交的公開檔案，原文保持 literal。Admin 使用本機合成帳號，session 只存在擷取程序記憶體。

因此本輪驗證涵蓋頁面與空態，不能宣稱已驗證有資料的 S2 圖池卡片、比分、長名稱或歷史統計。正式接入及新增中文名稱仍待主辦方審閱。

## 重現

Node.js 24、npm 及既有 lockfile。先建立專用、可丟棄且名稱含獨立 `test` 段的 PostgreSQL，勿指向 demo／production。

```sh
npm ci
export TEST_DATABASE_URL=postgresql://emik@127.0.0.1:55416/oclr_s2_theme_preview_test
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s2/prepare.ts
DATABASE_URL="$TEST_DATABASE_URL" npm run build
DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 APP_URL=http://127.0.0.1:3192 npm start -- --hostname 127.0.0.1 --port 3192
```

另一個終端設定相同 TEST_DATABASE_URL，再執行：

```sh
node --import tsx docs/design/season-themes/s2/capture.mjs
node docs/design/season-themes/s2/verify-gallery.mjs
```

`S2_PREVIEW_ORIGIN` 僅接受 loopback；擷取封鎖外部請求及非 GET／HEAD，核對候選前後文字與 DOM 元素數相同。只對隔離測試環境寫入 fixture／合成 session，不變更應用 API 或業務權限。

## 驗證

實際結果見 [頁面驗證](verification.json) 與 [圖庫驗證](gallery-verification.json)。首輪找到淺色規則目錄選取文字對比不足，將 accent 加深至 `#2D634D` 後重跑。

最終候選版：四頁 × 320／390／768／1440px × 明暗，共 32 次 Axe AA 零違規、無水平溢出或頁面錯誤；4 組 forced colours 通過，原圖比例／五列統計／五章規則及候選前後文字與 DOM 保留。手機選單／Escape 焦點與 Admin 鍵盤焦點通過。另有 937／390px 明暗標題圖。離線圖庫 32 種切換、8 次 Axe AA 及鍵盤順序通過。

本輪執行 Node.js 24 鎖定安裝、production build、`npm run check`、擷取工具 ESLint／語法及格式檢查。僅新增設計檔與預覽工具，未修改 runtime；未跑完整 unit／integration 或全站 E2E，未宣稱 CI、正式註冊或部署通過。

設計方法沿用專案指定 [Refactoring UI](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 與 frontend skill，優先維持既有元件及閱讀層級。
