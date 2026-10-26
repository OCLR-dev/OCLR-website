# S10 / S9 / S8 / S7 theme samples

主辦方原始提案：[S10 #195](https://github.com/OCLR-dev/OCLR-website/issues/195)、[S9 #196](https://github.com/OCLR-dev/OCLR-website/issues/196)、[S8 #197](https://github.com/OCLR-dev/OCLR-website/issues/197)、[S7 #198](https://github.com/OCLR-dev/OCLR-website/issues/198)。S10 已依主辦方要求接入正式外觀 `skyline-pop`；S9／S8／S7 仍為待審閱設計。

**2026-10-26 S10 city pop 精修**：[#195](https://github.com/OCLR-dev/OCLR-website/issues/195) 以最新 main `0d3e203` 實際 UI 產圖。呼應原 S10 圖的晴空藍、亮青、桃粉與奶油白，加入明確手繪感的海岸城市插畫；桌面／手機、明暗與 Admin 都保留現有元件。完整角色原圖無框呈現；`s10.html` 為實際截圖對照圖庫，素材與完整 prompt set 見 [ARTWORK](s10/ARTWORK.md)。本輪不修改 S9／S8／S7 設計。

S10 的 `s10.html` 現為**實際截圖對照圖庫**，可切換頁面、尺寸、明暗及最新原有風格／S10 候選。它只在本機展示圖片，不連接 API、DB 或儲存偏好。重新產生 S10 圖片需獨立應用與可丟棄 test DB；見 [S10 設計與重現步驟](s10/DESIGN.md)。S8／S7 的既有靜態樣本保持原樣。

**2026-10-26 S9 琪露諾元素精修**：[#196](https://github.com/OCLR-dev/OCLR-website/issues/196) 以 main `cc366f2` 的實際 UI 產圖。保留無框完整原圖與琪露諾同人插畫，精修角色漸隱／霧光融合、小雪晶、較緊湊的標題、選取底色與統計閱讀層級。素材為東方Project二次創作，見 [ARTWORK](s9/ARTWORK.md)；明暗／手機／Admin 圖庫與檢查見 [S9 DESIGN](s9/DESIGN.md)。S10 維持已合併版本。

| Season | 提案                        | 可操作樣本           | 設計規格                | 預覽                                                                                              |
| ------ | --------------------------- | -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| S10    | Skyline Pop · 晴空未來城    | [s10.html](s10.html) | [Design](s10/DESIGN.md) | [Light](s10/desktop-light.webp) / [Dark](s10/desktop-dark.webp) / [Mobile](s10/mobile-light.webp) |
| S9     | Glacier Blue · 冰晶鈷藍     | [s9.html](s9.html)   | [Design](s9/DESIGN.md)  | [Light](s9/desktop-light.webp) / [Dark](s9/desktop-dark.webp) / [Mobile](s9/mobile-light.webp)    |
| S8     | Sakura Circuit · 櫻花折線   | [s8.html](s8.html)   | [Design](s8/DESIGN.md)  | [Light](s8/desktop-light.webp) / [Dark](s8/desktop-dark.webp) / [Mobile](s8/mobile-light.webp)    |
| S7     | Graphite Arena · 石墨競技場 | [s7.html](s7.html)   | [Design](s7/DESIGN.md)  | [Light](s7/desktop-light.webp) / [Dark](s7/desktop-dark.webp) / [Mobile](s7/mobile-light.webp)    |

## 開啟樣本

完整 checkout 可直接在瀏覽器開啟 HTML；若瀏覽器限制 `file:`，從 repo 根目錄啟動 `python3 -m http.server 3199 --bind 127.0.0.1`。這是獨立 review 預覽，與 demo／production 程序無關。

- **S10／S9**：圖庫控制只切換真實截圖，不假裝提供正式管理功能；`current-*.webp` 為同頁同尺寸同明暗的原有風格對照。
- **S8／S7**：維持 Light／Dark、Overview／Schedule／Mappools／Admin sample 分頁、鍵盤切換、表單預覽／重設；只在記憶體操作。

## 圖片與資料

原始主視覺不裁切、不重繪、不調色。S10 保留透明 1:1 原圖，其他三季保留完整 16:9。介面使用官方名稱 **osu! Chinese League Rookie (OCLR)**。

S10／S9 直接使用各季已提交的完整歸檔與既有讀模型；公開頁為匿名、Admin 為隔離 test DB 的 `Synthetic UI Preview` 合成帳號。沒有實際網站角色授予、真實 OAuth／私密資料或業務寫入。S8／S7 仍使用已提交歸檔的必要摘錄。所有預覽都不能當作正式站發佈／授權證據，不作 production seed。

## 接入邊界

S10 圖庫的候選 CSS 保留為歷史 review 用 `data-s10-preview`；正式應用使用 [skyline-theme.css](../../../src/app/skyline-theme.css)、`data-appearance="skyline-pop"` 與 `.themed-site`，選單名稱為 S10 · 晴空未來城／晴空未来城／Skyline Pop。S9 候選 CSS 仍限定在 review 用 `data-s9-preview`；S8／S7 的 `sample.css`／`sample.js` 仍是 review-only 組合。

S10 正式接入重用現有元件和 next-intl（zh-Hans／zh-Hant／en），保留全部原有九款 appearance、SSR、獨立明暗、訪客 cookie → 當前授權／已發佈賽事預設 → 全站預設及清除繼承。非賽事頁不繼承上一季，歷史賽事預設不自動修改；OBS／presenter、授權、發佈、OAuth／deep links 保持既有邊界。

設計方法沿用專案指定的 [Refactoring UI skill](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md)，以目前 MainSheet／元件為基準。

## 驗證與歷史紀錄

- **S10 最新 UI 版**：依 [重現步驟](s10/DESIGN.md) 執行 `node --import tsx docs/design/season-themes/s10/capture.mjs`。三個實際路由 × 四個尺寸 × 明暗共 24 組，24 次 Axe AA 無違規；驗證 DOM／文字不變、五列統計、規則、手機選單和實際 sticky stack。另有 4 組 forced-colours 檢查。新圖／報告見 [s10/verification.json](s10/verification.json)。應用 production build、產圖／圖庫工具 lint／語法／文件連結／diff 通過。
- **S9 最新 UI 版**：`node --import tsx docs/design/season-themes/s9/capture.mjs`，三個實際路由 × 四個尺寸 × 明暗共 24 組／24 次 Axe AA 無違規；額外核對原圖 1920×1080 與 contain。[本版報告](s9/verification.json)。本次只重製 S9；S10 保留原有版本與證據。
- **S8／S7**：`node docs/design/season-themes/verify.mjs [s8 s7]` 驗證這兩季的原靜態樣本，輸出 `verification-static.json`。本次未重驗或重製這兩季。
- **歷史證據**：根目錄 `verification.json` 保留 2026-10-24 原四季 32 組／64 次 Axe 結果。S10 `f2d4d7e` 的獨立樣本與檢查已被本版取代，不將那些結果套用到最新 UI。

這些檢查不等同完整應用回歸、三語整合、CI 或部署驗收；正式接入另跑專案要求的完整驗證。
