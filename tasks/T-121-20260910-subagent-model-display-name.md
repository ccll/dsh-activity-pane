---
doc-type: task
mutation: lifecycle
id: T-121
---

# T-121 子代理卡模型显示名解析：溯源 id 经目录分组转为显示名

状态: completed
关联: R-01-012 → 活动状态模型
风险等级: standard

## 背景与目标

- 背景: 东家演示反馈（T-120 实现后）：子代理卡右上角显示的是模型 id（`glm-5.3-flash-512k`）而非显示名（`(6000D) GLM-5.3-Flash 512K`），主会话卡显示的则是显示名——同屏两种口径，违背 AC-17「显示该子代理使用的模型名称」与「主会话与子代理使用不同模型时两者应可区分」的一致呈现意图。
- 根因: T-120 的溯源链取自 `assistant/message` 事件的 `message.source.model`，该值是 provider 侧模型 id；主会话的显示名由模型目录分组（`sessions.models` / `modelDirectories` 返回的 `groups[].models[].{id, name}`）解析而来，子代理因 `agent-busy` 围栏拿不到目录 RPC，T-120 未补显示名解析环节。
- 定性: 缺陷修复（PRD 措辞不变，AC-17 本意即「模型名称」）；机制层由 DESIGN 同步一条目录解析描述。
- 目标: 子代理卡显示目录分组中的显示名；目录未覆盖该 id 时回退显示原始溯源 id（诚实降级，不冒充）。
- 非目标: 不改主会话模型路径；不为子代理新增目录订阅或轮询（R-02-004）；不改 AC-18 空白语义。

## 差距评估

- core.mjs: 无目录分组 → 显示名索引的纯函数。
- client.mjs: 目录分组数据只服务于主会话 `modelMetadata`，未留存部署级 id→显示名索引；子代理条目渲染时直接显示溯源 id。

## 收敛方案

1. core.mjs: 新增纯函数 `catalogModelNames(groups)`——把 `ModelProviderGroup[]` 展平为 `{[modelId]: displayName}`，畸形条目跳过，非数组输入返回空索引。
2. client.mjs: 维护部署级 `catalogNames` 索引；主会话的两条既有目录到达路径（目录 store 订阅 `syncFromDirectory`、一次性 `api.models` RPC）就地收割分组；渲染时对 `kind === "subagent"` 的条目做 `catalogNames[id] ?? id` 解析。
3. DESIGN.md: 「模型上下文」机制与产品契约各补一句目录解析描述（同次变更，本 task 记录测试影响）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-012/AC-17 | 修正：显示名口径（id → 目录显示名） | UNIT | update | `scripts/check.mjs#R-01-012/AC-17` 新增 `catalogModelNames` 展平/畸形跳过/空索引单测 + 四个源码契约钉子（无原型索引、双路径收割、渲染解析与回退）；溯源提取单测不变 |
| R-01-012/AC-18 | 保持：目录未覆盖回退原始 id，不冒充 | UNIT | update | `scripts/check.mjs#R-01-012/AC-18` 空索引回退断言；AC-18 既有空白/不冒充单测不变 |
| DESIGN | 机制描述同步（目录解析一句） | UNIT | update | 同次变化由本 task 记录：DESIGN.md「模型上下文」与产品契约两处与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：子代理卡显示目录显示名 | `scripts/check.mjs#R-01-012/AC-17`（catalogModelNames 展平单测 + 渲染契约钉子）、`scripts/acceptance.mjs::R-01-012/AC-17` |
| 异常 | 适用：目录缺失/未覆盖回退原始 id、畸形条目跳过 | `scripts/check.mjs#R-01-012/AC-18`（空索引与畸形输入单测）、`scripts/acceptance.mjs::R-01-012/AC-18` |
| 边界配置 | 适用：主会话卡显示口径不变、空目录不阻断渲染 | `scripts/check.mjs#R-01-012/AC-16`（目录订阅既有断言）、`scripts/acceptance.mjs::R-01-012/AC-16` |
| 副作用 | 适用：渲染签名稳定、既有 E2E 不回归 | `e2e/specs/card-content.mjs::R-01-012/AC-01`、`e2e/specs/session-lifecycle.mjs::R-01-013/AC-12` |

