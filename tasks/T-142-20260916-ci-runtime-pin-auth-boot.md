---
doc-type: task
mutation: lifecycle
id: T-142
---

# T-142 CI runtime pin 升 0.1.5-rc.1 coherent 窗口 + e2e 就绪轮询兼容宿主鉴权链

状态: active
关联: CONVENTIONS 验证门禁（过程层，无 PRD 需求锚点）· DECISIONS C-079
风险等级: standard

## 背景与目标

- 背景: 东家报告 main CI 红。实证：2026-09-11 起 5 次 main push CI 全部失败（含 v0.9.0/v0.10.0/v0.10.1 发布），18/18 spec 在 `openApp` 等「窗格数据就绪」超时（最后观测 null）；CI 失败截图显示宿主页 `Failed to load plugins: 1 entry did not activate dsh-activity-pane: pending (waiting for services: uiSession, remote.session)`。
- 根因（两层）:
  1. `906da61`（适配 dsh 0.1.5）使客户端插件 `inject` 声明 `uiSession`/`remote.session`，CI pin 的 `@deepseek-ai/dsh@0.1.0-rc.7`（C-051）不提供这两个服务，插件客户端永久 pending、`[data-dsh-activity-pane]` 永不挂载。
  2. 原版 dsh 0.1.5 首页鉴权为 token→303→Set-Cookie→带 cookie 的 `/`；`e2e/boot.mjs` 就绪轮询用无 cookie 裸 fetch，在原版 runtime 上不可达——本地全套件能跑只因全局 dsh 带 `AUTH-DISABLED` 运维补丁（2026-09-11，tailscale 部署，非本仓库产物）。CI 升 runtime 后若不修轮询，将在就绪轮询处二次失败。
- 定性: 缺陷修复（CI 基础设施漂移 + 测试环境对宿主鉴权语义的隐式依赖）；runtime pin 选择记 DECISIONS C-079。
- 目标: hosted CI 在插件当前 dsh 基线（0.1.5）上恢复全绿；就绪轮询不依赖宿主鉴权补丁。
- 非目标: 不回退插件的 0.1.5 适配；不动本地运维 AUTH-DISABLE 补丁（他人运行时产物）；不改 PRD/DESIGN 需求层。

## 差距评估

- `.github/workflows/ci.yml`: pin rc7 + cutoff 2026-08-18，服务集落后插件两代。
- `e2e/boot.mjs`: 就绪轮询裸 fetch，不完成 token→cookie 链。
- 本机探针复现传递依赖漂移（C-051 同型）：cutoff 早于 dsh rc.2（09-10 14:57Z）冻成全 rc.1 组合（web 不可服务）；晚于 zod 4.6.2（09-10 21:44Z）引入行为漂移。

## 收敛方案

1. ci.yml: pin `@deepseek-ai/dsh@0.1.5-rc.1`，coherent cutoff `--before=2026-09-10T18:00:00Z`（含 dsh rc.2 内部家族、排除 zod 4.6.2），`DSH_RUNTIME_PATH` 改 `.cache/dsh-015`，cache key 换代。
2. e2e/boot.mjs: 就绪轮询走完整鉴权链——token URL `redirect: manual`，200 直接就绪（鉴权关闭部署）；303 取 `getSetCookie()[0]` 的 `name=value` 对，带 cookie 重放 `/`，200 即就绪。
3. DECISIONS C-079 记录 pin 迁移决策与被否方案。
4. README.md/README.zh-CN.md 环境要求同步为 0.1.5-rc.1（审核发现：pin 升级后的文档漂移）。
5. DECISIONS C-080 更正 C-079 影响面为「E2E 验证基建」（审核发现：R-02-003 引用系误写；DECISIONS 只追加，更正以新条目承载）。
6. boot.mjs 打磨（审核发现）：去未观测的 302 分支、超时提 `fetchProbe` 助手、超时报错携带末次观测 status。

## 测试计划

- 本机对照实验：同一探针下全局 dsh（auth-disabled）200、`.cache` 原版安装 401，锁定鉴权链差异；`--before` 三组 cutoff 实测（rc.1 冻结 / zod 4.6.2 混入 / 正确窗口）确定 18:00:00Z。
- `PATH=.cache/dsh-015rc1/bin node e2e/run.mjs card-content`（原版权限 runtime）与全局 runtime（auth-disabled）单 spec 双通过。
- `PATH=.cache/dsh-015rc1/bin pnpm test:e2e` 全量 18 spec 对 pinned runtime 回归。
- hosted 裁决：推送验证分支后 `workflow_dispatch` 触发 ci.yml（避免携带并行会话未推送提交进 main）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| 无（过程层 CI/e2e 基建变更，PRD 与 DESIGN 零改动） | 验证门禁 runtime pin 与 e2e 就绪判定环境适配 | E2E | none | PRD/DESIGN 本次无变化；验证证据已由全套件 pinned runtime 回归与 hosted workflow_dispatch 裁决承载 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：pinned runtime 下全套件绿 | `e2e/run.mjs#spec 通过`、`.github/workflows/ci.yml::dsh-015rc1` |
| 异常 | 适用：鉴权开启/关闭两种宿主部署均可就绪 | `e2e/boot.mjs#getSetCookie`、`.github/workflows/ci.yml::Verify DSH runtime` |
| 边界配置 | 适用：cutoff 窗口边界（dsh rc.2 与 zod 4.6.2 之间） | `.github/workflows/ci.yml#2026-09-10T18:00:00Z`、`DECISIONS.md::C-079` |
| 副作用 | 适用：不改产品代码与持久化，e2e 基建自洽 | `e2e/boot.mjs#redirect: "manual"`、`.github/workflows/ci.yml::pnpm verify` |

## 终态与证据

（active 期间待填）
