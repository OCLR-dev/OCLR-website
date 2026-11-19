# 賽季外觀圖庫

賽季外觀由獲授權的賽事 Admin 在該屆設定中選用。訪客及全站設定可選跨季外觀。詳見[外觀選擇規則](../../localization.md#season-theme-selection-policy-445)，目前註冊值以 [`seasonAppearances`](../../../src/lib/preferences.ts) 為準。

| 賽季 | 正式外觀                     | 圖庫             | 設計與素材                                    | 驗證                                           |
| ---- | ---------------------------- | ---------------- | --------------------------------------------- | ---------------------------------------------- |
| S1   | 彩墨初章 · Chromatic Origins | [圖庫](s1.html)  | [設計](s1/DESIGN.md)                          | [紀錄](s1/verification.json)                   |
| S2   | 青燕春序 · Verdant Prelude   | [圖庫](s2.html)  | [設計](s2/DESIGN.md)                          | [紀錄](s2/verification.json)                   |
| S3   | 雪花圓舞曲 · Frost Waltz     | [圖庫](s3.html)  | [設計](s3/DESIGN.md)                          | [紀錄](s3/verification.json)                   |
| S4   | 蒼藍筆鋒 · Azure Brush       | [圖庫](s4.html)  | [設計](s4/DESIGN.md)                          | [紀錄](s4/verification.json)                   |
| S5   | 稜光序曲 · Prism Overture    | [圖庫](s5.html)  | [設計](s5/DESIGN.md)                          | [紀錄](s5/verification.json)                   |
| S6   | 星環脈衝 · Orbital Pulse     | [圖庫](s6.html)  | [設計](s6/DESIGN.md)                          | [紀錄](s6/verification.json)                   |
| S7   | 石墨競技場 · Graphite Arena  | [圖庫](s7.html)  | [設計](s7/DESIGN.md)                          | [紀錄](s7/verification.json)                   |
| S8   | 櫻花折線 · Sakura Circuit    | [圖庫](s8.html)  | [設計](s8/DESIGN.md)、[素材](s8/ARTWORK.md)   | [紀錄](s8/verification.json)                   |
| S9   | 冰晶鈷藍 · Glacier Blue      | [圖庫](s9.html)  | [設計](s9/DESIGN.md)、[素材](s9/ARTWORK.md)   | [紀錄](s9/verification.json)                   |
| S10  | 晴空未來城 · Skyline Pop     | [圖庫](s10.html) | [設計](s10/DESIGN.md)、[素材](s10/ARTWORK.md) | [紀錄](s10/verification.json)                  |
| S11  | 星雲初綻 · Nebula Bloom      |                  | [設計](../nebula-bloom.md)                    | [紀錄](../../verification/issue-858/README.md) |

## 開啟樣本

直接開啟 HTML。若瀏覽器限制本機檔案存取，在倉庫根目錄執行 `python3 -m http.server 3199 --bind 127.0.0.1`，再開啟對應的 `docs/design/season-themes/sN.html`。重現截圖所需的應用程式、隔離資料庫與擷取指令列於每季的設計文件。

## 圖片與資料

圖庫展示明暗、桌面與手機畫面。合成隊伍、賽程、圖池與統計只供審閱。原圖、改編素材、出處和授權見各季的設計與素材文件。S9 琪露諾同人素材另有[來源與署名說明](s9/ARTWORK.md)。

## 接入邊界

以現有 MainSheet 元件、[外觀與在地化規則](../../localization.md)及 [Refactoring UI 指南](https://github.com/LovroPodobnik/refactoring-ui-skill/blob/main/.claude/skills/ui-refactor/SKILL.md)為基準。偏好和賽事繼承由伺服器解析，OBS／presenter 使用獨立樣式。

## 驗證與歷史紀錄

每季紀錄對應特定版本的截圖與檢查範圍。目錄中的[早期驗證紀錄](verification.json)、候選 CSS 與樣本程式保留供追溯。完整回歸與部署驗收依對應提交和 CI 紀錄核對。
