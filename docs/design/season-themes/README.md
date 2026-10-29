# S10 / S9 / S8 / S7 / S6 / S5 / S2 theme samples

**2026-10-29 S2 正式接入樣本**：[青燕春序圖庫](s2.html)／[設計與資料限制](s2/DESIGN.md)。以註冊外觀 `verdant-prelude` 擷取實際 SSR 頁面，提供明暗、桌面／手機及 default 對照；合成隊伍、賽程與圖池不代表歷史統計，未部署。

**2026-10-29 S3 正式接入**：依 [#343](https://github.com/OCLR-dev/OCLR-website/issues/343) 主辦方確認，接入 `frost-waltz`／雪花圓舞曲。晶瑩雪花、三段舞步光流與局部星芒，保留完整995×621原圖。圖庫更新為正式SSR外觀，合成計數不代表S3歷史資料；不自動修改預設。[圖庫](s3.html)／[設計](s3/DESIGN.md)／[驗證](s3/verification.json)。

主辦方原始提案：[S10 #195](https://github.com/OCLR-dev/OCLR-website/issues/195)、[S9 #196](https://github.com/OCLR-dev/OCLR-website/issues/196)、[S8 #197](https://github.com/OCLR-dev/OCLR-website/issues/197)、[S7 #198](https://github.com/OCLR-dev/OCLR-website/issues/198)。S10／S9／S8／S7 已依主辦方要求接入正式外觀 `skyline-pop`／`glacier-blue`／`sakura-circuit`／`graphite-arena`，各自的視覺審閱／合併證據以對應 issue 為準。

**2026-10-29 S4開發預覽**：[#344](https://github.com/OCLR-dev/OCLR-website/issues/344) 的 Azure Brush／蒼藍筆鋒，以蒼藍水墨筆鋒、飛白及墨色暈染延伸原圖，資料區維持紙白／墨藍和清楚層級。依主辦方本輪設計開發要求實作 `azure-brush`，交付實際頁面明暗／手機圖庫及本機控制項預覽；視覺與中文名稱供審閱。[圖庫](s4.html)／[Design](s4/DESIGN.md)／[檢查](s4/verification.json)。

**2026-10-29 S5正式接入**：[#345](https://github.com/OCLR-dev/OCLR-website/issues/345) 的 Prism Overture／稜光序曲已依主辦方確認接入 `prism-overture`，以110片青紫稜面與古典斜體β壓印呈現 OCLR β (S5)，保留完整原圖與歷史β識別。圖庫擷取正式SSR外觀的實際頁面，本輪PR供審閱。[圖庫](s5.html)／[Design](s5/DESIGN.md)／[檢查](s5/verification.json)。

**2026-10-29 S6 banner 精修**：[#346](https://github.com/OCLR-dev/OCLR-website/issues/346) 的 Orbital Pulse／星環脈衝已由 [#419](https://github.com/OCLR-dev/OCLR-website/pull/419) 正式接入。本輪在紅藍水平頻譜周圍加入細電路、接點與訊號路徑，配合漸淡遮罩與細亮邊精修層次；新PR供審閱。圖庫為正式SSR外觀的實際頁面。[圖庫](s6.html)／[Design](s6/DESIGN.md)／[頁面檢查](s6/verification.json)。

**2026-10-26 S10 city pop 精修**：[#195](https://github.com/OCLR-dev/OCLR-website/issues/195) 以最新 main `0d3e203` 實際 UI 產圖。呼應原 S10 圖的晴空藍、亮青、桃粉與奶油白，加入明確手繪感的海岸城市插畫；桌面／手機、明暗與 Admin 都保留現有元件。完整角色原圖無框呈現；`s10.html` 為實際截圖對照圖庫，素材與完整 prompt set 見 [ARTWORK](s10/ARTWORK.md)。本輪不修改 S9／S8／S7 設計。

S10 的 `s10.html` 現為**實際截圖對照圖庫**，可切換頁面、尺寸、明暗及最新原有風格／S10 候選。它只在本機展示圖片，不連接 API、DB 或儲存偏好。重新產生 S10 圖片需獨立應用與可丟棄 test DB；見 [S10 設計與重現步驟](s10/DESIGN.md)。S8／S7 本輪亦改為最新實際 UI 圖庫。

**2026-10-26 S9 琪露諾元素精修**：[#196](https://github.com/OCLR-dev/OCLR-website/issues/196) 以 main `cc366f2` 的實際 UI 產圖。保留無框完整原圖與琪露諾同人插畫，精修角色漸隱／霧光融合、小雪晶、較緊湊的標題、選取底色與統計閱讀層級。素材為東方Project二次創作，見 [ARTWORK](s9/ARTWORK.md)；明暗／手機／Admin 圖庫與檢查見 [S9 DESIGN](s9/DESIGN.md)。S10 維持已合併版本。

| Season | 提案                              | 可操作樣本           | 設計規格                | 預覽                                                                                              |
| ------ | --------------------------------- | -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| S10    | Skyline Pop · 晴空未來城          | [s10.html](s10.html) | [Design](s10/DESIGN.md) | [Light](s10/desktop-light.webp) / [Dark](s10/desktop-dark.webp) / [Mobile](s10/mobile-light.webp) |
| S9     | Glacier Blue · 冰晶鈷藍           | [s9.html](s9.html)   | [Design](s9/DESIGN.md)  | [Light](s9/desktop-light.webp) / [Dark](s9/desktop-dark.webp) / [Mobile](s9/mobile-light.webp)    |
| S8     | Sakura Circuit · 櫻花折線         | [s8.html](s8.html)   | [Design](s8/DESIGN.md)  | [Light](s8/desktop-light.webp) / [Dark](s8/desktop-dark.webp) / [Mobile](s8/mobile-light.webp)    |
| S7     | Graphite Arena · 石墨競技場       | [s7.html](s7.html)   | [Design](s7/DESIGN.md)  | [Light](s7/desktop-light.webp) / [Dark](s7/desktop-dark.webp) / [Mobile](s7/mobile-light.webp)    |
| S6     | Orbital Pulse · 星環脈衝          | [s6.html](s6.html)   | [Design](s6/DESIGN.md)  | [Light](s6/desktop-light.webp) / [Dark](s6/desktop-dark.webp) / [Mobile](s6/mobile-dark.webp)     |
| S5     | Prism Overture · 稜光序曲（候選） | [s5.html](s5.html)   | [Design](s5/DESIGN.md)  | [Light](s5/desktop-light.webp) / [Dark](s5/desktop-dark.webp) / [Mobile](s5/mobile-light.webp)    |

**2026-10-27 S8 初稿**：[#197](https://github.com/OCLR-dev/OCLR-website/issues/197) 以 main `a50e03d` 的實際 UI 產圖。沿用櫻花粉／柑橘橙／暖白與原圖折角，加入使用者提供的 RULES banner、依該 banner 補全的半身女主角，以及自繪櫻花枝紋。保留完整無框原主視覺；[S8 DESIGN](s8/DESIGN.md)／[素材與提示詞](s8/ARTWORK.md)。初稿已由主辦方確認；正式接入精修時移除強制折角，採細花脈櫻花插畫與漸淡分隔線；本輪再以少量 1px 橙色細線呼應原圖，正式外觀使用 `sakura-circuit`，不自動更動任何既有預設。圖庫已更新為實作 `316c0eb` 的實際 SSR 外觀截圖；正式接入證據見 #197。

## 開啟樣本

完整 checkout 可直接在瀏覽器開啟 HTML；若瀏覽器限制 `file:`，從 repo 根目錄啟動 `python3 -m http.server 3199 --bind 127.0.0.1`。這是獨立 review 預覽，與 demo／production 程序無關。

- **S10／S9／S8／S7**：圖庫控制只切換真實截圖，不假裝提供正式管理功能；`current-*.webp` 為同頁同尺寸同明暗的原有風格對照。
- **S6**：正式 `orbital-pulse` SSR 外觀的實際頁面截圖，圖庫只切換保存圖片；`s6.css` 保留為候選階段歷史參考。
- **S5**：候選CSS套用於實際元件後直接截圖；尚未註冊外觀或修改正式選單。
- 六季皆使用真實應用截圖圖庫；舊靜態樣本結果只作歷史紀錄。

## 圖片與資料

原始主視覺不裁切、不重繪、不調色。S10 保留透明 1:1 原圖，其餘季別保留完整 16:9。介面使用官方名稱 **osu! Chinese League Rookie (OCLR)**。

S10／S9 直接使用各季已提交的完整歸檔與既有讀模型；公開頁為匿名、Admin 為隔離 test DB 的 `Synthetic UI Preview` 合成帳號。沒有實際網站角色授予、真實 OAuth／私密資料或業務寫入。S8 本版亦直接使用完整歸檔；S7 本輪亦使用完整已提交歸檔。所有預覽都不能當作正式站發佈／授權證據，不作 production seed。

## 接入邊界

S10 圖庫的候選 CSS 保留為歷史 review 用 `data-s10-preview`；正式應用使用 [skyline-theme.css](../../../src/app/skyline-theme.css)、`data-appearance="skyline-pop"` 與 `.themed-site`，選單名稱為 S10 · 晴空未來城／晴空未来城／Skyline Pop。S9 的 `data-s9-preview` CSS 保留為歷史 review 用；正式應用使用 [glacier-theme.css](../../../src/app/glacier-theme.css)、`data-appearance="glacier-blue"`，選單名稱為 S9 · 冰晶鈷藍／冰晶钴蓝／Glacier Blue，頁尾保留三語同人標註；S8 的 `data-s8-preview` CSS 保留為歷史 review 用；正式應用使用 [sakura-theme.css](../../../src/app/sakura-theme.css)、`data-appearance="sakura-circuit"`，選單名稱為 S8 · 櫻花折線／樱花折线／Sakura Circuit；S7 正式應用使用 [graphite-theme.css](../../../src/app/graphite-theme.css)、`data-appearance="graphite-arena"` 與三語 S7 · 石墨競技場／石墨竞技场／Graphite Arena。舊 `sample.css`／`sample.js` 與 S7 候選 CSS 保留作歷史參考。

S10 正式接入重用現有元件和 next-intl（zh-Hans／zh-Hant／en），保留全部原有九款 appearance、SSR、獨立明暗、訪客 cookie → 當前授權／已發佈賽事預設 → 全站預設及清除繼承。非賽事頁不繼承上一季，歷史賽事預設不自動修改；OBS／presenter、授權、發佈、OAuth／deep links 保持既有邊界。

設計方法沿用專案指定的 [Refactoring UI skill](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md)，以目前 MainSheet／元件為基準。

## 驗證與歷史紀錄

- **S6 正式整合版**：`node --import tsx docs/design/season-themes/s6/capture.mjs`，四個真實路由 × 四個尺寸 × 明暗，共32組／32次Axe AA零違規，另4組forced colours、手機選單／焦點與原圖完整性檢查。[報告](s6/verification.json) 綁定本輪正式來源提交 `bcad37e`；應用整合驗證見 [S6 DESIGN](s6/DESIGN.md)。

- **S10 最新 UI 版**：依 [重現步驟](s10/DESIGN.md) 執行 `node --import tsx docs/design/season-themes/s10/capture.mjs`。三個實際路由 × 四個尺寸 × 明暗共 24 組，24 次 Axe AA 無違規；驗證 DOM／文字不變、五列統計、規則、手機選單和實際 sticky stack。另有 4 組 forced-colours 檢查。新圖／報告見 [s10/verification.json](s10/verification.json)。應用 production build、產圖／圖庫工具 lint／語法／文件連結／diff 通過。
- **S9 最新 UI 版**：`node --import tsx docs/design/season-themes/s9/capture.mjs`，三個實際路由 × 四個尺寸 × 明暗共 24 組／24 次 Axe AA 無違規；額外核對原圖 1920×1080 與 contain。[本版報告](s9/verification.json)。本次只重製 S9；S10 保留原有版本與證據。
- **S8 最新 UI 初稿**：`node --import tsx docs/design/season-themes/s8/capture.mjs`，明暗 × 四個尺寸 × 三個真實路由；檢查 DOM／文字、原圖、Axe AA、手機選單／焦點／sticky stack、forced colours，見 [S8 報告](s8/verification.json)。2026-10-24 靜態證據另存 [歷史紀錄](s8/verification-static-2026-10-24.json)。
- **S7 最新 UI 版**：`node --import tsx docs/design/season-themes/s7/capture.mjs`，三個真實路由 × 四個尺寸 × 明暗，另檢查高對比、手機選單與完整原圖；見 [S7 DESIGN](s7/DESIGN.md) 與 [報告](s7/verification.json)。以 main `d34378e` 為 UI 基準，正式 appearance 為 `graphite-arena`。
- **歷史證據**：根目錄 `verification.json` 保留 2026-10-24 原四季 32 組／64 次 Axe 結果。S10 `f2d4d7e` 的獨立樣本與檢查已被本版取代，不將那些結果套用到最新 UI。

這些檢查不等同完整應用回歸、三語整合、CI 或部署驗收；正式接入另跑專案要求的完整驗證。

**2026-10-27 S7**：依 #198 本輪要求接入 Graphite Arena；拉絲銀色／深鋼金屬、方向反射與倒角亮邊、六角金屬嵌件、競技黃與透明導覽選取，未自動修改任何預設。四季已各自接入，圖庫仍只作 review 證據。

## S1 彩墨初章候選（#417）

[實際頁面對照圖庫](s1.html) · [設計與資料限制](s1/DESIGN.md) · [候選 CSS](s1.css)。參考最新 S5／S6 正式主題，以彩墨套印與彩墨浸染延伸 S1 原圖；尚未註冊外觀或修改預設。圖庫使用隔離 fixture，合成隊伍與 Captain 不代表歷史統計。

S1 彩墨初章已依主辦方確認接入 `chromatic-origins`；[圖庫](s1.html) 以正式 SSR 與素材擷取，既有預設不變。前述候選說明保留為歷史。
