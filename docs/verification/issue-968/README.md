# #968 开发人员本地端口列表

需求：[OCLR-website #968](https://github.com/OCLR-dev/OCLR-website/issues/968)。
工作分支：`dev端口列表设置`；基准 upstream/main：
`52e869c1f2c3fddc351b23cdafb2ca544db0980c`。

## 行为与兼容

- 开发者可在页面添加、移除端口；默认允许自行选择 1–65535 的有效端口，
  每个令牌保存 1–20 个不重复端口。尚未添加的输入会阻止创建，避免遗漏。
- 确认 Origin 是规范的 HTTP/HTTPS 回环来源后按有效端口匹配。
  `localhost`、`127.0.0.1`、`[::1]` 等价；HTTP/HTTPS 同端口等价。
  外部来源、伪装域名、路径、凭据和未选端口仍被拒绝。
- `OCLR_DEVELOPER_PORTS` 可由运维显式限制可用端口；未设置时兼容已有
  `OCLR_DEVELOPER_ORIGINS` 配置。显式空值继续停用签发与浏览器 CORS。
  没有这两项配置时，开发者可自行添加任意有效本地端口。
- `0087_developer_token_ports` 增加可空的整数数组；旧令牌从原 origin
  推导单个端口，旧 origin 和审计事件不改写。新签发记录完整端口列表。
- 保留显式 Developer 授权、本人管理、同源管理请求、只读 scopes、
  生命周期、撤销、配额和事务审计。Streaming 仍使用自身完整来源匹配规则。

## 界面预览

以下由真实 `DeveloperAccess` 组件及项目 MainSheet 样式渲染，使用合成后端
地址与已撤销的示例记录；没有真实用户、数据库内容或令牌。

- [端口列表区域](port-list.png)
- [桌面浅色完整表单](desktop-light.png)
- [手机深色完整表单](mobile-dark.png)

实际浏览器检查了 1200px 桌面、390px 手机，以及 320px 下的浅色和深色：
无横向溢出、无页面脚本错误；移除按钮点击区域至少 44×44px。

## 本地验证（2026-11-06）

Node.js 24.15.0、npm、PostgreSQL 17。使用本次创建的独立
`oclr-ports-test-968` 容器与 `oclr_test_ports` 数据库；迁移只作用于此测试目标。

| 检查 | 实际结果 |
| --- | --- |
| `npm ci` | 成功 |
| `npm run db:migrate` | 独立测试库迁移成功 |
| `npm run check` | lint、类型、历史关系生成检查通过 |
| `npm test` | 首跑 295 文件：294 通过、1 失败；2582 项通过、1 项失败，236 秒 |
| 失败修正后的定向复测 | `edition-migration.test.ts` 34 项全部通过，10.53 秒 |
| Developer / Streaming 定向检查 | 5 文件、39 项通过 |
| `npm run i18n:extract` / `npm run test:i18n` | 三语已同步；4 项通过 |
| `npm run read-api:check` | 59 个合约、185 行覆盖清单同步；8 项通过 |
| `npm run build` | 生产构建通过 |
| `npm audit --omit=dev` | 0 项漏洞 |
| `npm run test:components -- tests/components/developer-access.spec.ts` | Chrome 桌面／手机 4 项通过，3.2 秒 |
| 定向 Prettier / `git diff --check` | 通过 |
| 完整 E2E | 未运行（太慢）；本次仅运行用户请求的界面预览及聚焦组件交互检查 |

首跑唯一失败：旧 Streaming 升级测试用 `SELECT *` 比较升级前后完整对象，
新增的 `ports: null` 使对象形状不同。修正预期以明确允许这个新字段，同时
继续逐一保留原凭据字段的相等断言。随后只复测受影响的迁移测试，未重复
运行全套。其他 294 个测试文件均在首跑通过。

已有单元／集成测试继续覆盖鉴权、撤销和传输规则；新增覆盖多端口保存、
回环别名、旧令牌和非法列表。组件测试补充实际输入、Enter、添加／移除、
未提交输入、待响应禁用和提交列表的交互。原 E2E 仅适配控件操作，无新增
E2E 场景或样式矩阵。

## CI 与审阅

基准提交的 [CI 42226043984](https://github.com/OCLR-dev/OCLR-website/actions/runs/42226043984)
中 `verify`、`build`、`check` 成功；浏览器 jobs 按 checks 范围跳过。
这是基准提交的 CI，不是本次改动的 CI。本次尚未推送或创建 PR。

等待需求方审阅界面和新中文文案后，再向主库 main 提交包含 `Closes #968`
的 PR。没有部署、真实角色授权或凭证签发；后端更新需通过正常迁移流程应用
0087。
