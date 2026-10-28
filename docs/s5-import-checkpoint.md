# S5 私人匯入檢查點

2026-10-25，對應 [#288](https://github.com/OCLR-dev/OCLR-website/issues/288)。

來源分析見 [S5 整理文件](s5-archive.md)。主辦者授權「開始整理並匯入」；名單以 MainSheet 為準。

## 可重現匯入包

- `python3 scripts/prepare-s5-archive.py` 由已擷取的競賽來源生成 [匯入包](imports/s5-archive.json)。不讀取帳號憑證，不連線或寫入資料庫。
- 12 隊，70 個已匹配 UID 的名單位置、15 個未知 UID 位置，合計 73 選手及 12 教練。保留 12 個 VICE 與最終 Tier，不虛構選秀時序。
- 34 場對局及 29 個影片網址。比分、原始日期／時間存於管理來源附錄；正式 score 與 scheduledAt 為 null。MainSheet 的左右欄不等於已確認 MP 紅藍隊，故不填入要求紅藍隊身分的 match review。
- 四組比賽圖池共 70 slots；另有教練資格賽圖池 7 slots，合計五組／77 slots。資格賽 21 人、147 筆分數。
- 16 個 staff 職務紀錄、65 項管理來源附錄，包含獨立選秀截圖快照、70 項圖池統計、MP 分類、資格賽重算與來源衝突。前24場加總屬 reviewTable，不是正式名次。
- 尚未取得規則原文、S5 時區與異常日期確認、未知 UID／別名確認、正式最終名次或晉級連線；未套用 S6 的規則與時區。

## 操作狀態

已透過瀏覽器完成 [s5 私人歸檔匯入](https://oclr.org/admin/tournaments/s5/archive)，保存 revision 2，status=completed、published=false、applications=0。主辦者已明確同意設為「已完成」並繼續私人匯入。

「已完成」狀態是歷史匯入的必要前提（`src/components/archive-importer.tsx`）。設定確認會停止報名。先前自動審核要求補充明確授權；主辦者已確認，隨後正常完成設定及私人匯入。簡介、賽季標識 5 與完成狀態均已保存。

操作時網址欄位曾意外附加文字，產生 `oclr-s5s5` 空白草稿。已改名為「誤建空白草稿（未使用）」，不含匯入資料且未公開。沒有刪除它，也未以其網址取代正確的 s5 草稿。

## 驗證

- 匯入包通過實際 `historicalArchiveSchema`（含參照、唯一性、Tier 與 source-only 限制）。
- 腳本斷言 70 已知／15 未知名單、34 無正式比分對局、77 圖池 slots。
- 未跑完整應用或資料庫測試：本次只有離線資料轉換與匯入檔，未變更應用程式。
- 重新載入管理頁確認 12 隊／85 位選手與教練／34 未確認對局／5 圖池／77 譜面。
- 透過瀏覽器讀取已保存 JSON，逐欄深度比較整個 archive 與本機匯入包完全一致（僅忽略物件鍵順序）。
- 私人預覽確認 B 隊 Tier 1 Muziyami、C 隊 Tier 1 TaneshimaPopura 與未知 UID 隊長 Azureus；管理附錄可見，概覽預覽沒有來源檢查附錄。
- 34 場比分仍在管理來源附錄，正式結果為 0，沒有核准或公開。規則、時區、日期修正、最終名次等缺項仍保留待核實。

## MP 紅藍隊核對、核准與公開

主辦者後續授權直接依 MainSheet 比分核准，並要求紅藍隊由原始 MP 取得，再核准及公開。

- 34 場原始 MP 皆完成 ascending event pagination／起迄界限核對，共 332 局。公開來源快照為 [s5-match-source-snapshot.json](imports/s5-match-source-snapshot.json)，不含帳號憑證、聊天或非競賽 profile 欄位。
- [紅藍隊證據](imports/s5-match-side-evidence.json) 按比賽圖池內已完成遊戲的已知 UID 核對；每場每色均只對應一支來源隊伍。A6、A8、A16、A26 的紅藍順序與 MainSheet 左右欄相反，沒有依標題順序猜測。
- `python3 scripts/prepare-s5-reviewed-import.py` 生成 [待核准匯入包](imports/s5-reviewed-import.json)。workingScore 使用 MainSheet teamA／teamB 順序；rawScore 留空，沒有假稱已重新裁定所有 MP 遊戲。332 局完整來源另存，不塞入要求重打／娛樂分類的 review.games。
- 以 computer use 上傳、驗證、保存待覆核包，再點選原生「核准已覆核對局」及確認；重新載入顯示已記錄賽果34、未確認記錄0。
- 以 computer use 於公開設定確認公開。最終回讀 revision 5、published=true、34個 review.status=approved；全部比分與MainSheet一致，全部紅藍隊與核對包一致。
- [S5公開頁](https://oclr.org/tournaments/s5) 實際顯示12隊、85位選手與教練、34賽果、5圖池／77譜面。來源附錄不出現在公開概覽。
- 此節取代上方私人匯入階段的「尚未核准／公開」狀態；規則、原表時區及日期修正、未知UID、最終名次與晉級連線仍未補造。誤建空白草稿仍未使用。
- 實際 historicalArchiveSchema 驗證通過，完整來源界限、紅藍唯一對應、MainSheet比分與站上逐筆比對均通過。沒有變更應用程式或部署。

## S5 主視覺接入（待部署）

主辦者提供1920×1080原始PNG，已原樣保存於 `public/archive/s5/key-visual.png`，SHA-256與附件一致。沿用S6/S7固定素材機制，加入S5來源圖映射、後台主視覺／標誌選單與橫向縮圖識別；正式站已保存的S5來源可在部署後自動取得主視覺及列表圖片。沒有重新繪圖、裁切或修改賽果。

驗證：相關2個單元測試檔21 tests通過；npm run check（lint/typecheck）通過；npm audit --omit=dev為0 vulnerabilities；生成51份讀取契約並更新對應素材白名單。全量npm test出現update-script.test.ts的9項失敗，未完成全套；build長時間停留optimized build階段，本次中止，未宣稱成功。未跑需要隔離環境的desktop/mobile E2E。這些限制需CI／後續完整驗證解決，未聲稱正式部署或站上已顯示圖片。

## 2026-10-25 — S5 原文規則補件（後台已保存，公開讀取待部署）

- 主辦者提供的 [OCLR β 规则表](https://docs.qq.com/doc/DRU92Zm1JbGFFSEdq)
  已透過瀏覽器讀取全文，按原有順序保存為「重点规则:」「BP流程」「时限」三段，
  保留子標題、星號項目、用字及原文第 7–9 點同段的編號。未將 S6 的規則補入。
- 透過 computer use 在 `/admin/tournaments/s5/settings?section=rules`
  保存新版本「OCLR β 规则表（原文分段）」，重新載入後三段標題及內容逐欄完全一致。
  [原文擷取](imports/s5-rulebook.txt)與[已保存段落快照](imports/s5-rulebook.json)
  的非空白行比對完全一致。
- 原文確認 Score v2；小組賽 11/21–12/13、4 輪、12 進 8、BO9 1Ban；
  淘汰賽 12/19–12/27、前四勝者組／後四敗者組、BO11 2Ban；
  決賽 1/1–1/3、BO13 2Ban。保留原文「赛制：小组赛」字樣，不推寫未載明的同分規則。
- 公開歷史頁的原生規則讀取先前僅支援 S6，實際檢查 S5 仍顯示「未记录」。
  本次補上 S5 MainSheet＋QQ 規則 URL 的精確來源配對，沿用目前保存的原生規則版本；
  離線快照不作為自動覆寫資料。需部署這項讀取修正後公開頁才會顯示。
  本次只保存規則設定，沒有重新匯入歸檔、取消公開或更動已核准比分／名次。
- 驗證：`npm ci`、`npm run check`、`npm run build`、`npm audit --omit=dev`
  （0 漏洞）與 `git diff --check` 通過。正常本機權限下完整測試得到
  655 passed／1 failed／382 skipped；唯一失敗為前次 S5 主視覺未同步的
  OpenAPI 文件，已重新生成並針對讀取 API／規則／歸檔／規則導覽重跑，
  4 個檔案 34 tests 全通過。修正後未再次執行完整套件；未配置隔離
  `TEST_DATABASE_URL`，未跑資料庫整合及桌面／手機 E2E。
  沙箱內初次完整測試／建置停滯後已中止，以上完整結果來自正常本機權限重試。

## 2026-10-29 — 缺失譜面資料補件（僅匯入包，站上待重新匯入）

- 提交 `b94dd7c` 手動補了 `s5-archive.json` 三張圖，但生成腳本仍會把它們還原。
  本次把補充寫回 `scripts/prepare-s5-archive.py`（`ORIGINAL_BEATMAP_IDS`、
  `SUPPLEMENTAL_MAP_ATTRIBUTES`），重跑後逐欄重現該提交的資料。
- 明細：[DT2 2567502](https://osu.ppy.sh/beatmaps/2567502) 加 `originalId` 2933979
  （本身頁面仍可用，不補值）；DT4 2720295 加 `originalId` 2678913，補 mapper Gaia、
  stars 6.27、bpm 210、drain 111（167s ÷ 1.5 取整）、cs 4、ar 8.5、od 8；Final NM4 2756449 加
  `originalId` 2755377，補 cs 4、ar 9.4、od 8。
- 補上的數值是**該 edit 的上傳值，不是本次重新裁定或量測的比賽實測值**；已寫入匯入包
  `notes` 與 [圖池中繼資料說明](archive-map-metadata.md)。主辦者確認 2026-10-29：
  DT4 2720295 是原始圖 2678913 的 1.5× 版本，該版本把 AR 由 9 改為 8.5、OD 由
  8.5 改為 8，因此 stars 6.27、bpm 210；NM4 2756449 的 cs／ar／od 與原始圖
  2755377 相同（4／9.4／8）。兩者都是該 edit 的上傳值，不是原始圖頁面基礎值
  （2678913 為 4.46★／140 BPM／AR 9／OD 8.5），也不是本次重新量測。未變更
  `src/data/archive-beatmaps.json`：快照仍記錄那兩個 BID 的頁面為 404。
- 重跑 `python3 scripts/prepare-s5-archive.py` 與
  `python3 scripts/prepare-s5-reviewed-import.py`（需 Python ≥3.10，腳本使用
  `zip(strict=True)`）：兩份包的 pools 重新一致，`s5-match-side-evidence.json`
  無變動。
- 公開站目前是 revision 5，由舊的待核准包匯入，尚不含這些值；需重新匯入
  `s5-reviewed-import.json`（或於後台逐欄修改）才會顯示。本次未連線資料庫、
  未重新匯入、未部署。
- 驗證：`archive-map-metadata` 與 `historical-rulebooks` 單元測試 23 項通過；
  生成腳本重跑與提交內容逐欄一致（僅新增第 4 條 notes）。
