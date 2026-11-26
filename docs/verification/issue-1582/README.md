# #1582 相似譜面原型

原型用已發布的 S9 和 S10 圖池驗證 BID／MOD 查詢。命令輸出兩份 Top 10、原始特徵值、每張譜面差異最大的三項特徵，以及圖池來源。可依目標圖池找候選，也可輸出各輪次的技術特徵分布。以有 pgvector 的 PostgreSQL 執行一條純讀取查詢。資料準備與排名都不需要 OAuth 或模型服務。

[第二階段的選手技術分析與練習譜面報告](player-practice.md)提供同場比較、推薦與時間切分驗證。兩階段也可從[莉露聊天](../../development.md#similar-beatmaps-and-player-practice-in-liru)查詢。

## 執行查詢

先依[開發指南](../../development.md#local-development)準備 Node.js 24、npm 依賴與有 pgvector 的本機 PostgreSQL。設好 pgvector 資料庫的連線字串 `BEATMAP_SIMILARITY_DATABASE_URL`。以下命令預設每次重新讀取 S9 和 S10 公開圖池，並在查詢前確認賽季和圖池發布狀態。

```sh
npm run --silent beatmap:similarity -- query --bid 3786810 --mod NM
npm run --silent beatmap:similarity -- query --bid 4880506 --mod HD --profile skills
npm run --silent beatmap:similarity -- query --bid 2799044 --mod DT --profile skills \
  --pool s10:gf --min-stars 5.5 --max-stars 8
npm run --silent beatmap:similarity -- distribution --pool s10:gs1
```

- `--editions s9,s10` 指定至少兩個公開賽季作為資料來源。`--candidate-edition s9` 只限制候選，仍可搜尋已在其他來源賽季的種子譜面。`--pool s10:gf` 排除目標圖池已收錄的所有 BID。
- `base` 使用星數、BPM、總長度、AR、OD、CS、HP。`skills` 加上 aim 和 speed。兩種排序只用同一特徵組合完整、MOD 一致且符合篩選條件的候選。樣本少於十張時回傳可用張數。
- 以原型版本指定維度和權重，同一快照、MOD 與特徵組合用同一套標準化參數。每個維度先以完整譜面的平均和母體標準差做 z-score，再以權重平方根縮放。權重以 1 為預設，星數與 HP 為 0.5、長度為 0.75，aim 與 speed 為 1.5。星數／BPM 基準使用同一批譜面的這兩項 z-score，權重各為 1。兩者都用 pgvector 的精確 L2 距離，並以 BID 打破同分。每個 `contribution` 是該維度對完整向量平方距離的貢獻。
- 優先使用同 BID、同 MOD 的最新已存官方難度快照，再合併同一 checksum 的公開圖池來源。BPM、總長度、AR 和 OD 等沿用網站的 MOD 調整口徑；DT 使用 1.5 倍速。歷史表格若沒有相符的官方快照，保留為缺值。FM、TB 與 ACE 若無法從固定欄位確認完整 MOD，列為未解析。
- 每種排名對有 beatmapset ID 的候選以圖集去重，再取前十。歷史資料缺少圖集 ID 時會回報 `unknownSetCount`，並按 BID 去重。可提供經 checksum 核對的公開 `.osu` 檔補齊多數歷史圖集 ID。權重和缺值策略仍待選圖者評估。

## 固定資料重跑

`snapshot` 只擷取已發布圖池的譜面欄位、數值和來源版本，可用 `--snapshot FILE` 離線重跑 `query` 和 `distribution`。保留同一檔案才能重現當時的排序。查當前發布狀態時，直接查詢或重新擷取；離線檔保存的是取得當時的發布狀態。

```sh
capture_dir="$(mktemp -d)"
npm run --silent beatmap:similarity -- snapshot > "$capture_dir/initial.json"
mkdir "$capture_dir/osu"
node -e '
  const { slots } = require(process.argv[1]);
  for (const bid of new Set(slots.filter(s => s.checksum).map(s => s.bid))) console.log(bid)
' "$capture_dir/initial.json" | while IFS= read -r bid; do
  curl --fail --silent --show-error --max-time 15 --max-filesize 2000000 \
    "https://osu.ppy.sh/osu/$bid" -o "$capture_dir/osu/$bid.osu" || continue
done
npm run --silent beatmap:similarity -- snapshot --osu-dir "$capture_dir/osu" \
  > "$capture_dir/s9-s10.json"
npm run --silent beatmap:similarity -- query --snapshot "$capture_dir/s9-s10.json" \
  --bid 3786810 --mod NM --repeat 30
```

對 `--osu-dir` 中的公開 `.osu` 檔核對 osu! checksum、BID 和標準模式後，可取圖集 ID 與兩個代理指標。節奏間距變化率計算相鄰有效間距變化達 25% 的比例。持續密度取有效 30 秒視窗中圓圈和滑條起點的最大每秒數。兩者會出現在分布及原始數值中，排名仍使用文件列出的固定維度。這批官方快照的 reading 覆蓋為零。資料來源見 [osu! difficulty attributes](https://osu.ppy.sh/docs/#beatmapdifficultyattributes)、[OCLR 難度快照](../../mappools.md#public-difficulty-preview-851)和 [pgvector 距離與篩選](https://github.com/pgvector/pgvector#filtering)。

## 公開資料驗證

取樣時間為台北時間 2026-11-26 12:48。S9 revision 10 與 S10 revision 11 共九個圖池、173 個欄位。來源為 [S9 公開圖池配置](https://oclr.org/api/v1/tournaments/s9/configuration)和 [S10 公開圖池配置](https://oclr.org/api/v1/tournaments/s10/configuration)。特徵與來源 SHA-256 為 `e6e66e154f271b9f87e57c74e15e562377da113bd499270afcb3c22590e8c5ae`。

| 賽季 | NM base／欄位 | HD base／skills／欄位 | HR base／skills／欄位 | DT base／skills／欄位 | FM／TB 未解析 |
| ---- | ------------: | --------------------: | --------------------: | --------------------: | ------------: |
| S9   |        24／24 |            16／11／16 |            16／15／16 |            16／16／16 |             4 |
| S10  |        29／32 |            15／10／15 |             15／9／15 |            19／17／20 |            15 |

共 150 個欄位可用基礎特徵，其中 78 個有 aim 和 speed。S10 有四個固定 MOD 欄位缺少快照。150 個基礎欄位中有 149 個以公開 `.osu` 檔核對 checksum；一個 S9 DT 欄位的檔案版本不符，保留官方快照並停用其檔案特徵和圖集 ID。

| BID／MOD／特徵組合                       | 候選 | 向量第一名 | 星數／BPM 第一名 | Top 10 重疊 |      p50／p95 |
| ---------------------------------------- | ---: | ---------: | ---------------: | ----------: | ------------: |
| 3786810／NM／base                        |   51 |    3643054 |          3079723 |           5 | 0.57／1.22 ms |
| 4880506／HD／skills                      |   20 |    3182373 |          3963797 |           7 | 0.44／0.77 ms |
| 2799044／DT／skills，排除 S10 GF，5.5–8★ |   29 |    2145491 |            67895 |           5 | 0.45／0.97 ms |

使用隔離的 PostgreSQL 17／pgvector 0.8.7，每題執行 30 次。延遲包含本機資料庫往返與兩種排序，公開資料抓取和特徵準備在計時前完成。

以 S10 小組賽第一輪 NM1（3786810）為例，向量第一名是 S9 準決賽 NM1（3643054），主要差異為 HP −1、CS −0.2、OD +0.2。基準第一名（3079723）的長度為 120 秒，比種子短 134 秒，OD +0.5、AR +0.3。這是一個兩種方法排序不同且可由原始值解釋的案例。[種子圖池](https://oclr.org/tournaments/s10/mappools/gs1) · [向量結果圖池](https://oclr.org/tournaments/s9/mappools/sf) · [基準結果圖池](https://oclr.org/tournaments/s9/mappools/gf)

<details>
<summary>3786810／NM 的完整前十比較</summary>

| 名次 | 向量 BID | 星數／BPM BID |
| ---: | -------: | ------------: |
|    1 |  3643054 |       3079723 |
|    2 |  3736027 |       3643054 |
|    3 |  3774074 |       4278199 |
|    4 |  4587417 |       4530104 |
|    5 |  3970481 |       3230925 |
|    6 |  4146045 |       4392271 |
|    7 |  3355817 |       3355817 |
|    8 |  4392271 |       4915942 |
|    9 |  4719384 |       3736027 |
|   10 |  4278199 |       4914171 |

</details>

S10 小組賽第一輪 NM 欄位有六張。其中五張具有可用的數值。星數中位數 6.24★（四分位數 6.13–6.37），有效 BPM 180（165–185），總長度 130 秒（118–181）。這五張的節奏變化率中位數為 49.1%，持續密度中位數為每秒 6.43 個物件。[S10 小組賽第一輪](https://oclr.org/tournaments/s10/mappools/gs1)

選圖者盲評仍待安排。可將每題兩個排行榜合併、去除重複 BID、打散後交給選圖者，分別標記技術相似與欄位適用，再算各自的 Precision@10 和可用候選比例。DT 參考集的 CS 差異在標準化後權重較大，是盲評時值得核對的反例。現有數據僅證明排名出現可解釋的差異。

## 莉露單季與跨季驗證

2026-11-26 以匿名公開讀取驗證 S1 至 S11。這批資料共有 767 個公開圖池欄位，S1 至 S10 的已發布歷史統計共有 14,414 筆單圖成績。S11 的公開圖池可供查詢，當時沒有已發布的正式對局結果。[公開賽季清單](https://oclr.org/api/v1/tournaments) · [S11 公開競賽](https://oclr.org/api/v1/tournaments/s11/competition)

使用同批公開快照重跑，BID `3786810` 搭配 NM 在跨季範圍有 199 張可排序的候選，回傳前十張。UID `10260284` 有 150 筆可比較成績，涵蓋 115 張譜面、23 個場次。實際貢獻可比成績的賽季為 S2（3 筆）、S8（39 筆）、S9（62 筆）、S10（46 筆）。S11 的現行賽果接入另用隔離資料庫驗證已核准賽果和公開圖池的比對。

部分較早的已發布場次沒有可核對的圖池欄位。此類場次保留為資料缺口，同季其餘可核對場次仍可比較。

## S7 賽果與圖池查證

2026-11-26 查閱 S7 原始主表的公開 Mappools 範圍及 21 個公開 osu! 房間。已發布的 174 局、1,384 筆成績均能對到原始房間、局號和 BID。包括未發布局在內，218 局已完成且有分數的 osu!standard 對局，與網站現存 47 個圖池欄位沒有 BID 重疊。現有證據可核對實戰紀錄，圖池欄位對照尚缺。莉露會分季列出因缺少對照而排除的個人成績筆數，並附上賽果及圖池來源。[S7 A1 原始對局](https://osu.ppy.sh/community/matches/95753733) · [S7 公開圖池](https://oclr.org/tournaments/s7/mappools) · [S7 公開賽果](https://oclr.org/api/v1/tournaments/s7/statistics) · [逐場查證資料](s7-match-pool-audit.json)

用同批公開資料重跑技術分析，1,115 筆成績無法對到已查證的圖池欄位，另有 269 筆依既有規則排除於技術判決場次，兩者均未計入可比較樣本。
