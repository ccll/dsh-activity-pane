---
doc-type: task
mutation: lifecycle
id: T-142
---

# T-142 CI runtime pin 升 0.1.5-rc.1 coherent 窗口 + e2e 就绪轮询兼容宿主鉴权链

状态: completed
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

1. ci.yml: pin `@deepseek-ai/dsh@0.1.5-rc.1`，coherent cutoff `--before=2026-09-10T18:00:00Z`（含 dsh rc.2 内部家族、排除 zod 4.6.2），`DSH_RUNTIME_PATH` 改 `.cache/dsh-015`，cache key 换代。已知取舍：安装目录名与 cache key 的 `dsh-015rc1` 粒度不一致（Standards 轴低危发现）——保持 hosted run 35097179529 已验证的路径配置优先于命名美化，后续 runtime 换代时一并统一。
2. e2e/boot.mjs: 就绪轮询走完整鉴权链——token URL `redirect: manual`，200 直接就绪（鉴权关闭部署）；303 取 `getSetCookie()[0]` 的 `name=value` 对，带 cookie 重放 `/`，200 即就绪。
3. DECISIONS C-079 记录 pin 迁移决策与被否方案。
4. README.md/README.zh-CN.md 环境要求同步为 0.1.5-rc.1（执行自查与 Spec 轴审核共同发现：pin 升级后的文档漂移）。
5. DECISIONS C-080 更正 C-079 影响面为「E2E 验证基建」（双轴审核发现：R-02-003 引用系误写；DECISIONS 只追加，更正以新条目承载）。
6. boot.mjs 打磨（双轴审核发现）：去未观测的 302 分支、超时提 `fetchProbe` 助手、超时报错携带末次观测 status。
7. 残余风险（记录在案）：就绪轮询按 spec 口径仅取 `getSetCookie()[0]` 的首对 name=value——若宿主 303 一次下发多个 Set-Cookie 且鉴权 cookie 非首个，轮询将超时；hosted run 35097179529 已验证现网单 cookie 场景，风险仅在宿主鉴权行为变化时显形。

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

- 实现: ci.yml runtime pin 升 `@deepseek-ai/dsh@0.1.5-rc.1`，coherent cutoff `--before=2026-09-10T18:00:00Z`（含 dsh rc.2 内部家族、排除 zod 4.6.2），cache key 换代、`DSH_RUNTIME_PATH` 保持 hosted 已验证的 `.cache/dsh-015`；boot.mjs 就绪轮询走完整鉴权链（token URL `redirect: manual`，直接 200 即就绪，303 取 `getSetCookie()[0]` 首对 name=value 带 cookie 重放 `/`，`fetchProbe` 统一 5s 超时，超时报错携带末次观测 status）；README 双语环境要求同步 0.1.5-rc.1；DECISIONS 追加 C-079（pin 迁移决策）与 C-080（更正 C-079 影响面为「E2E 验证基建」）。
- 测试: 本机对照实验锁定鉴权链差异（同一探针：全局 auth-disabled 200 / 原版安装 401）；`--before` 三组 cutoff 实测确定 18:00:00Z 窗口（全 rc.1 组合 web 不可服务、过晚混入 zod 4.6.2）；`card-content` 双 runtime（原版权限安装与 auth-disabled 全局）单 spec 通过；`PATH=.cache/dsh-015rc1/bin pnpm test:e2e` 全量 18 spec 通过（403362ms）；hosted 裁决 workflow_dispatch run 35097179529（head ca484de，两文件修复子集，18 步全 success）——同一此前连挂 5 次的树转绿；终态 ci.yml 与该 run 验证配置逐字节一致（Spec 轴三审核验 blob 448e841）。
- DESIGN 对照: PRD/DESIGN 零改动；「E2E 验证基建」为 DESIGN 既有子系统规范名（DESIGN.md:378），C-079/C-080 影响面引用与其一致，无追溯索引变化；非目标（不回退 0.1.5 适配、不动运维 AUTH-DISABLE 补丁）未越界。
- commit: 30f54e4
- review:
  - 审核方: code-review skill（Standards/Spec 双轴并行独立 reviewer 子代理，fixed point = 9909024 对 f2cf062；复审 f2cf062..31383c3，三审 f2cf062..30f54e4）
  - 目的理解: main CI 自 2026-09-11 起 5 次全红的根因修复——①CI pin 的 rc7 缺少插件 0.1.5 适配后声明的 `uiSession`/`remote.session` 服务致插件 pending、窗格不挂载；②原版 dsh 0.1.5 首页鉴权链使 boot.mjs 无 cookie 轮询不可达（本地依赖运维 AUTH-DISABLE 补丁的隐式假设）；约束为不回退 0.1.5 适配、不动运维补丁、PRD/DESIGN 零改动、runtime pin 的 coherent 口径（C-051 先例）。
  - 执行方式: code-review skill 双轴评审（Standards 对照 AGENTS.md 工程原则 + CONVENTIONS + Fowler 基线；Spec 对照 T-142 背景与目标/收敛方案/测试计划），独立并行后聚合；复审与三审逐项核验修复 hunks、task/实现一致性与证据链。
  - 问题与修复: ① C-079 影响面误引 R-02-003（双轴同报，硬违规）→ 追加 C-080 更正为「E2E 验证基建」（只追加纪律下不改原文）；② boot.mjs 兼收未观测的 302（Spec）→ 删除，与注释/C-079 口径一致；③ README 双语 rc.7 漂移（Spec）→ 同步 0.1.5-rc.1；④ 探针超时魔法数两现（Standards）→ `fetchProbe` 助手；⑤ 超时报错缺末次观测（Standards）→ `lastStatus` 入报错；⑥ 目录名与 cache key 粒度不一（Standards）→ 先改名 `.cache/dsh-015rc1`，Spec 复审指出同名 key 换恢复路径未经 hosted 验证且回归已知取舍 → 按其推荐方案 A 回退 `.cache/dsh-015` 并将粒度不一致记为已知取舍；⑦ 提交承诺的多 Set-Cookie 残余风险未记（Spec 复审）→ 补记收敛方案 7（失败条件/hosted 单 cookie 验证依据/触发条件三要素）。
  - 复审结论: 双轴三审通过——Standards 轴 5 findings 全闭环（1 经 C-080 更正、3 代码修复、1 转已知取舍）；Spec 轴 3+2 findings 全闭环；唯一遗留为收敛方案 7 记录在案的已知接受风险（宿主多 Set-Cookie 行为变化时需复核），非违规、无新增测试缺口。
