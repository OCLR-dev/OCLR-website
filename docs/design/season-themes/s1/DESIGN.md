# S1 — 彩墨初章 / Chromatic Origins

Issue [#417](https://github.com/OCLR-dev/OCLR-website/issues/417)。候選設計以 main `f4b5eb85` 的實際元件為基準，參考最新 S5 稜面 Banner、S6 電路材質層次與目前共用控制項。尚未註冊 appearance；不改既有預設、產品文案、路由或資料庫 schema。

## 視覺

紙面彩墨、斜向套印與雙圈圓章。兩份原生 SVG 包含斷續斜線、半透明墨面與圓章，鋪滿 Banner，左側閱讀罩層降低干擾。淺色以紙白與圓章紫為主；深色以紫灰紙面及柔和淺紫呈現，依主辦方本輪要求加強青綠、深藍、紫、珊瑚橘、粉色與少量暖黃，呈現更鮮明的主視覺套印層次。沿用 MainSheet 面板、導覽、表格、控制項及語意色；reduced motion 停止入場位移，forced colors 移除裝飾。

[候選 CSS](../s1.css) 以 `html[data-s1-preview] .themed-site` 限定範圍，沒有正式匯入。全部 `--site-*` 明暗 tokens 可在該檔核對。原圖完整保留 1728×1080／8:5，不裁切、重繪或改字。兩份 SVG 為原生繪製，無外部字型、圖片或腳本。

## 真實頁面與資料限制

[圖庫](../s1.html) 展示主頁、賽程、圖池及 Admin 的實際應用截圖，與相同頁面 default 外觀對照。候選 CSS 在瀏覽器加入，SVG 由擷取工具本機回應；不是已註冊主題的 SSR 驗收。

儲存庫沒有完整 S1 archive 匯入包。使用已提交原圖與七章 S1 原文規則，賽程／圖池保持空態。現有 archive schema 要求至少一隊且每隊一位 Captain，因此 fixture 僅加入明確標示 Synthetic UI Preview 的隊伍與 Captain；其數量不是歷史統計。無比分、名次、日期或真實私人資料。Admin 使用隔離 test DB 合成帳號，session 僅在記憶體。

## 重現

使用 Node 24、npm ci，以及獨立、可丟棄且含 test 名稱的 PostgreSQL。先明確設定 TEST_DATABASE_URL：

```sh
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s1/prepare.ts
npm run build
DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 APP_URL=http://127.0.0.1:3191 npm start -- --hostname 127.0.0.1 --port 3191
node --import tsx docs/design/season-themes/s1/capture.mjs
```

擷取工具僅允許 loopback、GET／HEAD 與本機素材；不儲存設定。驗證涵蓋四頁×四寬×明暗、Axe AA、DOM 內容、原圖尺寸、手機導覽、焦點、forced colors 與 Banner 文字幾何。本輪實際結果見 verification.json；正式接入、主辦方視覺接受與部署各自獨立。

## 本輪驗證

Node 24.22.1；npm ci、npm run check、production build 通過。完整單元／整合 183 檔、1480 項通過、1 項略過；npm audit --omit=dev 為 0 漏洞。主要明暗 token 對比數值見 [contrast.json](contrast.json)。候選 CSS 與圖庫腳本 lint／語法檢查通過。新增產品翻譯為零。

鮮豔版最終擷取：四頁 × 320／390／768／1440px × 明暗，共32組及32次Axe AA，零違規、無溢出；4組forced colors通過。原圖尺寸／contain、DOM文字與元素、手機選單與焦點、Admin焦點及937／390px標題幾何通過。已人工檢視桌面淺色及手機深色。圖庫32種切換、8次Axe AA零違規且無溢出，見 [gallery-verification.json](gallery-verification.json)。
