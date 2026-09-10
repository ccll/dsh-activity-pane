---
doc-type: task
mutation: lifecycle
id: T-120
---

# T-120 子代理卡信息增强：模型溯源、回合进度与统计行

状态: completed
关联: R-01-009、R-01-012 → 活动状态模型
风险等级: standard

## 背景与目标

- 背景: 子代理卡当前只显示标题、单行时间线与（空置的）模型区——主会话卡具备的右上角模型、回合进度条与 tok/s/缓存命中率/耗时统计行均缺失。东家要求补齐以便一屏分辨主/子会话模型差异并掌握子代理进度。
- 根因（已查 DSH 宿主源码）: 子代理会话的 Agent-bound 模型 RPC（`sessions.models`）被宿主以 `agent-busy` 拒绝（SubagentSessionOwnership 围栏），模型目录订阅亦基于该 RPC，主会话模型路径对子代理完全不可用；进度与统计数据（锚点状态机、列表投影 `tokenUsage`/`sessionStats`）已随既有订阅可用，仅渲染层未计算未绘制。
- 目标: ① 子代理卡右上角显示该子代理模型名称（取自其会话日志最近一条 `assistant/message` 的 `message.source.model` 溯源，经既有 history 通道一次性提取，无新增轮询）；② 运行中子代理卡显示与主会话运行卡同口径的进度条、百分比与统计行；③ 非运行子代理卡冻结统计与最近回合耗时、隐藏进度条。
- 东家确认决策: 子代理事件流无 reasoning level，子代理卡只显示模型名、reasoning 保持空白；非运行子代理卡冻结统计+最近耗时、隐藏进度条。
- 非目标: 不改主会话卡模型来源（模型目录服务）；不改 R-01-020 累计运行时长的子代理豁免；不改数量徽标的子代理豁免；不为子代理增加订阅或轮询。

## 差距评估

- core.mjs: `detailLoadPlan` 对子代理恒不发 models 读取且无 history 模型触发；无模型溯源提取函数。
- client.mjs: `cardChildren("subagent")` 骨架无进度行与统计行；渲染循环仅对 `kind === "running"` 计算进度/统计；子代理 `detail.model` 被提前置空阻断溯源提取。
- PRD: R-01-009/R-01-012 无子代理卡验收点。

## 收敛方案

1. PRD: R-01-012/AC-17（子代理卡右上角模型溯源）与 AC-18（缺失时空白、不显示 reasoning）；R-01-009/AC-14（运行中子代理卡进度+统计行）与 AC-15（非运行冻结统计、隐藏进度条）。DOMAIN 扩展「模型上下文」词条；DESIGN 同步条目结构、关键机制、产品契约与追溯索引。
2. core.mjs: 新增纯函数 `modelFromHistoryEvents(history)`（尾扫最近一条携带 `message.source.model` 的 `assistant/message` 事件）与 `chatLatestAssistantSettled(snapshot)`（快照最新助手节点已定案即触发）；`detailLoadPlan` 在「快照最新助手节点已定案或不在运行中」时为无模型的可见子代理安排一次 history 读取，每次可见期至多一次（`modelReadDone` 记账，随可见性清理重置）。
3. client.mjs: history 读取落地时为子代理提取 `detail.model`（已有 history 时直接复用，不重读）；子代理卡骨架补进度行与统计行；渲染循环对 subagent 条目按锚点计算运行中进度/统计（并保存 `lastRuntimeStats`）、非运行时冻结统计并经 `lastTurnDuration` 显示最近回合耗时；模型区在溯源读取在途时显示加载指示；运行时钟条件纳入运行中子代理卡。
4. 测试先行: `scripts/check.mjs` 新增 AC 锚定单测；`pnpm verify` 全量回归。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-012/AC-17 | 新增：子代理卡右上角模型溯源 | UNIT | add | `scripts/check.mjs#R-01-012/AC-17` `modelFromHistoryEvents` 尾扫命中/畸形条目单测 + `chatLatestAssistantSettled` 触发信号单测 + client 渲染契约钉子 |
| R-01-012/AC-18 | 新增：无溯源时空白、不冒充 | UNIT | add | `scripts/check.mjs#R-01-012/AC-18` 空事件/无 assistant 消息返回 null、plan 触发单次不热重试 |
| R-01-009/AC-14 | 新增：运行中子代理卡进度+统计 | UNIT | add | `scripts/check.mjs#R-01-009/AC-14` 锚点/进度曲线纯函数复用单测 + client 骨架/渲染契约钉子 |
| R-01-009/AC-15 | 新增：非运行冻结统计、隐藏进度 | UNIT | add | `scripts/check.mjs#R-01-009/AC-15` `mergeRuntimeStats` 冻结口径行为断言 + client 契约钉子；逐帧冻结观感由 `scripts/acceptance.mjs::R-01-009/AC-15` 人工验收 |
| DESIGN | 条目结构/关键机制/产品契约/追溯索引同步 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 四处与实现同步 |
| R-01-012/AC-17 | 措辞澄清：模型位收敛为「标题行右缘」（东家反馈布局） | UNIT | none | 同次修改的 active task 记录：位置语义由既有骨架契约断言（`row.append(... model ...)`）承载，行为无变化，仅 PRD 文字与实现对齐 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：子代理卡显示模型、进度与统计 | `scripts/check.mjs#R-01-012/AC-17`、`scripts/check.mjs#R-01-009/AC-14`、`scripts/acceptance.mjs::R-01-012/AC-17`、`scripts/acceptance.mjs::R-01-009/AC-14` |
| 异常 | 适用：history 读取失败降级空字段、无溯源不冒充 | `scripts/check.mjs#R-01-012/AC-18`、`scripts/acceptance.mjs::R-01-012/AC-18` |
| 边界配置 | 适用：子代理暂停冻结、主会话卡行为不变、无 history 不重读 | `scripts/check.mjs#R-01-009/AC-15`、`scripts/acceptance.mjs::R-01-009/AC-15` |
| 副作用 | 适用：签名去重、渲染稳定、既有运行卡/等待卡/最近卡不回归 | `e2e/specs/card-content.mjs::R-01-012/AC-01`、`e2e/specs/session-lifecycle.mjs::R-01-013/AC-12` |

