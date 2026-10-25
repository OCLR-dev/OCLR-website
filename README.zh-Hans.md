# OCLR — osu! Chinese League Rookie

[English](README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md)

**osu! Chinese League Rookie（OCLR）** 官方社区赛事网站。OCLR 是社区活动，与 osu! 无隶属关系，也未获 osu! 背书。

本项目采用单一 Next.js App Router 应用，使用 TypeScript、React、Tailwind CSS、next-intl、PostgreSQL 与 Drizzle。赛事及账号数据以 PostgreSQL 为准。

## 功能

- 个人报名、自定义报名问题与资格条件、工作人员审核及代为报名。
- 队长与队伍配置、实时选秀、观众／OBS 画面，以及单独发布的队伍名单。
- 图池编辑与官方谱面数据，以及具有选图锁定和 Showcase 截止时间的内部 Replay 附件。
- 赛程、多人游戏记录导入、经审核与批准的赛果、对阵表、积分榜、统计及每周选手奖项。
- 历届赛事归档、新闻、已接受报名的选手目录、osu! 个人资料快照与社区信息页面。
- 简体中文（默认）、繁体中文与英文；可独立选择浅色／深色，以及默认、可爱粉彩或瑞士极简外观。

权限与发布状态由服务器强制检查。赛事或图池公开，不代表草稿、私人报名答案或 Replay 文件也会公开。各工作流程的发布规则请参阅下方文档。

## 快速开始

使用 **Node.js 24 LTS**（最低支持版本为 22.13.0）与 npm。CI 使用 PostgreSQL 17。如果已有本地 PostgreSQL 数据库：

