# S3 · Frost Waltz／雪花圓舞曲

2026-10-29，依 [#343](https://github.com/OCLR-dev/OCLR-website/issues/343) 主辦方逐輪確認的晶瑩流光方案，正式接入 `frost-waltz`，提交PR供審閱。整合基準 main `5032b947`（含S1／S2正式接入）。尚未合併或部署；既有全站與賽事預設保持不變。

[正式SSR對照圖庫](../s3.html) · [桌面深色](desktop-dark.webp) · [桌面明亮](desktop-light.webp) · [手機深色](mobile-dark.webp) · [手機明亮](mobile-light.webp) · [Banner局部](heading-937-dark.png)

## 視覺與素材

以「雪花圓舞曲」的三拍聚散構圖：三枚主雪花以−18°／12°／40°旋轉角度沿低—高—低弧線起伏，每段由大雪花領舞、兩枚小雪花回應。19枚雪花、85點碎光、六條疏密流線和11處星芒形成舞步與晶瑩反光。主雪花有錯位暗邊、半透明表面、細白亮邊、雙面晶瓣與中央折射軸；背景雪花維持細線，讓畫面有前後層次。

薄光帶開放流動，不恢復封閉圓環。文字區採漸淡遮罩；雪白／深藍灰資料面保持平整。所有反光為靜態SVG，沒有頻閃、飄雪或持續轉動。沿用既有輕量入場與操作回饋，尊重reduced motion；forced-colors移除裝飾與陰影，保留系統焦點與選取狀態。

正式 [frost-theme.css](../../../../src/app/frost-theme.css) 沿用最新S5／S6 MainSheet元件結構：28×32px banner內距、手機24px、12px面板、8px控制、五列統計、水平導覽與44px操作區。外觀限於 `.themed-site`，OBS／presenter保持隔離。

- [正式Light SVG](../../../../public/themes/frost-waltz/frost-field-light.svg)／[Dark SVG](../../../../public/themes/frost-waltz/frost-field-dark.svg)：原生自繪向量，與主辦方確認的候選素材逐byte相同，沒有字型、腳本、遠端請求或第三方插畫。
- [draw-waltz.py](draw-waltz.py) 可重現文件區的原稿；審閱後將兩份SVG同步至正式資產目錄。
- [原主視覺](../../../../public/archive/s3/key-visual.avif) 995×621完整保留；不裁切、重繪、調色或更改歷史文字。
- [s3.css](../s3.css)、[獨立Banner稿](waltz-banner.html) 與 `waltz-verification.json` 保留為已審閱的候選階段紀錄；正式圖庫不再注入此CSS。

## 語意色

| Token                              | Light     | Dark      |
| ---------------------------------- | --------- | --------- |
| `--site-background`                | `#F2FAFF` | `#101E2A` |
| `--site-surface`                   | `#FFFFFF` | `#172B39` |
| `--site-raised`                    | `#E5F3FA` | `#213C4C` |
| `--site-tint`                      | `#E0F2F8` | `#244556` |
| `--site-foreground`                | `#18384E` | `#E9F5FB` |
| `--site-muted`                     | `#506C7E` | `#ACC4D1` |
| `--site-secondary-text`            | `#365E75` | `#C4DBE7` |
| `--site-accent` / `--site-primary` | `#174A78` | `#91D8EF` |
| `--site-on-primary`                | `#FFFFFF` | `#102B3D` |
| `--site-border`                    | `#C9DFE9` | `#345262` |
| `--site-control-border`            | `#668697` | `#7C9BAA` |
| `--site-focus`                     | `#174A78` | `#83D4DF` |
| `--site-success`                   | `#22654F` | `#9BDFC1` |
| `--site-warning`                   | `#865500` | `#F4D397` |
| `--site-danger`                    | `#B32F48` | `#FFB2C2` |

品牌色與成功／提醒／錯誤語意獨立。完整hover、selection與陰影值以正式CSS為準。

## 正式接入邊界

三語選單：**S3 · Frost Waltz／S3 · 雪花圆舞曲／S3 · 雪花圓舞曲**。重用既有外觀白名單、SSR cookie、全站與賽事設定及共用讀取契約。訪客選擇 → 當前已授權／已發佈賽事預設 → 全站預設的優先序維持；清除選擇跟隨當前路由、不寫自動cookie，非賽事頁不繼承上一季，明暗獨立。

Migration `0055_frost_waltz_appearance` 只擴充 `site_settings`／`site_setting_events` 的外觀約束。現有預設、賽事配置與審計歷史不變；升級前後測試確認舊約束拒絕新值、升級後接受且保留歷史。部署時經既有reviewed update流程套用；有意退回舊版程式前先選回舊版支援的預設，不刪歷史或down-migrate live DB。

## 預覽資料

Repository沒有完整可重現的S3歷史歸檔，本輪不讀取production或私人Admin。圖庫使用 [frostPreview](../../../../tests/fixtures/frost-preview.ts) 的清楚標示合成資料：一個placeholder team／captain是schema所需，計數不代表S3歷史資料，賽程／圖池保持空態；沒有推測真實比分、日期、名次或身分。Admin使用隔離test庫合成帳號，session僅在擷取程序記憶體中。

## 重現

Node24、npm與既有lockfile；僅使用名稱含獨立 `test` 段的可丟棄資料庫。

```sh
export TEST_DATABASE_URL=postgresql://emik@127.0.0.1:55433/oclr_s3_preview_test
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s3/prepare.ts
npm run build
DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 APP_URL=http://127.0.0.1:3193 npm start -- --hostname 127.0.0.1 --port 3193
# 另一個terminal，同一TEST_DATABASE_URL
node --import tsx docs/design/season-themes/s3/capture.mjs
node docs/design/season-themes/s3/verify-gallery.mjs
```

`prepare.ts`不是production seed。正式擷取先保存default對照，再以合法 `oclr-appearance=frost-waltz` cookie重載並核對SSR，使用建置後CSS與正式SVG。阻擋外部流量及非GET／HEAD請求，核對除目前外觀按鈕標籤外的內容不變。報告記錄build ID與CSS／素材hash。

驗證結果以 [verification.json](verification.json)、[gallery-verification.json](gallery-verification.json) 及PR本輪紀錄為準。候選階段的獨立元件結果不代替正式整合、全站完整回歸、CI或部署驗收。

設計方法沿用專案指定 [Refactoring UI](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 與frontend-skill，並保留主辦方確認的晶瑩流光視覺。

## 本輪正式整合驗證（2026-10-29）

同步 main `5032b947` 後，以 Node.js 24、全新隔離測試資料庫執行：

- `npm run check`、`npm run build`、i18n extraction／4項檢查通過；`npm audit --omit=dev` 為0 vulnerabilities（合併未更動依賴）。
- `npm test`：185個檔案，1,518 passed／1 skipped，包含S1→S3的0055約束升級與歷史保留測試。
- Chrome桌面／手機：20 passed，涵蓋S1／S3、公開／Admin／Captain配色、全站／賽事預設、權限與OBS隔離。
- 遠端core frontend桌面／手機：2 passed，包含已註冊主題素材GET／HEAD、SSR與授權撤銷隔離。
- S3 WebKit桌面／手機：4 passed，涵蓋三語、明暗、鍵盤選取、SSR、完整原畫、窄螢幕、長文字與可及性。
- 正式SSR擷取32組通過；圖庫128次圖片選取、8次Axe掃描通過，報告記錄最新build ID及素材hash。
- 同步S1前另已通過固定核心28項、既有S2–S10選單／全站設定20項；這些結果保留其執行基準，不作為最新全站矩陣驗收。

WebKit臨時設定的模組路徑及Chrome連接埠占用已修正後重跑；遠端測試曾因同步主線期間讀到衝突標記而中止，最終桌面／手機重跑均通過。未執行手動full全站矩陣、真實OAuth或部署；CI與主辦方驗收以PR的實際狀態為準。
