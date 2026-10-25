# OCLR — osu! Chinese League Rookie

[English](README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md)

**osu! Chinese League Rookie（OCLR）** 官方社群賽事網站。OCLR 是社群活動，與 osu! 無隸屬關係，亦未獲 osu! 背書。

本專案採用單一 Next.js App Router 應用程式，使用 TypeScript、React、Tailwind CSS、next-intl、PostgreSQL 與 Drizzle。賽事及帳號資料以 PostgreSQL 為準。

## 功能

- 個人報名、自訂報名問題與資格條件、工作人員審核及代為報名。
- 隊長與隊伍設定、即時選秀、觀眾／OBS 畫面，以及獨立發布的隊伍名單。
- 圖池編輯與官方圖譜資料，以及具有選圖鎖定和 Showcase 截止時間的內部 Replay 附件。
- 賽程、多人遊戲紀錄匯入、經審核與核准的賽果、對戰表、積分榜、統計及每週選手獎項。
- 歷屆賽事封存、新聞、已接受報名的選手目錄、osu! 個人資料快照與社群資訊頁面。
- 簡體中文（預設）、繁體中文與英文；可獨立選擇淺色／深色，以及預設、可愛粉彩或瑞士極簡外觀。

權限與發布狀態由伺服器強制檢查。賽事或圖池公開，不代表草稿、私人報名答案或 Replay 檔案也會公開。各工作流程的發布規則請參閱下方文件。

## 快速開始

使用 **Node.js 24 LTS**（最低支援版本為 22.13.0）與 npm。CI 使用 PostgreSQL 17。若已有本機 PostgreSQL 資料庫：

