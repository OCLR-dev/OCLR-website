# S5 教練 UID 與 UTC+8 賽程核對（#610）

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

已通過：7 項新增離線安全測試及 6 項既有 S5 來源保全測試（共 13 項）、生成物 `--check`、現有 `historicalArchiveSchema` 驗證（85 個已知身分、0 個未知位置、34 場日期）、實際保存資料的欄位保全比較、Prettier 與 `git diff --check`。本次只新增離線核對工具、公開來源與文件；未更動應用程式或讀取契約，未執行全應用測試、DB 測試及 E2E。

#610 的其他賽季名次、未打對局處置及官方整季／階段起訖時間仍需各自證據與驗收，issue 保持開啟。