```sh
npm ci
cp .env.example .env.local
# 配置 DATABASE_URL，以及要测试的功能所需的其他设置。
npm run db:migrate
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。按照 [.env.example](.env.example) 与[开发指南](docs/development.md)，配置 `APP_URL`、`DATABASE_URL`、`OSU_CLIENT_ID`、`OSU_CLIENT_SECRET`、`ADMIN_OSU_IDS` 及经批准的 `PRIVACY_CONTACT_OSU_ID`。osu! OAuth 回调网址必须完全符合 `APP_URL/auth/osu/callback`。登录与报名需要对应的服务及配置；开发环境没有绕过登录验证的入口。

### 无需本地数据库的前端开发

使用已有的 OCLR 后端，要求 read API 为 1.1.0 或更新的 v1 版本：

```sh
npm ci
export APP_URL=http://127.0.0.1:3000
export OCLR_DATA_SOURCE=remote
export OCLR_API_BASE_URL=https://YOUR_OCLR_BACKEND
npm run dev -- --hostname 127.0.0.1
```

打开 `/remote`，使用短期 Developer 访问凭据连接，或明确选择匿名公开读取。
新的前端 checkout 无需本地数据库、迁移、seed、OAuth 密钥或媒体目录。
公开／历史页面、已保存的工作人员工具、本人报名／队伍及已获任命的 Captain 页面
保留原有身份与发布边界；业务写入和外部资料刷新已禁用。
参阅[远端开发说明](docs/remote-development.md)、[覆盖矩阵](docs/remote-coverage.json)
及[读取 API／OpenAPI](docs/read-api.md)。后端部署和真实授权由运营者另行处理。

如果是全新的前端开发目录，已安装 Docker，且尚无 `.env.local`，可选择本地演示流程：

```sh
npm ci
npm run db:local
npm run db:migrate
npm run db:seed:dev
npm run dev
```

此流程会创建仅绑定本地回环地址的独立 PostgreSQL 容器，并在 `/tournaments/dev-s11` 与 `/tournaments/dev-archive` 提供合成演示数据。已完成配置的开发目录应保留原有设置。自动化测试的测试数据可能清空数据表，因此必须使用**另一个独立测试数据库**。详见[本地演示配置](docs/development.md#local-frontend-database-and-demo-content)。

队伍图片与私人 Replay 需要通过 `OCLR_MEDIA_DIR` 配置持久存储目录；Replay 验证另需 **Python 3 与标准库的 LZMA 支持**。详见 [Replay 部署要求](docs/deployment.md#private-mappool-replay-storage-185)。请勿提交本地环境文件、凭据、上传文件或数据库备份。

## 检查与测试

```sh
npm run check        # ESLint 与 TypeScript
npm run test:i18n    # 界面翻译检查
npm run build        # 生产环境构建
npm audit --omit=dev # 生产依赖包安全审计
```

执行单元／集成测试及桌面／移动版 Playwright 测试前，请明确导出 `TEST_DATABASE_URL`，指向可丢弃的独立数据库。数据库名称须包含独立的 `test` 区段，例如 `oclr_test`。请勿使用演示或生产环境数据库：

```sh
: "${TEST_DATABASE_URL:?请先导出独立测试数据库的连接网址}"
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
DATABASE_URL="$TEST_DATABASE_URL" npm test
npx playwright install chromium
DATABASE_URL="$TEST_DATABASE_URL" npm run test:e2e
```

Playwright 会在本地回环地址的 3100 端口启动生产构建。如需使用已安装的 Chrome，可设置 `PLAYWRIGHT_CHANNEL=chrome`。测试前置条件详见[开发指南](docs/development.md)。本地检查结果不代表当前版本的 CI 或生产部署已通过。

## 文档

以下详细指南目前以英文为主：

- [文档索引](docs/README.md) — 所有指南与设计参考
- [开发指南](docs/development.md) — 本地配置、检查、OAuth、PostgreSQL 与设计说明
- [赛事管理](docs/tournament-management.md) — 届次配置、报名、工作人员角色与审计
- [竞赛工作流程](docs/competition-operations.md) — 队长、队伍、选秀引擎、赛程、多人游戏导入与赛果审核
- [图池](docs/mappools.md) — 谱面数据、Mod 栏位、发布、编辑与私人 Replay
- [公开功能](docs/public-features.md) — 新闻、选手目录／个人资料、积分榜与公开页面
- [评分模型](docs/yumu-rating.md) — yumu-bot 来源标注、公式与 OCLR 调整
- [本地化](docs/localization.md) — 英文、简繁中文与外观设置
- [部署与运维](docs/deployment.md) — Rocky Linux、生产更新、数据库迁移、备份与恢复

## 生产部署

部署目标为 **Rocky Linux 10 与 systemd**，搭配**现有的独立 PostgreSQL 服务器**及**现有的独立 Nginx HTTPS 反向代理**。脚本不会安装替代的数据库或代理服务。请先准备经批准的 `/etc/oclr/runtime.env`，并按照[生产部署操作指南](docs/deployment.md)执行。在已审阅的安装程序目录中，首次安装使用 `sudo bash scripts/oclr.sh deploy`，后续版本更新使用 `sudo oclr update`。

请使用已审阅且 CI 通过的提交。更新流程会创建独立版本、验证私人备份、应用待执行的数据库迁移、启用版本，并核对本地与公开网址的确切版本。高级更新需在文档规定的操作环境中执行 `bash scripts/update.sh --ref FULL_REVIEWED_COMMIT_SHA --apply`。`npm run production:start` 仅启动已构建版本，不执行迁移。请勿覆盖正在提供服务的版本进行构建，也不要在生产环境执行开发用 schema push 或测试数据。

使用 `sudo oclr cleanup` 预览旧版本清理，再以 `sudo oclr cleanup --apply` 删除符合条件的版本。默认保留最新 3 个版本，并额外保护 `current`／`previous` 指向的版本。保留数量设置与已安装命令的升级方式详见操作指南。

[设计参考](docs/design/)中的图片与赛事日期仅为示例，不代表经批准的竞赛数据。

## 协作者

- [Sonoaoi](https://osu.ppy.sh/users/9755808)
- [Tensorera](https://osu.ppy.sh/users/19204569)

## 贡献者

- [qi_e](https://osu.ppy.sh/users/6963321)
- [Muziyami](https://osu.ppy.sh/users/7003013)

## 许可

本项目代码采用 [MIT License](LICENSE)。改编自 yumu-bot 的组件保留其 [Apache-2.0 许可](LICENSES/yumu-bot-Apache-2.0.txt)与[来源标注](docs/yumu-rating.md)。