```sh
npm ci
cp .env.example .env.local
# 設定 DATABASE_URL，以及要測試的功能所需的其他設定。
npm run db:migrate
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)。依照 [.env.example](.env.example) 與[開發指南](docs/development.md)，設定 `APP_URL`、`DATABASE_URL`、`OSU_CLIENT_ID`、`OSU_CLIENT_SECRET`、`ADMIN_OSU_IDS` 及經核准的 `PRIVACY_CONTACT_OSU_ID`。osu! OAuth 回呼網址必須完全符合 `APP_URL/auth/osu/callback`。登入與報名需要對應服務及設定；開發環境沒有略過登入驗證的入口。

### 免本地資料庫的前端開發

使用既有 OCLR 後端，要求 read API 為 1.1.0 或更新的 v1 版本：

```sh
npm ci
export APP_URL=http://127.0.0.1:3000
export OCLR_DATA_SOURCE=remote
export OCLR_API_BASE_URL=https://YOUR_OCLR_BACKEND
npm run dev -- --hostname 127.0.0.1
```

開啟 `/remote`，使用短期 Developer 存取憑據連線，或明確選擇匿名公開讀取。
新的前端 checkout 免本地資料庫、migration、seed、OAuth 密鑰或媒體目錄。
公開／歷史頁面、已儲存的工作人員工具、本人報名／隊伍及已獲任命的 Captain 頁面
保留原有身分與發布邊界；業務寫入與外部資料更新已停用。
參閱[遠端開發說明](docs/remote-development.md)、[覆蓋矩陣](docs/remote-coverage.json)
及[讀取 API／OpenAPI](docs/read-api.md)。後端部署與真實授權由營運者另行處理。

若是全新的前端開發目錄，已安裝 Docker，且尚無 `.env.local`，可選擇本機示範流程：

```sh
npm ci
npm run db:local
npm run db:migrate
npm run db:seed:dev
npm run dev
```

此流程會建立僅綁定本機回送位址的獨立 PostgreSQL 容器，並在 `/tournaments/dev-s11` 與 `/tournaments/dev-archive` 提供合成示範資料。已完成設定的開發目錄應保留原有設定。自動化測試的測試資料可能清空資料表，因此必須使用**另一個獨立測試資料庫**。詳見[本機示範設定](docs/development.md#local-frontend-database-and-demo-content)。

隊伍圖片與私人 Replay 需要透過 `OCLR_MEDIA_DIR` 設定持久儲存目錄；Replay 驗證另需 **Python 3 與標準函式庫的 LZMA 支援**。詳見 [Replay 部署需求](docs/deployment.md#private-mappool-replay-storage-185)。請勿提交本機環境檔、憑證、上傳檔案或資料庫備份。

## 檢查與測試

```sh
npm run check        # ESLint 與 TypeScript
npm run test:i18n    # 介面翻譯檢查
npm run build        # 正式環境建置
npm audit --omit=dev # 正式環境依賴套件稽核
```

執行單元／整合測試及桌面／行動版 Playwright 測試前，請明確匯出 `TEST_DATABASE_URL`，指向可拋棄的獨立資料庫。資料庫名稱須包含獨立的 `test` 區段，例如 `oclr_test`。請勿使用示範或正式環境資料庫：

```sh
: "${TEST_DATABASE_URL:?請先匯出獨立測試資料庫的連線網址}"
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
DATABASE_URL="$TEST_DATABASE_URL" npm test
npx playwright install chromium
DATABASE_URL="$TEST_DATABASE_URL" npm run test:e2e
```

Playwright 會在本機回送位址的 3100 連接埠啟動正式建置。若要使用已安裝的 Chrome，可設定 `PLAYWRIGHT_CHANNEL=chrome`。測試前置條件詳見[開發指南](docs/development.md)。本機檢查結果不代表目前版本的 CI 或正式部署已通過。

## 文件

以下詳細指南目前以英文為主：

- [文件索引](docs/README.md) — 所有指南與設計參考
- [開發指南](docs/development.md) — 本機設定、檢查、OAuth、PostgreSQL 與設計說明
- [賽事管理](docs/tournament-management.md) — 屆次設定、報名、工作人員角色與稽核
- [競賽工作流程](docs/competition-operations.md) — 隊長、隊伍、選秀引擎、賽程、多人遊戲匯入與賽果審核
- [圖池](docs/mappools.md) — 圖譜資料、Mod 欄位、發布、編輯與私人 Replay
- [公開功能](docs/public-features.md) — 新聞、選手目錄／個人資料、積分榜與公開頁面
- [評分模型](docs/yumu-rating.md) — yumu-bot 來源標示、公式與 OCLR 調整
- [在地化](docs/localization.md) — 英文、簡繁中文與外觀設定
- [部署與維運](docs/deployment.md) — Rocky Linux、正式更新、資料庫遷移、備份與復原

## 正式部署

部署目標為 **Rocky Linux 10 與 systemd**，搭配**既有的獨立 PostgreSQL 伺服器**及**既有的獨立 Nginx HTTPS 反向代理**。腳本不會安裝替代的資料庫或代理服務。請先準備經核准的 `/etc/oclr/runtime.env`，並依照[正式部署操作指南](docs/deployment.md)執行。在已審閱的安裝程式目錄中，首次安裝使用 `sudo bash scripts/oclr.sh deploy`，後續版本更新使用 `sudo oclr update`。

請使用已審閱且 CI 通過的提交。更新流程會建立獨立版本、驗證私人備份、套用待執行的資料庫遷移、啟用版本，並核對本機與公開網址的確切版本。進階更新需在文件規定的操作環境中執行 `bash scripts/update.sh --ref FULL_REVIEWED_COMMIT_SHA --apply`。`npm run production:start` 僅啟動已建置版本，不執行遷移。請勿覆蓋正在提供服務的版本進行建置，也不要在正式環境執行開發用 schema push 或測試資料。

使用 `sudo oclr cleanup` 預覽舊版本清理，再以 `sudo oclr cleanup --apply` 刪除符合條件的版本。預設保留最新 3 個版本，並額外保護 `current`／`previous` 指向的版本。保留數量設定與已安裝指令的升級方式詳見操作指南。

[設計參考](docs/design/)中的圖片與賽事日期僅為範例，不代表經核准的競賽資料。

## 協作者

- [Sonoaoi](https://osu.ppy.sh/users/9755808)
- [Tensorera](https://osu.ppy.sh/users/19204569)

## 貢獻者

- [qi_e](https://osu.ppy.sh/users/6963321)
- [Muziyami](https://osu.ppy.sh/users/7003013)

## 授權

本專案程式碼採用 [MIT License](LICENSE)。改編自 yumu-bot 的元件保留其 [Apache-2.0 授權](LICENSES/yumu-bot-Apache-2.0.txt)與[來源標示](docs/yumu-rating.md)。