## 测试计划

- `scripts/check.mjs` 新增 AC 锚定单测（模型溯源提取、detailLoadPlan 触发、subagent 条目统计/进度字段）。
- `pnpm verify:fast` 编辑循环；`pnpm verify` 全量（含 E2E 13 spec 回归）。
- `.dsh-plugin/client.js` 随实现提交重建暂存。

## 终态与证据

状态: completed

- 实现: core.mjs 新增 `modelFromHistoryEvents`（history 尾扫最近一条携带 `message.source.model` 的 `assistant/message`）与 `chatLatestAssistantSettled`（快照最新助手节点已定案触发信号，尾扫即停近 O(1)）；`detailLoadPlan` 增加 `subagentModelReadNeeded` 入参与 `subagentModelRead` 出参，在「快照最新助手节点已定案或不在运行中」时为无模型的可见子代理安排一次 history 读取（`modelReadDone` 记账，随可见性清理重置）。client.mjs 子代理卡骨架改为标题行（dot/title/model/total-time）+ 进度行（共享 `makeProgressRow`，初始隐藏）+ 统计行（共享 `makeStatsRow`）；渲染分支按锚点计算运行中进度/统计（保存 `lastRuntimeStats`），非运行时冻结统计并经共享 `memoTurnDuration` 显示最近回合耗时、进度行整行隐藏；模型区在溯源读取在途时显示加载指示；运行时钟条件纳入运行中子代理卡。并行 0.1.5 迁移期间同工作区的中间态已由其属主回退，本实现落回经验证的 `connection.api.sessions.history` 溯源通道。
- 测试: `scripts/check.mjs#R-01-012/AC-17、AC-18`（溯源尾扫命中/裸事件/畸形条目/空事件不冒充 + `chatLatestAssistantSettled` settled/running/无快照/空窗口四态单测 + detailLoadPlan 触发单次与不重试断言）；`scripts/check.mjs#R-01-009/AC-14、AC-15`（锚点/进度曲线纯函数复用、`mergeRuntimeStats` 冻结口径行为断言、骨架/渲染/时钟契约钉子）；`scripts/acceptance.mjs::R-01-012/AC-17、AC-18、R-01-009/AC-14、AC-15` 人工验收步骤新增。`pnpm verify` 全量 13/13 E2E 通过两次（06c4258 与最终态各一次）。
- DESIGN 对照: DESIGN.md 条目结构（subagent 条目 progress/统计/溯源模型）、关键机制「模型上下文」（溯源来源、触发时机、每可见期至多一次）、运行卡渲染期字段、产品契约「轮内状态数据」、追溯索引（R-01-009/R-01-012 落点标注子代理卡覆盖）与实现一致；DOMAIN「模型上下文」词条收敛为纯术语定义。
- commit: 06c4258
- commit: c364875
- commit: 10b75ff
- review:
  - 审核方: Standards reviewer `80e00a86-5378-42c3-b169-53b4e5f3d363`；Spec reviewer `9d35e88b-6b30-4a8b-a0a2-2ab86aa93250`（双轴并行，各自两轮）。
  - 目的理解: 兑现东家「子代理卡补齐模型/进度/统计」的验收目标——模型经 history 溯源（宿主 agent-busy 围栏拒绝 models RPC 的根因已查证）、进度与统计与运行卡同口径、非运行冻结语义经东家确认；约束为不引入轮询（R-02-004）、主会话模型路径与 R-01-020/徽标的子代理豁免不变。
  - 执行方式: `code-review` skill 双轴并行审核 → 修复提交 c364875 → 双轴各自复审（`git diff 06c4258...c364875`）→ 微瑕与 AC-17 措辞收敛提交 10b75ff → 双轴终审确认（`git diff c364875...10b75ff`）。
  - 问题与修复: Standards 1 项硬性（顺带删除宿主侧契约分节注释）已还原；smell 5 项（memo/进度骨架/渲染复制、参数结伴、命名、断言风格）经提取四 helper、options 对象、`subagentModelRead` 更名消除，断言风格按文件惯例保留；Spec 指出触发信号可能被 4 行折叠窗口延迟 → 升级为 `chatLatestAssistantSettled` 直读快照最新助手节点；AC-17 措辞漂移经 PRD 收敛为「标题行右缘」；「四态」表述更正为 settled/running/无快照/空窗口。复审终论：Standards「复审通过，可按流程关闭」；Spec「终审通过，可以关闭 T-120」。
  - 复审结论: 双轴终审通过，无新发现；遗留非阻塞项（无）。
- 测试影响备注: `modelReadDone` 为每可见期单次尝试记账，随 `pruneInvisibleEntries` 可见性清理重置——持续可见期间失败不热重试与主会话模型失败语义一致，Spec 复审确认为规格未细化处的已记录取舍。
