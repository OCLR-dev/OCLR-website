# S3 · Frost Waltz／雪花圓舞曲 — Banner 意象修訂

**最新稿：雪花圓舞曲。** [開啟最新 Banner 明暗預覽](waltz-banner.html) · [桌面深色](waltz-heading-937-dark.png) · [手機明亮](waltz-heading-390-light.png) · [本輪驗證](waltz-verification.json)。下方全頁圖庫與 `verification.json` 保留上一版 `9d28c6e` 證據，沒有套用本次圓舞曲紋理，不可視為本版全頁驗證。

## 晶瑩與流動感精修

依主辦方最新回饋，主雪花增加錯位暗邊、半透明晶體表面與細白亮邊，六臂加入雙面晶瓣和中央折射軸。不同明暗的切面建立厚度，背景小雪花維持細線，以前後層次呈現輕盈感。

S形薄光帶增加柔光底層與六條疏密不同的流線，沿三段舞步起伏；11處四角星芒與局部光暈集中在晶體／流光交會處。保留85點碎光、19枚雪花與文字閱讀遮罩。全部為靜態向量反光，沒有頻閃或持續移動；forced-colors仍移除所有背景裝飾。

本版已重新產出10張banner截圖，五種寬度×明暗Axe AA、溢出、素材解碼、forced-colors與鍵盤切換檢查通過，最新素材hash見 `waltz-verification.json`。人工檢視937px深色與390px明亮。完整頁面圖庫仍保留先前版本，不當作本輪新材質證據。

## 雪花圓舞曲構圖

依主辦方意象，以「一、二、三」的輕盈聚散構成三段視覺樂句：每段由一枚大雪花領舞、兩枚小雪花回應。三枚主雪花半徑108／127／145px，旋轉角度−18°／12°／40°，沿低—高—低的弧形路徑起伏；共19枚不同大小雪花延伸到四邊。開放式S形薄光帶與沿弧線的85點碎光暗示轉身與滑步，沒有封閉圓環、巨大季數或音符貼圖。旋轉以靜態角度表現，沒有持續動畫。

文字區仍留白，背景由左至右增加清晰度；晶瓣的微透明面提供輕微厚度，湖青與冰藍線條交織，呼應原圖冬日色彩。標題「雪花圓舞曲」只用於本輪元件提案，不改正式賽事名稱。

[draw-waltz.py](draw-waltz.py) 可重現兩份自繪SVG。[preview-waltz.mjs](preview-waltz.mjs) 從現有 `PageHeading` 函式擷取並編譯原始元件，配合既有globals／public-tournament與候選CSS獨立渲染，不需DB，也不是重畫整個網站。元件預覽把兩份SVG以data URI嵌入，並檢查實際解碼。

本輪Node24下320／390／768／937／1440px×明暗共10組Axe AA零違規，無橫向溢出，標題與說明不溢出，forced-colors移除裝飾、鍵盤焦點與模式切換通過。人工檢視937px深色與390px明亮。全頁重擷取受本機PostgreSQL共享記憶體ID額度耗盡阻擋；沒有修改系統限制或其他工作程序。先前32組全頁檢查不作本次新紋理證據。

