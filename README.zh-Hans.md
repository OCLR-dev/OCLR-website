# OCLR — osu! Chinese League Rookie

[English](README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md)

**osu! Chinese League Rookie（OCLR）** 官方社区赛事网站。OCLR 是社区活动，与 osu! 无隶属关系，也未获 osu! 背书。

本项目采用单一 Next.js App Router 应用，使用 TypeScript、React、Tailwind CSS、next-intl、PostgreSQL 与 Drizzle。赛事及账号数据以 PostgreSQL 为准。

## 功能

- 赛事报名与工作人员审核、队长选秀及队伍名单发布。
- 图池与内部 Replay、赛程、多人游戏记录导入及赛果审核。
- 公开赛程、对阵表、积分榜、选手资料、历届赛事档案及 OBS 画面。
- 简体中文、繁体中文和英文，支持独立设置明暗模式与外观。

## 快速开始

使用 **Node.js 24 LTS**（最低 22.13.0）和 npm，按开发目标选择：

- [Docker 本地演示](docs/development.md#local-frontend-database-and-demo-content)提供合成赛事数据。
- [本地 PostgreSQL 开发](docs/development.md#local-development)适用于需要数据库或 OAuth 的流程。
- [远程前端](docs/remote-development.md#fresh-frontend-checkout)以只读方式连接现有 OCLR 后端。

## 检查与测试

运行 `npm run check` 检查 lint 和类型。独立数据库测试、构建与翻译检查见[本地验证](docs/development.md#checks-and-hosting)，浏览器测试见 [CI 覆盖范围](docs/ci.md)。

## 文档

[文档索引](docs/README.md)汇集赛事运营、API 契约、设计和历史数据指南，详细内容以英文为主。

## 生产部署

部署使用 Rocky Linux 10、systemd，以及现有的独立 PostgreSQL 和 Nginx 主机。详见[部署操作指南](docs/deployment.md#simple-deployment-and-update)。

## 协作者

- [Sonoaoi](https://osu.ppy.sh/users/9755808)
- [Tensorera](https://osu.ppy.sh/users/19204569)
- [Shi Thi](https://osu.ppy.sh/users/3094900)
- [qi_e](https://osu.ppy.sh/users/6963321)
- [\[SHK\]ShandenYMD](https://osu.ppy.sh/users/13413713)
- [Muziyami](https://osu.ppy.sh/users/7003013)

## 致谢

感谢以下项目为 OCLR 提供数据。

- [Elitebotix](https://github.com/Eliteronix/Elitebotix)
- [SkillIssue](https://github.com/JustRoxy/SkillIssue)
- [o!TR](https://github.com/osu-tournament-rating/otr)

## 许可

本项目代码采用 [MIT License](LICENSE)。改编自 yumu-bot 的组件保留其 [Apache-2.0 许可](LICENSES/yumu-bot-Apache-2.0.txt)与[来源标注](docs/yumu-rating.md)。

国旗图案来自 [Twemoji](https://github.com/discord/twemoji)，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。详见[素材清单与来源](docs/country-flags.md)。
