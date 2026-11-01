# S5 教練 UID 與 UTC+8 賽程核對（#610）

最新狀態：主辦者完成部署後，A21 已覆核發布；S5 為 **34／34 場、251 局、72 人、1,716 筆成績**，12 位教練 UID 與 34 場 UTC+8 日期均已保存。最終[部署後驗收證據](verification/issue-610-s5-coach-dates/post-deployment.json)見下方追加紀錄；先前 33／34 與等待部署的段落保留各自檢查點的狀態。

2026-11-01，主辦者指示以 username 反查 S5 教練 UID，時區採 UTC+8，賽程日期由 MP 反查。這份紀錄延續[已發布的 S5 統計](s5-statistics-publication.md)，不改寫早期來源檢查點。

## 教練身分

直接讀取 osu! 公開個人頁的 UID、現名及官方曾用名，並檢查帳號建立日期早於 S5。只保存必要的姓名證據及頁面 SHA-256，沒有保存個人介紹或聯絡資料。歷史名、隊伍、coach 身分、空 Tier 與原表儲存格保持原值。

| 隊伍 | 原表教練        |                                      osu! UID | 查詢時現名    | 對應證據                           |
| ---- | --------------- | --------------------------------------------: | ------------- | ---------------------------------- |
| A    | davidqu2        |   [6090175](https://osu.ppy.sh/users/6090175) | lolol235      | 官方曾用名                         |
| B    | im_a_burger_fox |   [5791401](https://osu.ppy.sh/users/5791401) | lolol234      | 官方曾用名                         |
| C    | Old k           |   [2385405](https://osu.ppy.sh/users/2385405) | Old K         | 現名，僅大小寫不同；資格賽七圖分數 |
| D    | buhei           |   [1371514](https://osu.ppy.sh/users/1371514) | buhei         | 現名；資格賽七圖分數               |
| E    | TiRa            |   [9697769](https://osu.ppy.sh/users/9697769) | TiRa          | 現名                               |
| F    | [Kaffu Chile]   | [10681880](https://osu.ppy.sh/users/10681880) | Kaffu-        | 官方曾用名；資格賽七圖分數         |
| G    | milk-tea        | [11375105](https://osu.ppy.sh/users/11375105) | 4k110sh1      | 官方曾用名；資格賽七圖分數         |
| H    | Crystal         |   [1646397](https://osu.ppy.sh/users/1646397) | Crystal       | 現名                               |
| I    | NekoKamui       |   [7172340](https://osu.ppy.sh/users/7172340) | KiryuMiya     | 官方曾用名；資格賽七圖分數         |
| J    | Kishin Sagume   |     [596803](https://osu.ppy.sh/users/596803) | Kishin Sagume | 現名；資格賽七圖分數               |
| K    | Manasoy         |     [760389](https://osu.ppy.sh/users/760389) | Manasoy       | 現名；資格賽七圖分數               |
| L    | demisemiquaver  |   [8501053](https://osu.ppy.sh/users/8501053) | ShaBae        | 官方曾用名；資格賽七圖分數         |

`demisemiquaver` 現在的名稱查詢會導向 **40214007**，其建立時間是 **2026-07-27**，晚於 S5。這個同名帳號不採用。正確的 8501053 個人頁明確列出 `demisemiquaver` 為曾用名；[教練資格賽 69815174](https://osu.ppy.sh/community/matches/69815174) 的七張譜面、分數及 UID 亦逐項對應 `教练赛积分!D9:T9`，不是按相近拼字合併身分。另一個相似名稱 `Sagume Kishin` 也不作為 `Kishin Sagume` 的依據。

其餘資格賽比對取得完整七圖證據的教練有七位。四位未在所存資格房找到七圖對應者，採用官方現名／曾用名證據，不補造資格賽出場。

## 日期口徑

重新讀取全部 34 場正式 MP 及四個教練房的公開事件，依 first/latest event ID 分頁讀取並確認完整。正式賽的 MP 起訖時間與原表交叉核對；日期以 MP 開房時間轉換為 `Asia/Shanghai`（當季 UTC+8）後的日曆日期核實，排定時分保留 MainSheet。`roomOpenedAt` 仍是原始 UTC 開房時間，不拿開房秒數代替排定時間。

- 33 場與原表日期相同。
- B32 原表 `2020-01-01 20:30` 修正為 **2021-01-01 20:30+08:00**；[MP 72596333](https://osu.ppy.sh/community/matches/72596333) 開房為 `2021-01-01T12:27:41Z`，即 UTC+8 的 20:27:41。
- 34 場排定時間涵蓋 **2020-11-21 19:00 至 2021-01-17 20:00（UTC+8）**。這是已記錄正式對局的範圍，不能代替整季或各階段的官方起訖時間。
- 每場新增 `timeZone: "Asia/Shanghai"`，`scheduledAt` 使用明確 `+08:00`；原始 Excel 日期與 serial 繼續保留在來源紀錄。

## 重現與保存邊界

- [公開來源快照](imports/s5-coach-date-sources.json)：必要的 profile 證據、查詢時間與 SHA-256、38 個房間的起訖／完整性／回應 SHA-256；四個教練房另存公開逐圖 UID 與分數。
- [完整修正清單](imports/s5-coach-date-review.json)：12 位教練、逐圖核對證據、34 場修正值及輸入 SHA-256。這是核對報告，`importable=false`，不可當成完整歸檔上傳。
- [離線工具](../scripts/prepare-s5-coach-dates.py)：不發出網路請求、不存取 DB、不自動上傳；以當時實際保存的歸檔產生本機匯入檔，遇到 UID、隊伍、來源、既有賽程或 MP 日期衝突即停止。原有選手、34 場比分與 approval、排名、圖池及其他欄位保留。

```sh
python3 scripts/prepare-s5-coach-dates.py --check
python3 -m unittest discover -s tests/scripts -p test_prepare_s5_coach_dates.py -v
python3 scripts/prepare-s5-coach-dates.py \
  --archive /private/tmp/CURRENT_S5_ADMIN_DOWNLOAD.json \
  --output /private/tmp/s5-coach-date-import.json
```

完整管理下載僅留本機，不加入 repository fixtures。早期 `s5-reviewed-import.json` 不包含後來的身分更正、比分核准及統計發布，不能拿它覆蓋正式站。

## 寫入與驗證狀態

本次開始時正式站為 revision 23、已公開。透過原生「關聯歷史身分」已保存 davidqu2 → 6090175，回讀為 revision 24。其餘 11 筆正式站身分更新被自動核准審查攔下，等待主辦者明確授權。日期匯入需要短暫取消 S5 公開，保存後立即恢復；這項操作也已提出確認。準備檔從實際 revision 24 產生，尚未上傳。

**後續公開回讀發現副作用：revision 24 的第一筆教練身分更新使公開統計變成 0／34。** 現有 `statisticsArchiveKey` 包含全部已解析身分（含教練）及 `scheduledAt`；`resolve-archive-identity` 沒有呼叫統計保全流程。因此這筆更新改變了 key，既有 published 快照未通過目前 key 比較而被排除；不是原始分數被刪除。新增其餘教練和賽程也會觸發相同條件。準備工具與報告已明示這個影響，不能把欄位保全比較當作公開統計仍有效的證明。

revision 23 的完整本機下載已保存；若將原歸檔逐欄恢復，原 key 會一致，可恢復既有統計的公開讀取。這需要原生歸檔重匯入及短暫取消／恢復公開，等待明確授權。後續正式套用 12 位教練／34 場日期時，還必須處理既有統計的重新驗證與發布，不能直接套用準備檔後宣稱完成。

已通過：7 項新增離線安全測試及 6 項既有 S5 來源保全測試（共 13 項）、生成物 `--check`、現有 `historicalArchiveSchema` 驗證（85 個已知身分、0 個未知位置、34 場日期）、實際保存資料的欄位保全比較、Prettier 與 `git diff --check`。本次只新增離線核對工具、公開來源與文件；未更動應用程式或讀取契約，未執行全應用測試、DB 測試及 E2E。

#610 的其他賽季名次、未打對局處置及官方整季／階段起訖時間仍需各自證據與驗收，issue 保持開啟。

## 主辦者授權後的執行與程式修正

主辦者隨後明確回覆「是的 授權你」，授權還原、教練／日期更新、必要的統計覆核發布及短暫取消／恢復公開。已透過既有管理 UI 還原原歸檔，revision 27 的整個 edition 與最初 revision 23 逐欄一致；公開回讀恢復 34／34 場、251 局、72 人、1,716 筆成績。接著從實際 revision 27 準備最終修正檔，保存全部 12 個教練 UID 和 34 場日期並恢復公開。

重新覆核 A21 時發現另一個既有程式問題：`canExcludeNonParticipantScore` 將同隊教練視為受保護的參賽選手，解析 buhei UID 後，其已核准排除的 3 分紀錄便無法再被 Admin 排除。該局只有三位實際上場的同隊正分選手，也不符合「四位正分隊友」的候補排除條件。不得改分、虛構第四位上場者或漏掉此局來湊比分。

本分支修正為：同隊教練的逐局大廳紀錄可由 Admin 明確審核為非參賽者；仍不自動排除任何分數，保留原始紀錄，同隊 player／captain 的保護與既有四人候補門檻不變。新增單元測試涵蓋 UID 解析前後的排除有效性、來源保全與實際選手保護；新增 PostgreSQL 整合測試涵蓋 Referee 拒絕、Admin 審核／發布、公開排除與來源 3 分保留。

程式驗證：相關單元測試 17 項通過；完整 DB-free 測試為 1,467 passed／670 skipped；專用 loopback 56610、`oclr_610_test` 的統計整合測試 20 項通過；`npm run check` 與 `npm run build` 通過。臨時測試 PostgreSQL 已停止。這份程式修正尚未部署，不能把本機驗證當成正式站已生效；A21 需待正式站套用修正後再完成覆核發布。

最終回讀為 **revision 30、published=true、85 個已知身分、12 位教練、0 個未知位置、34 場 UTC+8 賽程**，保存歸檔與準備檔完全一致。33 場統計已重新核准公開，各有 publishedAt、changes=false、stale=false；逐場選局與先前核准證據一致，共 246 局、72 人、1,678 筆成績，保留 209 筆真實零分，ACC／Combo 都是 1,678／1,678。未登入公開 API 的全部 UID／遊戲／原始分數逐筆與舊 MP 證據吻合；B28 與 GF 的公開技術提示、選局及 rating 均通過核對，正式／實戰比分差異保留。A21 的 5 局、38 筆成績（含 8 筆零分）待上述程式生效後補回。完整[執行與逐場證據](verification/issue-610-s5-coach-dates/result.json)保存本機下載 SHA-256，不提交管理下載本體。

主辦者已選擇「開 PR 並 merge，我來更新正式站」。[PR #652](https://github.com/OCLR-dev/OCLR-website/pull/652) 包含來源、離線工具及程式修正；整合最新 main `da53d1b0` 後重新生成讀契約（無漂移），相關單元 17 項與契約 8 項再驗證通過。正式站由主辦者更新，更新後再完成 A21；此處不宣稱已完成全部 34 場重新發布或 #610 整體驗收。

## 部署後完成 A21 與 S5 驗收

主辦者報告已完成所提供提交 `0c9208832d2613c0022d4fdf6320d61b295f99a7` 的部署。本會話重新載入正式站管理介面，觀察到 A21 的 buhei UID 1371514／game 373526359 現可作非參賽者覆核；按既有授權確認九筆排除、保留 game 373522355 的名單雙方歸屬覆核，再核准公開原有五個遊戲 ID。A21 最終 version 9，來源完整、warnings／blockers 為空；原始 3 分、整個 MP 的 UID／分數／原色／passed 逐筆保留。

最終 34 筆 summary 全部有 publishedAt，changes=false、stale=false；原生覆核共 34 場且無重複，251 個選局 ID 和 291 筆非參賽者排除均與原先核准證據一致。未登入公開 API 的 1,716 筆 fixture／game／UID／分數逐筆吻合舊 MP 證據；真實零分為 217 筆、準確率及連擊數各 1,716 筆。原生公開頁同時顯示 34／34、251 局、72 人；賽季首頁「成績」顯示 1716 並連到統計頁。部署後回讀 edition 仍為 revision 30、published=true，與先前完整驗證的 revision 30 逐欄一致，12 位教練及所有日期／比分／approval／名次／圖池均保留。

該合併提交的[實際普通 CI](https://github.com/OCLR-dev/OCLR-website/actions/runs/41280633333)已完成並 success。本輪只執行授權資料操作與補充證據，驗證 JSON／計數、原始來源保全、文件連結、格式與 `git diff --check`，沒有重跑無關的全應用、DB 或完整 E2E。部署由主辦者完成；本會話沒有讀取執行環境憑證、直接連線正式 DB、重新部署或新增權限。

這完成本輪 S5 教練 UID、UTC+8 對局日期與統計重新發布。#610 其餘賽季名次、未打對局處置及官方整季／階段起訖時間仍需各自證據與驗收，issue 保持開啟。