2026-10-29，依 [#343](https://github.com/OCLR-dev/OCLR-website/issues/343) 與主辦方「應當參考最新的theme來設計」回饋重製。應用基準為 main `f4b5eb85`，包含已接入 S5 Prism Overture（#432）及 S6 Orbital Pulse 的最新設計。前版 `551fc36` 的獨立靜態示範已撤換；舊結果不能作為本版證據。

[互動對照圖庫](../s3.html) · [桌面 Light](desktop-light.webp) · [桌面 Dark](desktop-dark.webp) · [手機 Light](mobile-light.webp) · [手機 Dark](mobile-dark.webp) · [937px Banner](heading-937-dark.png)

## 本輪改正

本版沿用實際應用的標頭、賽事導覽、主視覺、五列統計、規則閱讀區、賽程、圖池和Admin設定。沒有另外設計頁面骨架，沒有將設計宣言／色票放入產品頁面。圖庫比照最新S5／S6，只切換實際頁面的保存截圖，附相同頁面與尺寸的default對照。

候選 [s3.css](../s3.css) 以最新正式 [prism-theme.css](../../../../src/app/prism-theme.css) 為元件基礎：沿用28×32px banner內距、手機24px、12px面板、8px控制、主導覽的透明選取、賽事導覽的輕底色、五列統計的數字字體與間距、無外框的圖池視圖控制、Admin側欄與44px操作區。只改S3材質與語意色；不以舊 `sample.css` 重製另一套介面。

## 視覺方案

**薄霜工作面、全幅大雪花。** 參考S5的全幅紋理＋閱讀遮罩，以及S6精修後的細線密度、頂部亮邊與克制陰影。S3將材質換成有分枝的雪花、18枚大小交錯的六角分枝雪花；雪花鋪滿整個banner並在邊緣自然延伸，左側文字保持安靜。手機保留局部紋理並加重閱讀遮罩。移除圓環與裝飾季數；不新增角色、音樂頻譜或稜鏡折面。

明亮採雪白與深冰藍；深色採低彩度藍灰與淺冰藍。湖青只作紋理／細亮邊點綴。S9的尖銳冰晶與鈷藍保持其專屬辨識，S3著重柔霜與輕盈舞步。資料面平整，不全頁堆疊雪花，不增加旋轉或飄雪。

兩份原生SVG：[Light](frost-field-light.svg)／[Dark](frost-field-dark.svg)，由本次自繪幾何線條組成，沒有字體、腳本或遠端資產。原始 [995×621主視覺](../../../../public/archive/s3/key-visual.avif) 不裁切、不重繪、不調色。

## 語意 tokens

| Token                              | Light     | Dark      |
| ---------------------------------- | --------- | --------- |
| `--site-background`                | `#F2FAFF` | `#101E2A` |
| `--site-surface`                   | `#FFFFFF` | `#172B39` |
| `--site-raised`                    | `#E5F3FA` | `#213C4C` |
| `--site-tint`                      | `#E0F2F8` | `#244556` |
| `--site-foreground`                | `#18384E` | `#E9F5FB` |
| `--site-muted`                     | `#506C7E` | `#ACC4D1` |
| `--site-secondary-text`            | `#365E75` | `#C4DBE7` |
| `--site-accent` / `--site-primary` | `#174A78` | `#91D8EF` |
| `--site-on-primary`                | `#FFFFFF` | `#102B3D` |
| `--site-border`                    | `#C9DFE9` | `#345262` |
| `--site-control-border`            | `#668697` | `#7C9BAA` |
| `--site-focus`                     | `#174A78` | `#83D4DF` |
| `--site-success`                   | `#22654F` | `#9BDFC1` |
| `--site-warning`                   | `#865500` | `#F4D397` |
| `--site-danger`                    | `#B32F48` | `#FFB2C2` |

其他hover／陰影／selection值以CSS為準。語意色保持獨立；深色按鈕採淺底深字。沿用S5的160ms入場、140ms導覽過渡與按壓回饋；reduced motion停用，forced colours移除紋理與陰影並保留系統Highlight焦點／選取。

## 預覽資料及邊界

Repository沒有完整可重現的S3歷史歸檔；本輪不讀取私人Admin或production。獨立 `oclr_s3_preview_test` 只建立清楚標示的合成介面樣本：一個placeholder team／captain是既有schema所需，畫面計數不代表S3歷史資料，賽程與圖池保留空態。摘要明示合成資料，圖庫明示設計預覽；不推測真實比分、日期、名次或身分。Admin僅使用隔離庫的合成帳號，session只在擷取程序記憶體中。

候選CSS以 `html[data-s3-preview] .themed-site` 隔離，由擷取工具注入；SVG以loopback攔截提供。應用仍SSR default，沒有註冊 `frost-waltz`、新增選單文案、修改預設、migration、真實角色或發佈。圖庫是實際React頁面＋候選CSS的截圖，不宣稱已正式接入。

## 重現與驗證

使用Node24、npm與既有lockfile。`prepare.ts`只可用於獨立test庫，並非production seed。

```sh
export TEST_DATABASE_URL=postgresql://emik@127.0.0.1:55433/oclr_s3_preview_test
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
node --import tsx docs/design/season-themes/s3/prepare.ts
npm run build
DATABASE_URL="$TEST_DATABASE_URL" ADMIN_OSU_IDS=60001 APP_URL=http://127.0.0.1:3193 npm start -- --hostname 127.0.0.1 --port 3193
# 另一個terminal，同一TEST_DATABASE_URL
node --import tsx docs/design/season-themes/s3/capture.mjs
```

實際結果見 [verification.json](verification.json)，綁定build ID與候選CSS／SVG hash。本版驗證與前版獨立靜態結果分開。這些檢查不是正式外觀整合、完整全站回歸、CI或部署驗收；主辦方先審閱設計方向。

設計方法沿用專案指定 [Refactoring UI](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md) 與frontend-skill，並以最新S5／S6正式元件設計優先。

本輪Node24.22.1：鎖定依賴安裝及production build通過；32組實際頁面／尺寸／明暗Axe AA零違規，內容文字保持不變、無橫向溢出；原圖995×621完整呈現、五列統計、手機選單及四組banner forced-colors通過。人工檢視桌面明亮與手機明亮，另確認桌面深色紋理。圖庫驗證見 [gallery-verification.json](gallery-verification.json)。完整應用測試與CI不在本輪設計預覽的通過宣稱內。

## 滿版雪花修訂

依主辦方最新回饋，移除所有圓環，改為18枚交錯尺寸的六角分枝雪花鋪滿banner。主要雪花半徑100–155px，小雪花38–78px補足間隙；邊緣自然裁切以延續紋理。僅衍生SVG裝飾可裁切，995×621原主視覺仍完整呈現。左側漸淡遮罩降低裝飾對文字的干擾，手機沿用較強閱讀遮罩；不增加動態飄雪。