## 测试计划

- `scripts/check.mjs` 新增 `catalogModelNames` AC 锚定单测（展平、畸形跳过、空索引）。
- `pnpm verify:fast` 编辑循环；`pnpm verify` 全量回归。
- `.dsh-plugin/client.js` 随实现重建。

## 终态与证据

状态: completed

- 实现: core.mjs 新增纯函数 `catalogModelNames(groups)`——把目录分组展平为 `{[modelId]: displayName}` 索引，畸形分组/条目跳过，非数组输入返回空索引。client.mjs 维护部署级无原型索引 `catalogNames`（`Object.create(null)`，模型 id 恰为 "constructor" 等继承键名时不穿透回退），经主会话既有两条目录到达路径就地收割（目录 store 订阅 `syncFromDirectory`、一次性 `api.models` RPC——在 `modelLive` 早退前收割，被丢弃的晚到快照仍供索引），渲染时对 `kind === "subagent"` 条目做 `catalogNames[id] ?? id` 解析，目录未覆盖回退原始溯源 id；无新增订阅或轮询（R-02-004）。
- 测试: `scripts/check.mjs#R-01-012/AC-17、AC-18` 新增 `catalogModelNames` 三组纯函数单测（多分组展平、畸形跳过不抛错、空索引回退）与四个源码契约钉子（无原型索引、store 订阅收割、RPC 收割、渲染解析与回退逐字钉住）。`pnpm verify:fast` 通过；`pnpm verify` 全量 13/13 E2E 通过（8774bf1 后一次完整重跑全绿；中途单 spec 失败经确认为负载偶发，重跑即消）。`.dsh-plugin/client.js` 随实现重建并同提交暂存。
- DESIGN 对照: 「模型上下文」机制（溯源 id 为 provider 侧值，显示名经目录分组就地解析，主/子会话共享同一部署目录，未覆盖回退原始 id）与产品契约「轮内状态数据」（`catalogModelNames` 展平索引语义）两处与实现一致；PRD 措辞不变（AC-17 本意即「模型名称」），DOMAIN 无新术语。
- commit: 6ce3448
- commit: 8774bf1
- review:
  - 审核方: Standards reviewer `dda2b8bd-9de5-4a70-831d-8b8a66e1e791`；Spec reviewer `757d4dcd-6e33-492d-bc20-c9507e9206f6`（双轴并行，各两轮）。
  - 目的理解: 兑现东家「子代理卡显示目录显示名而非 provider 模型 id」的缺陷修复目标——AC-17 本意即「模型名称」，主/子同屏口径须一致；约束为无新增订阅/轮询（R-02-004）、目录未覆盖时诚实回退不冒充（AC-18）。
  - 执行方式: `code-review` skill 双轴并行审核（基线 d143dd9，`git diff d143dd9...6ce3448`）→ 修复提交 8774bf1 → 双轴各自复审（`git diff 6ce3448...8774bf1`）。
  - 问题与修复: Spec 1 项实质缺口（task 承诺的渲染契约钉子未落）→ 补四个源码契约钉子；Standards 2 项判断空间意见（裸 `{}` 原型链键穿透、冗余 `?? []`）→ `Object.create(null)` 加固 + 冗余守卫消除；standards 第 3 项（跨 scope 累加器仲裁）确认为基线外信息提示，与 task 非目标自洽，不改。
  - 复审结论: Standards「复审通过」（无标准违规残留，契约钉子与既有风格一致）；Spec「缺口闭合，无残留」（`Object.create(null)` 为正向加固非 scope creep）。非阻塞备注：源码字符串钉子对将来重构较脆，属仓库既有手法固有属性，test-impact 门禁保证后续改动重新审视。
- 测试影响备注: 首轮 `pnpm verify` 出现单 spec 失败，完整重跑 13/13 全绿且失败输出被截断无法归因——按偶发抖动记录；如复现需留存日志归因后再关类似任务。
