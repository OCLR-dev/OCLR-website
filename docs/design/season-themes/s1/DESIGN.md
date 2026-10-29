# S1 — 彩墨初章 / Chromatic Origins

## 正式接入（2026-10-29）

主辦方已確認彩墨浸染 Banner 並授權完整接入。正式外觀 `chromatic-origins` 使用 [chromatic-theme.css](../../../../src/app/chromatic-theme.css) 與 [核准素材](../../../../public/themes/chromatic-origins/ink-diffusion.webp)。三語名稱：S1 · Chromatic Origins／S1 · 彩墨初章。保留目前 Banner 配色與構圖，明暗獨立；公共、登入、Admin、Player、Captain 共用 MainSheet，OBS／presenter 隔離。

訪客 cookie → 當前授權／已發佈賽事預設 → 全站預設。清除訪客選擇沿用當前路由繼承，非賽事頁不繼承上一季。Migration 0054 只擴充設定與稽核約束，不改任何預設或歷史。回退前先選擇舊版支援的預設，不刪歷史或down-migrate。

圖庫以正式 cookie reload 驗證SSR，再使用建置CSS與正式WebP擷取；不注入候選樣式或攔截素材回應。來源資料限制與素材來源仍如下；舊候選CSS保留作歷史參考。未部署，新增中文名稱隨PR供審閱。

## 先前設計與驗證紀錄

Issue [#417](https://github.com/OCLR-dev/OCLR-website/issues/417)。候選設計以 main `f4b5eb85` 的實際元件為基準，參考最新 S5 稜面 Banner、S6 電路材質層次與目前共用控制項。尚未註冊 appearance；不改既有預設、產品文案、路由或資料庫 schema。

## 視覺

彩墨浸染：顏料在紙上擴散，形成不規則暈墨、深色積墨邊緣、透明疊色與紙纖維顆粒，局部疊加原圖的斜向排線。保留青綠、深藍、紫、珊瑚與粉色，左側留白供閱讀；Banner 不使用圓圈。

[候選 CSS](../s1.css) 限定在 `html[data-s1-preview] .themed-site`。原始 S1 圖完整保留 1728×1080／8:5。新版素材由 imagegen 參考使用者提供的原圖截圖生成，保存原始 PNG `ink-diffusion-source.png` 及 WebP `ink-diffusion.webp`；不是歷史原稿。深色以紫灰閱讀罩層融入紙面，不修改素材本身。舊 SVG 僅保留為歷史版本，不再載入。

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

固定核心桌面／手機 E2E 28項全部通過（2.1分鐘）。上述建置、測試及截圖基於 `f4b5eb85` 加本輪候選設計。提交 PR 後正常合併最新 main `49f7355`（含 S4 正式主題與 S8 控制項修正）；沒有將舊建置結果宣稱為合併後完整回歸，最終提交 CI 另行記錄。

## 2026-10-29 水墨修訂

依主辦方回饋移除 Banner 雙圈圓章，取消水彩塊面，改為墨色主筆、細密飛白、斷裂邊緣與散落墨點。保留青綠、深藍、紫、珊瑚與粉色的鮮豔筆觸。僅更換兩份 Banner SVG 與圖庫；原始 S1 主視覺（含其歷史圓章）完整保留。候選 CSS 與應用元件沒有變動。

本輪僅素材與文件更新，沿用既有建置：重新擷取32組頁面／32次Axe AA零違規、4組forced colors通過，圖庫32次切換／8次Axe AA通過；人工檢視新版桌面淺色。未重跑無關的完整應用測試。

## 彩墨浸染修訂

依主辦方附圖確認，將硬直筆刷改為自然浸染素材。生成要求：無文字、logo、圓圈或UI；左側40%保留白紙，右側以青綠、深藍、紫、珊瑚與粉色呈現毛細擴散邊緣、積墨、透明交疊及少量斜向網印線。來源為使用者本輪提供的 S1 主視覺截圖。保留來源PNG與WebP便於追溯。

浸染版最終驗證：32組頁面／32次Axe AA零違規、4組forced colors通過；圖庫32切換與8次Axe AA通過。人工檢視桌面淺色與手機深色。未重跑完整應用測試。

## 正式接入驗證

應用來源 `56382cbe9537f55ba1ce46b60bf8d0ebc39c3fa8`：Node 24.22.1、npm ci、check、build通過；i18n抽取與4項檢查通過；51份read contracts與OpenAPI再生成，production audit 0漏洞。核准WebP逐位元組不變。

正式SSR圖庫：32組頁面／32次Axe AA零違規，4組forced colors、原圖／DOM／手機選單／焦點通過；圖庫32切換／8次Axe AA通過。報告綁定build ID、來源提交與正式CSS／素材hash，不注入候選樣式。

完整測試初次遇到worker IPC中斷；單worker重跑得到1506項通過、1項略過，4項新加入的request-body路由測試因mock遮蔽權限函式失敗。已正常合併main `3750bc93` 的測試修復，僅更動該測試，不改應用runtime；受影響項目另行重跑記錄。

受影響的request-body 4項重跑全部通過；本輪總計1510項取得通過結果、1項略過。S1與共用外觀桌面／手機14項全部通過（4分鐘）：三語／SSR、明暗、完整原圖、窄螢幕、reduced motion、forced colors、公共／Admin／Captain與OBS隔離、全站設定與賽事繼承。

遠端核心frontend桌面／手機2項通過（1.5分鐘），包含正式theme素材GET／HEAD與byte比對、無本機DB／OAuth配置、隔離測試授權與撤權後私人資料清除。未執行全站full或Safari矩陣。最終文件連結與diff檢查通過；本機預覽已停止。CI依最終提交另行記錄。
