# S3 · Frost Waltz／霜雪圓舞

2026-10-29，依 [#343](https://github.com/OCLR-dev/OCLR-website/issues/343) 製作獨立離線設計樣本，基準 main `f4b5eb85`。候選名稱、中文樣本文案與視覺方向供主辦方審閱，尚未接入正式外觀。

[開啟互動樣本](../s3.html) · [桌面明亮](overview-desktop-light.png) · [桌面深色](overview-desktop-dark.png) · [手機明亮](overview-mobile-light.png) · [手機深色](overview-mobile-dark.png)

## 設計主張

以「柔霜、雙環與開闊留白」延伸原圖，保留冬日光感；沿用既有 season themes 的 MainSheet 語意色、水平導覽、完整主視覺與資料側欄。S9 著重銳利晶面與鈷藍，本季採低彩度雪白、深藍灰、柔和冰藍圓弧。湖青保留為少量裝飾色，不承擔一般文字或狀態語意。

內容依序為賽季標題、四頁導覽、完整原圖／資料空態、設計色票。標題右側雙環與淡淡的 03 是唯一新增裝飾重心，手機縮減為側邊圓弧。資料區保持平整；面板12px、控制8px圓角，沿用系統字體及16px／1.65內文。原圖筆刷字不擴散到內文。

互動採按鈕按壓位移、短背景色過渡及分頁淡入；無飄雪、旋轉或持續掃光。reduced motion 關閉動畫與過渡；forced colors 移除雙環並用系統 Highlight 標示選取。

## 語意色

[候選 CSS](../s3.css) 重用 MainSheet 的 `--site-*` 命名，僅供離線樣本。

| Token | Light | Dark |
| --- | --- | --- |
| `--site-background` | `#F2FAFF` | `#101E2A` |
| `--site-surface` | `#FFFFFF` | `#172B39` |
| `--site-raised` | `#E5F3FA` | `#213C4C` |
| `--site-tint` | `#E0F2F8` | `#244556` |
| `--site-foreground` | `#18384E` | `#E9F5FB` |
| `--site-muted` | `#506C7E` | `#ACC4D1` |
| `--site-secondary-text` | `#365E75` | `#C4DBE7` |
| `--site-accent` / `--site-primary` | `#174A78` | `#91D8EF` |
| `--site-accent-strong` / `--site-primary-hover` | `#123E65` | `#B7E9F8` |
| `--site-on-primary` | `#FFFFFF` | `#102B3D` |
| `--site-border` | `#C9DFE9` | `#345262` |
| `--site-control-border` | `#668697` | `#7C9BAA` |
| `--site-focus` | `#14658A` | `#91D8EF` |
| `--site-selection` | `#C0E6F4` | `#34576B` |
| `--site-success` | `#176449` | `#8BDDBB` |
| `--site-warning` | `#785400` | `#EBCC87` |
| `--site-danger` | `#A62942` | `#FFA4B5` |

明亮主要操作採深冰藍底／白字，深色採淺冰藍底／深字。成功、提醒、錯誤以獨立色與文字／符號呈現；控制邊框與分隔線分開，焦點使用3px外框。

## 原圖與內容

[原主視覺](../../../../public/archive/s3/key-visual.avif) 995×621，完整比例、無裁切、無濾鏡、無重繪。檔案未改動；hash記錄於驗證報告。歷史文字保持原樣，新標示使用 osu! Chinese League Rookie (OCLR)。

這次不載入賽事資料：隊伍、賽程、圖池明確標記未載入；不推測日期、比分、名次、身分或賽制。Admin sample 是本機元件示範，提供主要／次要／停用、輸入／選取、必填錯誤、成功預覽和重設；沒有登入、角色、API／DB寫入、cookie或localStorage。表單不包含真實私人資料。

## 驗證與重現

完整 checkout 可直接開啟 `s3.html`，依賴同資料夾的既有 `sample.css` 與原圖。自動檢查使用既有 Playwright／Axe，執行 `node docs/design/season-themes/s3/verify.mjs`；工具自建 loopback 臨時伺服器，完成即關閉。

[verification.json](verification.json)：四頁 × 320／390／768／1440px × 明暗，共32組 Axe AA零違規、無頁面溢出及pageerror。另檢查圖片995×621解碼、鍵盤Home／右箭頭、表單空白驗證／重設／成功、明暗切換、無持久化及forced-colors裝飾移除。以reduced-motion產圖。保存8張Overview／Admin桌面手機明暗截圖；人工檢視桌面明亮及手機深色，原圖與文字無遮擋。

本輪 `npm ci --ignore-scripts --offline` 使用既有lockfile，沒有變更依賴；執行環境為Node.js26.12.0，未取得專案指定Node24，屬本次驗證限制。這是獨立樣本證據，不是正式React頁面截圖、完整應用回歸、三語、CI或部署驗收。

## 後續接入

待主辦方審閱本稿。若後續要求正式接入，候選識別 `frost-waltz` 需套用於現有 `.themed-site` 元件、補齊三語名稱與註冊／設定約束、取得真實頁面截圖及正式應用驗證。保持訪客cookie → 當前已授權／已發佈賽事 → 全站預設優先序、清除後路由繼承、SSR、獨立明暗及OBS／presenter隔離；不自動改任何歷史賽事預設。

設計方法採 [Refactoring UI skill](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 的層級與色彩指引，以及本機frontend-skill。樣本重用既有season theme基礎樣式，不引入框架。
