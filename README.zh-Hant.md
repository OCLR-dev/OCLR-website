# OCLR — osu! Chinese League Rookie

[English](README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md)

**osu! Chinese League Rookie（OCLR）** 官方社群賽事網站。OCLR 是社群活動，與 osu! 無隸屬關係，亦未獲 osu! 背書。

本專案採用單一 Next.js App Router 應用程式，使用 TypeScript、React、Tailwind CSS、next-intl、PostgreSQL 與 Drizzle。賽事及帳號資料以 PostgreSQL 為準。

## 功能

- 賽事報名與工作人員審核、隊長選秀及隊伍名單發布。
- 圖池與內部 Replay、賽程、多人遊戲紀錄匯入及賽果審核。
- 公開賽程、對戰表、積分榜、選手資料、歷屆賽事檔案及 OBS 畫面。
- 簡體中文、繁體中文和英文，支援獨立設定明暗模式與外觀。

## 快速開始

使用 **Node.js 24 LTS**（最低 22.13.0）和 npm，依開發目標選擇：

- [Docker 本機示範](docs/development.md#local-frontend-database-and-demo-content)提供合成賽事資料。
- [本機 PostgreSQL 開發](docs/development.md#local-development)適用於需要資料庫或 OAuth 的流程。
- [遠端前端](docs/remote-development.md#fresh-frontend-checkout)以唯讀方式連線至既有 OCLR 後端。

## 檢查與測試

執行 `npm run check` 檢查 lint 和型別。獨立資料庫測試、建置與翻譯檢查見[本機驗證](docs/development.md#checks-and-hosting)，瀏覽器測試見 [CI 涵蓋範圍](docs/ci.md)。

## 文件

[文件索引](docs/README.md)彙整賽事營運、API 契約、設計和歷史資料指南，詳細內容以英文為主。

## 正式部署

部署使用 Rocky Linux 10、systemd，以及既有的獨立 PostgreSQL 和 Nginx 主機。詳見[部署操作指南](docs/deployment.md#simple-deployment-and-update)。

## 協作者

- [Sonoaoi](https://osu.ppy.sh/users/9755808)
- [Tensorera](https://osu.ppy.sh/users/19204569)
- [Shi Thi](https://osu.ppy.sh/users/3094900)
- [qi_e](https://osu.ppy.sh/users/6963321)
- [\[SHK\]ShandenYMD](https://osu.ppy.sh/users/13413713)
- [Muziyami](https://osu.ppy.sh/users/7003013)

## 致謝

感謝以下專案為 OCLR 提供資料。

- [Elitebotix](https://github.com/Eliteronix/Elitebotix)
- [SkillIssue](https://github.com/JustRoxy/SkillIssue)
- [o!TR](https://github.com/osu-tournament-rating/otr)

## 授權

本專案程式碼採用 [MIT License](LICENSE)。改編自 yumu-bot 的元件保留其 [Apache-2.0 授權](LICENSES/yumu-bot-Apache-2.0.txt)與[來源標示](docs/yumu-rating.md)。

國旗圖案來自 [Twemoji](https://github.com/discord/twemoji)，採用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。詳見[素材清單與來源](docs/country-flags.md)。
