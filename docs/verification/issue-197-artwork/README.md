# S8 主題圖更新 — 2026-10-28

依 [#197](https://github.com/OCLR-dev/OCLR-website/issues/197) 與主辦方本次附件，將正式 Sakura Circuit 標題人物圖換成 `heroine-half-20261028.webp`。基於 main `d5ca25b2fb569e2deba76b0a2826b956d01a6f6d`，保留原排版、底端淡出、其他裝飾、原始賽事主視覺與偏好行為。

原始附件與入庫 PNG 的 SHA-256 均為 `34415f13cb38216cc0d64b6183b092e916dce7997ea526f26e2d483e6ada2e0e`。WebP 為 1536×1024、423,550 bytes，quality 92／alphaQuality 100，透明 alpha 逐像素一致；[素材來源](../../design/season-themes/s8/ARTWORK.md)。

## 實際頁面截圖

使用本次 production build、正式 `sakura-circuit` cookie、繁中與原生 2× 像素，直接擷取 `/tournaments/s8` 的完整標題區。沒有候選 CSS overlay、拼貼或後製；僅使用新建隔離 test DB 的公開歷史歸檔 fixture。

| 寬度  | Light                         | Dark                         |
| ----- | ----------------------------- | ---------------------------- |
| 937px | [桌面](heading-937-light.png) | [桌面](heading-937-dark.png) |
| 390px | [手機](heading-390-light.png) | [手機](heading-390-dark.png) |

## 本輪驗證

- Node.js 24.22.1、`npm ci`、`npm run check`、`npm run build` 通過。
- `npm test`：168 個檔案通過，1,348 項通過／1 項略過；使用本輪專用隔離 test DB。
- `npm audit --omit=dev`：0 vulnerabilities。
- 變更檔案 Prettier 與 `git diff --check` 通過。
- `npm run test:e2e -- tests/e2e/sakura-appearance.spec.ts --project=desktop --project=mobile`（Chrome）：4 項全部通過，涵蓋三語、明暗、十種尺寸的 60 組幾何檢查，以及主題選單、SSR／跨頁偏好、圖片載入、Axe AA 與高對比退場。本輪未執行完整全站／跨瀏覽器矩陣，歷史結果不視為本輪新跑結果。

沒有新增介面文字、依賴或 migration。新圖片採獨立檔名；舊素材保留。交付 feature branch 待主辦方審閱，CI、合併與部署狀態分開記錄於 issue。
