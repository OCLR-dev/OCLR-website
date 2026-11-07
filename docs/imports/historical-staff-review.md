# S1–S10 歷史工作人員核對（#1005）

2026-11-08（Asia/Taipei）核對 OCLR 公開 Staff、賽程與對局頁，以及已保存的 MainSheet 匯入包。以 Staff／封面署名及已記錄對局的裁判、直播、解說欄為職務依據。同一 UID 在同一屆可有多項職務。執勤記錄依屆次由早到晚列出合併後的職務。

| 屆次                                             | 已核對的公開對局 | 有可辨識職務的對局 | 職務署名數 | 已連結 UID 的職務署名數 |
| ------------------------------------------------ | ---------------: | -----------------: | ---------: | ----------------------: |
| [S1](https://oclr.org/tournaments/s1/schedule)   |               40 |                 40 |         40 |                      40 |
| [S2](https://oclr.org/tournaments/s2/schedule)   |               30 |                 20 |         22 |                      22 |
| [S3](https://oclr.org/tournaments/s3/schedule)   |               30 |                 27 |         20 |                      20 |
| [S4](https://oclr.org/tournaments/s4/schedule)   |               34 |                 33 |         22 |                      22 |
| [S5](https://oclr.org/tournaments/s5/schedule)   |               34 |                 34 |         45 |                      45 |
| [S6](https://oclr.org/tournaments/s6/schedule)   |               34 |                  0 |          5 |                       5 |
| [S7](https://oclr.org/tournaments/s7/schedule)   |               22 |                 22 |         25 |                      25 |
| [S8](https://oclr.org/tournaments/s8/schedule)   |               38 |                 38 |         33 |                      33 |
| [S9](https://oclr.org/tournaments/s9/schedule)   |               22 |                 22 |         30 |                      30 |
| [S10](https://oclr.org/tournaments/s10/schedule) |               30 |                 30 |         35 |                      35 |
| 合計                                             |              314 |                266 |        277 |                     277 |

計數以各屆工作人員頁的職務分組為準。一個人擔任兩個職務計兩筆。S1–S3 的名單以公開頁為準。S4–S10 的原始 Staff 名單來自對應匯入包，逐場署名取自公開對局。S6 的五筆署名來自原表封面，公開對局沒有逐場工作人員署名。 [S6 原始來源紀錄](s6-source-records.json)

## osu! username 反查

以原始署名查詢公開 osu! 個人頁，讀取轉址後的數字 UID、現名、曾用名與帳號建立日期。對照當年已保存的 UID、同屆或相鄰屆的署名，以及已保存的資格賽證據。應用程式使用核對後的 UID，頁面讀取無須呼叫 osu! 來配對歷史署名。

- `lolol233`、`myangelzfxggg` 是同一 UID 11375105 的官方曾用名。S8 的 `Sonoboi` 有同屆 Team!AE32 及 UID 10040597，與 UID 9755808 的 `Sonoaoi` 各自顯示。 [4k110sh1](https://osu.ppy.sh/users/11375105) · [Sonoboi](https://osu.ppy.sh/users/10040597) · [Sonoaoi](https://osu.ppy.sh/users/9755808)
- `VRainbow` 與 `- Rainbow -` 分別對應 3635214 和 8742486。 `[SHK]T_T` 與 `ShandenOnter` 是同一 UID 13999223。 [VRainbow](https://osu.ppy.sh/users/3635214) · [Shuumatsu](https://osu.ppy.sh/users/8742486) · [ShandenOnter](https://osu.ppy.sh/users/13999223)
- S1 的 `Gyro`、S2 的 `Maestrale` 採用保存的 UID 3824882、2759457。當前的同名查詢分別導向 10600936、36779970。 [S1 Staff](https://oclr.org/tournaments/s1/staff) · [S2 Staff](https://oclr.org/tournaments/s2/staff)
- S4–S5 的 `demisemiquaver` 採用 UID 8501053，有官方曾用名和 S5 資格賽七圖證據。S5 的 `B C` 亦有七圖分數對應 UID 3917377，與官方曾用名吻合。S5 的 `Crystal 1` 依原表 测试表!C30:D30 採用 UID 11237954。現用 `B_C` 與 `crystal_1` 的帳號建立時間均晚於 S5。 [S5 教練核對](../s5-coach-dates.md) · [S5 資格賽來源](s5-coach-date-sources.json) · [B C](https://osu.ppy.sh/users/3917377) · [Crystal 1 原表來源](s5-source-records.json)
- `Re_CYCLC` 採用 UID 9043058，由 S2 已保存選手身分及 S6 原表的 `re_cyclc` UID 佐證。S3 的原始署名 `Re_cycle` 現用名稱查詢會導向 UID 3218256。主辦已確認該筆應更正為 `Re_cyclc`，使用 UID 9043058。 [S6 來源核對](../s6-archive.md) · [re_cycle](https://osu.ppy.sh/users/3218256)
- `Fushimi Rio`、`TaneshimaPopura` 的現名入口查無資料，採用當年選手名單的數字 UID 1205412、714369。S7 的 `110` 採用已核對的 UID 4524921。 [S1 選手](https://oclr.org/tournaments/s1/players) · [S5 原表匯入](s5-reviewed-import.json) · [S7 工作人員核對](../s7-archive.md#staff-identity-follow-up-176-2026-10-24)

## 主辦確認的更正（#1008）

| 屆次 | 原始署名        | 更正或合併後的身分                                                  |
| ---- | --------------- | ------------------------------------------------------------------- |
| S2   | `seira-`        | [Miyaguni Akari · 3407743](https://osu.ppy.sh/users/3407743)        |
| S3   | `Gryo Zeppeli`  | [Gyro Zeppeli · 3824882](https://osu.ppy.sh/users/3824882)          |
| S3   | `Refia Vrifdis` | [Refia Vridis／Manasoy · 760389](https://osu.ppy.sh/users/760389)   |
| S3   | `Re_cycle`      | [Re_cyclc／-Inui Sana- · 9043058](https://osu.ppy.sh/users/9043058) |
| S4   | 22              | 22                                                                  |
| S4   | 22              | 22                                                                  |
| S5   | 45              | 45                                                                  |
| S5   | 45              | 45                                                                  |
| S7   | `ye_ow`         | [ye__ow · 2992539](https://osu.ppy.sh/users/2992539)                |

## ShaBae 與 B C 的署名確認（#1010）

- S1 的「傻呗」依主辦要求顯示為 ShaBae，使用已保存的 UID 8501053。原署名留在封存資料。 [ShaBae 的 osu! 檔案](https://osu.ppy.sh/users/8501053)
- S5 B31 原表解說欄列出 `Prophet BC demq`，同場錄影簡介列出「解说:Prophet 沙贝 BC」。主辦確認 `demq` 是 `demisemiquaver`（ShaBae，UID 8501053），S5 執勤記錄同時列出裁判與解說。現用同名帳號 UID 27633059 於 2021 年 12 月建立，晚於 B31。 [OCLR 對局](https://oclr.org/tournaments/s5/matches/b31) · [當年錄影](https://www.bilibili.com/video/BV1Di4y1c7aq/) · [同名 osu! 帳號](https://osu.ppy.sh/users/27633059)
- S4 K8 原表直播欄記載「感谢BC临时帮忙」。主辦確認 B C（UID 3917377）為直播員，公開直播欄顯示「Sonoaoi、B C」。 [S4 K8 對局](https://oclr.org/tournaments/s4/matches/k8) · [B C 的 osu! 檔案](https://osu.ppy.sh/users/3917377)

`鸽了`、`none`、`好多人` 等只作原始對局備註。多人欄使用原表標點或逐欄核對的分隔方式。來源署名與對局資料保持原樣，應用程式從現有公開資料組合工作人員名單與執勤記錄。
