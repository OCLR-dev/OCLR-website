# OCLR β（S5）來源整理（#288）

本次依主辦者提供的 MainSheet 與選秀截圖整理，β 對應 S5。這是來源彙總，
尚未匯入、核准或公開正式站資料。表格中的操作提示不作為本次工作指令。

## 來源與範圍

- 主辦者附件：`OCLR β MainSheet.xlsx`，2026-10-25 收到；原檔保留不改寫。
- [原表連結](https://docs.google.com/spreadsheets/d/100CrQhmcX3lQ_7yn4xcP3cC316A7t35wK6kGfSW2tyM/edit)：由 [#288](https://github.com/OCLR-dev/OCLR-website/issues/288) 留言提供。本次分析以附件快照為準，未宣稱與線上最新內容完全相同。
- [選秀截圖](verification/issue-288/s5-draft-source.png)及[逐列轉錄](imports/s5-draft-screenshot.json)。Group1–12 是截圖隊伍標籤，不代表比賽分組或全局選秀先後順序。
- [結構化來源彙總](imports/s5-source-records.json)及[原始 MP 清單](imports/s5-match-links.json)。JSON 是分析資料，不是可直接上傳的歷史歸檔包。
- [重建腳本](../scripts/prepare-s5-source.py)只讀白名單競賽欄位，保留儲存格出處；不執行 Excel 公式，不保存申請自介、聯絡資料、討論、評語或廢棄名單。

## 整體盤點

| 項目 | 整理結果 |
| --- | --- |
| MainSheet | 20 個分頁；部分 declared dimension 小於實際資料範圍，按實際 cell 讀取 |
| 隊伍 | 12 隊，A–L；原表全形 `Ｋ` 正規化為 K，原字保留 |
| 選秀截圖 | 73 位：12 Captain、12 VICE、各12位 Tier 1–4、1位 Tier 5 |
| 隊伍表 | 85 個位置：73 位選手＋12 位教練；名單與截圖有差異，依主辦者指定採MainSheet，截圖另存 |
| UID | 截圖73位皆有表內直接姓名／UID對照；隊伍表70個位置可直接對照，3個隊長名稱及12位教練仍缺直接對照 |
| 對局 | 34 場皆有雙方、比分、原定日期時間、MP ID；29筆可辨識影片連結 |
| 前24場 | 每隊4場；僅彙總勝敗與局數，不以未知同分規則補出正式種子 |
| 後10場 | 表內含 WF、LF、GF；保留原標籤與比分，未生成晉級連線或最終名次 |
| 圖池 | 4組、70個slot、67張不同譜面；含EX標記 |
| 教練資格賽 | 21位、7張圖、147筆分數；逐圖名次總和與總排名重算均吻合 |
| Staff credits | Cover內16個署名／職務項，11個不同文字身分；不自動建立帳號或授權 |

對局日期主要涵蓋 2020-11-21 至 2021-01-17。`对阵表!F33` 原值為
2020-01-01，與本季及 issue 的 2021年1月 MP 標籤不一致。2021-01-01
僅列為候選更正；原日期及 Excel serial 43831 保留。時區未在附件確認，
不沿用其他 Season 的 UTC+8 確認、不產生虛構 UTC 時間。

## 隊伍與名單

以下是 MainSheet `队伍表` 的保存名單。截圖只列選手、不列教練；截圖的
Captain／VICE／Tier／Elo另存於來源 JSON，沒有把 Tier 當作全局選秀順位。

| 隊 | 隊名 | Captain | VICE | 教練 | T1 | T2 | T3 | T4 | T5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 男同竟在我身边?! | -xxx Rumia- | dhui | davidqu2 | BurNing | Reecho | Dana Iclucia | Niwasaka_Rira | — |
| B | 白果子不讲武德 | Curriescaz | akziyou | im_a_burger_fox | Muziyami | [-buki-] | Aurora_fang | huoyaoyuan | — |
| C | Team K | Azureus | WhiteCookies | Old k | TaneshimaPopura | M P I | zhuangsi | None1637 | — |
| D | SpinEsc | 1miss_Cozmo | Guozi on Osu | buhei | Hunxin | Qlinging | Yuuki Yuuna | [K I D] | — |
| E | 小心管人痴 | Soymana | MasterKotori | TiRa | hotrock_ | Moutreak | Mars New | LittleStone | — |
| F | 佐藤先生是湊阿库娅 | Slay_conceit | Clivery_V | [Kaffu Chile] | Rairakkuhana | alansword | [RyuZu] | SqcOc- | — |
| G | 怎么还要想队名的 | CUWAN | An Yanyan | milk-tea | Molli | - Rainbow - | Myoi Mina | Hoshizora Rin | — |
| H | 队名怎么还要想的 | zmyk | [Illustrious] | Crystal | X bol | Shijie | Kazumi Pager | lianlian514 | — |
| I | 想要睡觉 | feifeiis | VinyeKk_Ame | NekoKamui | Texas | qi_e | Pata-Mon | Katamari | — |
| J | No Name | My_Suck_Aim | No rank | Kishin Sagume | Takagi San | Banana skin | foraphe | AnthV | — |
| K | Team C | moe_nyannyan | KobeNanami | Manasoy | acvyou | [ Kuon ] | SakurajimaMai | Shiina Mafuyu | — |
| L | 绝赞咕咕做的队 | DarckLH | hvick226 | demisemiquaver | [1552828] | Mikako | Duraaa | - Ssooy - | spead_come |

### 截圖與隊伍表差異

| 隊 | 位置 | 截圖 | MainSheet | 儲存格 |
| --- | --- | --- | --- | --- |
| B | Tier 1 | TaneshimaPopura | Muziyami | 队伍表!F7 |
| C | Captain | Crystal 1 | Azureus | 队伍表!C11 |
| C | Tier 1 | Muziyami | TaneshimaPopura | 队伍表!F11 |
| J | Captain | My Suck Aim | My_Suck_Aim | 队伍表!C39 |
| K | Captain | moe nyannyan | moe_nyannyan | 队伍表!C43 |

**主辦者已於2026-10-25指定以MainSheet為準。** B隊T1採Muziyami、C隊T1採
TaneshimaPopura，C隊Captain採Azureus；J／K隊長也保留表內拼寫。截圖作歷史快照
另存，不覆蓋表內名單。這項選擇不等於確認交換發生時間或改名關係。
Crystal 1 與 Azureus 的改名關係，以及 My Suck Aim／My_Suck_Aim、
moe nyannyan／moe_nyannyan 的空格／底線別名關係都先保留待確認。
姓名大小寫與兩端空格可作直接比對；不依相似拼字、自介或其他季資料合併 UID。

`[1552828]` 是原始名稱，`测试表!C41:D41` 的 UID 為 **8208288**。
Crystal 1 的直接來源是 UID11237954；不可因教練名單有 Crystal 而合併身分。
12 位教練暫保留文字名，不藉個人介紹推測 UID。

### 截圖 Elo

平均值是依截圖個人 Elo 重算的檢查值，原顯示值另行保存；不以當前 Elo 覆寫歷史資料。

| 截圖隊伍 | 顯示 AvgElo | 重算平均 | 人數 |
| --- | --- | --- | --- |
| 1 | 947 | 947.0 | 6 |
| 2 | 1021 | 1020.833333 | 6 |
| 3 | 991 | 990.833333 | 6 |
| 4 | 1017 | 1016.5 | 6 |
| 5 | 946 | 946.166667 | 6 |
| 6 | 999 | 999.0 | 6 |
| 7 | 987 | 987.0 | 6 |
| 8 | 868 | 867.5 | 6 |
| 9 | 994 | 993.5 | 6 |
| 10 | 942 | 942.0 | 6 |
| 11 | 1012 | 1011.5 | 6 |
| 12 | 790 | 789.714286 | 7 |

## 對局總表

以下均為表內比分轉錄，未讀取逐局 MP 來裁定重打、娛樂盤或技術判分。0比分不自動解釋為棄權。時間為原表牆上時間，時區待確認。

| 場次 | 對局 | 比分 | 原表日期 | 時間 | MP | 來源列 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | A–L | 5:1 | 2020-11-21 | 20:00 | [70214161](https://osu.ppy.sh/community/matches/70214161) | 对阵表!A2:L2 |
| A2 | B–K | 5:2 | 2020-11-21 | 21:15 | [70217154](https://osu.ppy.sh/community/matches/70217154) | 对阵表!A3:L3 |
| A3 | C–J | 3:5 | 2020-11-21 | 21:30 | [70219167](https://osu.ppy.sh/community/matches/70219167) | 对阵表!A4:L4 |
| A4 | D–I | 5:1 | 2020-11-21 | 19:00 | [70211567](https://osu.ppy.sh/community/matches/70211567) | 对阵表!A5:L5 |
| A5 | E–H | 2:5 | 2020-11-21 | 21:00 | [70216682](https://osu.ppy.sh/community/matches/70216682) | 对阵表!A6:L6 |
| A6 | F–G | 0:5 | 2020-11-22 | 21:30 | [70279705](https://osu.ppy.sh/community/matches/70279705) | 对阵表!A7:L7 |
| A7 | F–I | 0:5 | 2020-11-28 | 19:30 | [70607908](https://osu.ppy.sh/community/matches/70607908) | 对阵表!A8:L8 |
| A8 | E–K | 5:1 | 2020-11-28 | 19:00 | [70607142](https://osu.ppy.sh/community/matches/70607142) | 对阵表!A9:L9 |
| A9 | C–L | 5:1 | 2020-11-28 | 21:00 | [70611688](https://osu.ppy.sh/community/matches/70611688) | 对阵表!A10:L10 |
| A10 | D–G | 1:5 | 2020-11-28 | 20:30 | [70610187](https://osu.ppy.sh/community/matches/70610187) | 对阵表!A11:L11 |
| A11 | B–H | 5:3 | 2020-11-29 | 21:15 | [70673286](https://osu.ppy.sh/community/matches/70673286) | 对阵表!A12:L12 |
| A12 | A–J | 0:5 | 2020-11-29 | 21:00 | [70672935](https://osu.ppy.sh/community/matches/70672935) | 对阵表!A13:L13 |
| A13 | A–I | 5:2 | 2020-12-05 | 19:30 | [71008526](https://osu.ppy.sh/community/matches/71008526) | 对阵表!A14:L14 |
| A14 | D–C | 4:5 | 2020-12-05 | 21:00 | [71012162](https://osu.ppy.sh/community/matches/71012162) | 对阵表!A15:L15 |
| A15 | F–E | 1:5 | 2020-12-05 | 21:00 | [71012247](https://osu.ppy.sh/community/matches/71012247) | 对阵表!A16:L16 |
| A16 | G–H | 2:5 | 2020-12-06 | 22:00 | [71083712](https://osu.ppy.sh/community/matches/71083712) | 对阵表!A17:L17 |
| A17 | K–L | 5:0 | 2020-12-06 | 21:00 | [71079961](https://osu.ppy.sh/community/matches/71079961) | 对阵表!A18:L18 |
| A18 | B–J | 5:3 | 2020-12-05 | 21:00 | [71012199](https://osu.ppy.sh/community/matches/71012199) | 对阵表!A19:L19 |
| A19 | H–C | 4:5 | 2020-12-13 | 21:00 | [71484949](https://osu.ppy.sh/community/matches/71484949) | 对阵表!A20:L20 |
| A20 | J–G | 2:5 | 2020-12-13 | 14:00 | [71472736](https://osu.ppy.sh/community/matches/71472736) | 对阵表!A21:L21 |
| A21 | D–E | 0:5 | 2020-12-12 | 21:00 | [71422298](https://osu.ppy.sh/community/matches/71422298) | 对阵表!A22:L22 |
| A22 | B–A | 5:1 | 2020-12-12 | 20:30 | [71421418](https://osu.ppy.sh/community/matches/71421418) | 对阵表!A23:L23 |
| A23 | I–K | 5:4 | 2020-12-12 | 19:30 | [71419226](https://osu.ppy.sh/community/matches/71419226) | 对阵表!A24:L24 |
| A24 | L–F | 5:2 | 2020-12-12 | 21:00 | [71422840](https://osu.ppy.sh/community/matches/71422840) | 对阵表!A25:L25 |
| A25 | B–E | 6:0 | 2020-12-20 | 14:30 | [71900819](https://osu.ppy.sh/community/matches/71900819) | 对阵表!A26:L26 |
| A26 | G–C | 6:4 | 2020-12-19 | 22:00 | [71851009](https://osu.ppy.sh/community/matches/71851009) | 对阵表!A27:L27 |
| B27 | J–I | 3:6 | 2020-12-20 | 20:00 | [71910710](https://osu.ppy.sh/community/matches/71910710) | 对阵表!A28:L28 |
| B28 | A–H | 6:2 | 2020-12-20 | 14:00 | [71900068](https://osu.ppy.sh/community/matches/71900068) | 对阵表!A29:L29 |
| WF | B–G | 2:7 | 2020-12-25 | 22:00 | [72198819](https://osu.ppy.sh/community/matches/72198819) | 对阵表!A30:L30 |
| B30 | C–I | 1:6 | 2020-12-27 | 21:00 | [72307852](https://osu.ppy.sh/community/matches/72307852) | 对阵表!A31:L31 |
| B31 | E–A | 6:4 | 2020-12-27 | 19:00 | [72304259](https://osu.ppy.sh/community/matches/72304259) | 对阵表!A32:L32 |
| B32 | I–E | 6:2 | 2020-01-01（年份異常） | 20:30 | [72596333](https://osu.ppy.sh/community/matches/72596333) | 对阵表!A33:L33 |
| LF | B–I | 6:7 | 2021-01-03 | 20:30 | [72703300](https://osu.ppy.sh/community/matches/72703300) | 对阵表!A34:L34 |
| GF | G–I | 7:4 | 2021-01-17 | 20:00 | [73600572](https://osu.ppy.sh/community/matches/73600572) | 对阵表!A35:L35 |

### 前24場統計

按勝場降序、同勝場按隊字母列示；**不是正式排名或種子順序**。來源为 `对阵表!A2:L25`。

| 隊 | 勝 | 敗 | 得局 | 失局 | 淨局 |
| --- | --- | --- | --- | --- | --- |
| B | 4 | 0 | 20 | 9 | 11 |
| C | 3 | 1 | 18 | 14 | 4 |
| E | 3 | 1 | 17 | 7 | 10 |
| G | 3 | 1 | 17 | 8 | 9 |
| A | 2 | 2 | 11 | 13 | -2 |
| H | 2 | 2 | 17 | 14 | 3 |
| I | 2 | 2 | 13 | 14 | -1 |
| J | 2 | 2 | 15 | 13 | 2 |
| D | 1 | 3 | 10 | 16 | -6 |
| K | 1 | 3 | 12 | 15 | -3 |
| L | 1 | 3 | 7 | 17 | -10 |
| F | 0 | 4 | 3 | 20 | -17 |

### MP 清單對照

Issue 提供47個不同MP，32個與表格匹配。附件另外補足：

- F–I，0:5，2020-11-28：[70607908](https://osu.ppy.sh/community/matches/70607908)，`对阵表!A8:L8`。
- B–E，6:0，2020-12-20：[71900819](https://osu.ppy.sh/community/matches/71900819)，`对阵表!A26:L26`。

Issue另有4場Showcase、4場教練資格／展示性房間、1場明確標示模擬賽，均不併入正式賽果。
其餘6場保留待查，包括額外B–E的70393378、3場Explosive相關房間及2場Team A–Team B。
只按房名作初步分類，不宣稱已查閱或排除各MP的實際逐局內容。來源聯集共49個MP。

`GF` 記載 G 7:4 I；沒有另外的最終名次表或已核對的完整規則，不直接生成正式冠軍／名次。

## 圖池與統計

保留完整slot／曲名／難度／可用metadata／EX標記／來源出處。第二輪圖池可由
`二轮赛图数据` 曲名超連結恢復16張譜面，不因缺少專用圖池分頁而丟棄。

| 來源分頁 | slot數 | ID來源 |
| --- | --- | --- |
| 第一轮赛图 | 16 | H欄BID＋曲名連結 |
| 二轮赛图数据 | 16 | D欄曲名超連結 |
| 季后赛R1图池 | 19 | J欄BID＋D欄曲名連結 |
| Final 图池 | 19 | J欄BID＋D欄曲名連結 |

- 多張表的無標題C欄沿用相同16個數字，與對應曲名不一致，**不採作BID**。
- `季后赛R1图池!J16` BID為2744118，D16曲名連結亦指向2744118；I16的tmp連結卻是2428725。採前兩者為本次整理值，仍保留tmp差異。
- Final的NM6／HD4／HR4與季後賽R1相同（2240700／2278245／556151）。保留為來源中的重複slot，不擅自認定是模板殘留或刪除。
- 四份圖池統計共70行，保存Times／Avg／Top Player／Top Score。它們是來源彙總，未用MP逐局重算，不與官方全季選手Rating混為一談。

## 教練資格賽

`教练赛积分!D3:T23` 共21位、7張圖。按各圖分數降序競賽排名（同分同名次），
再將7圖名次相加、以總和升序排名，與表內21組快取總和／總名次完全一致。
這是獨立重算，沒有將其他分頁的快取0視為有效身份或資料。

| 名次 | 教練 | 名次總和 |
| --- | --- | --- |
| 1 | Crystal | 16 |
| 2 | im_a_burger_fox | 21 |
| 3 | NekoKamui | 29 |
| 4 | davidqu2 | 31 |
| 5 | milk-tea | 32 |
| 6 | Manasoy | 46 |
| 7 | [Kaffu Chile] | 55 |
| 8 | TiRa | 61 |
| 9 | Old K | 67 |
| 10 | buhei | 76 |
| 11 | demisemiquaver | 78 |
| 12 | Kishin Sagume | 92 |
| 13 | B C | 95 |
| 14 | Neina | 101 |
| 15 | silly me | 106 |
| 16 | Miracle | 107 |
| 17 | gxytcgxytc | 114 |
| 17 | PurePeace | 114 |
| 19 | Harubi Lira | 121 |
| 20 | Segawa Emi | 126 |
| 21 | Sayori_yui | 129 |

## 工作人員與規則

| 原始職務 | 署名 | 出處 |
| --- | --- | --- |
| Host | Explosive | Cover!G7 |
| Host | Prophet | Cover!G8 |
| Host | Sonoaoi | Cover!G9 |
| LOGO Inspired | Selis | Cover!G11 |
| Mappool | Prophet | Cover!H7 |
| Mappool | Sonoaoi | Cover!H8 |
| Mappool | Fushimi Rio | Cover!H9 |
| Mappool | FujiwaraNoMouko | Cover!H10 |
| Mappool | B C | Cover!H11 |
| Refer | FujiwaraNoMouko | Cover!I7 |
| Refer | Europix | Cover!I8 |
| Refer | osu happy | Cover!I10 |
| Refer | demisemiquaver | Cover!I11 |
| Streamer | Alice Mana | Cover!J7 |
| Streamer | Sonoaoi | Cover!J8 |
| Streamer | Selis | Cover!J9 |

對陣表的裁判／直播／解說原文另外逐場保存，`none`、`无人直播`、`没录`等
保持原始含義；多人解說的空格／頓號不強行拆成未核對的身分。
Cover!I9是純數字項，不能確認是公開名稱還是聯絡方式，暫不輸出其值或當成UID。

[S5規則連結](https://docs.qq.com/doc/DRU92Zm1JbGFFSEdq)來自Cover!I21。
本次嘗試讀取未成功，故只保存連結，尚無規則原文轉錄；不套用S6規則。
原檔中的廢棄表、申請私人欄位、遊戲頁及模擬賽排程不進入賽事資料彙總。

## 待確認與後續

1. 名單已按主辦者指示採MainSheet；選秀後交換的歷史與Crystal 1／Azureus同人關係仍未確認，但不阻擋名單轉錄。
2. J／K隊長空格與底線名稱的別名關係；12位教練及Staff UID可靠來源。
3. 本季時區；F33是否應改為2021-01-01。
4. S5完整規則原文、晉級／同分／總決賽規則，及是否有另存正式排名。
5. 未匹配MP的用途與逐局核對，以及三張跨池重複圖是否為實際保留。

本次整理不生成雙敗bracket連線。跨Season繪線問題另由#324跟蹤。
需要正式導入時，再按已確認來源產生相容匯入包，經管理介面覆核與授權發布。

## 重現與核對

```sh
python3 scripts/prepare-s5-source.py '/path/to/OCLR β MainSheet.xlsx'
```

本次已核對隊伍／人數／角色、唯一MP、每隊前段4場、所有70個slot的BID來源、
圖池統計行數與21組資格賽重算；不聲稱已取得MP逐局、正式導入或完成線上驗收。
腳本不讀取本機環境憑據、不連網、不寫資料庫。原表SHA256記錄在來源JSON。


## 全量逐局統計核對（#610）

以現有已保存來源完成的 34 場／332 局／70 圖池 slots 核對，見
[S5 全量統計核對](s5-statistics-audit.md)。該核對保留已核准比分、
逐人原始分數及來源衝突，與正式站統計的匯入／核准／發布分開記錄。
