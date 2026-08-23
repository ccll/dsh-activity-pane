---
doc-type: task
mutation: lifecycle
id: T-030
---

# T-030 运行中会话时间线尾项提升为执行中蓝闪标志

状态: completed
关联: R-01-009/AC-10 / 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家观测：运行中会话的最新步骤圆点有时持续蓝闪（think 阶段），有时只闪一下即变绿。查证结论：蓝点仅由 live 工作项（`partial`/`runningCalls`）承载，工具定案到下一 live 项出现之间的空窗期，尾部为已定案绿色项。东家确认需求：只要 agent 在运行，最新步骤圆点恒为蓝闪，作为 agent 正在工作的标志；等待用户行动时不闪；尾部为用户输入项时保持绿色。PRD R-01-009/AC-10 与 DESIGN 已演进并经东家确认。

## 差距评估

- `src/core.mjs` `conversationTimeline`：无 live 项时直接返回已定案 items，无「运行中提升尾项」规则。
- `src/client.mjs` `renderTrace`：原生行 `data-state="ok"` 会把核心派生的 running 覆盖回 done（当前选中会话恰好命中此路径），需调整优先级。
- `scripts/check.mjs`：无 R-01-009/AC-10 锚点。

## 收敛方案

- core：`conversationTimeline` 在无 live 项、快照 `running === true`、`pending` 为空且时间线无其他执行中项时，将尾部 `status === "done"` 且 `kind !== "user"` 的工作项克隆提升为 `running`（不改原引用，保 memo 语义）；新增纯函数 `mergeTraceStatus` 承载渲染层状态合并。
- client：`renderTrace` 经 `mergeTraceStatus` 合并状态，核心派生的 `running` 优先于原生行 `data-state`；核心非 running 时保持原生优先旧语义。
- 测试先行：check.mjs 新增 R-01-009/AC-10 锚点（提升、pending 不提升、非运行不提升、error/stopped/用户尾项不提升、克隆不改原引用）。

## 测试计划

- `scripts/check.mjs`：R-01-009/AC-10 锚点断言上述正反用例。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：运行中无 live 项时尾部 done 工具/assistant 项提升 running | `scripts/check.mjs#R-01-009/AC-10`、`src/core.mjs::conversationTimeline` |
| 异常 | 适用：pending 非空、running 非 true、尾项 error/stopped 时不提升 | `scripts/check.mjs#R-01-009/AC-10`、`src/core.mjs::conversationTimeline` |
| 边界配置 | 适用：尾项为用户输入项不提升；空时间线保持空；提升为克隆不改原引用 | `scripts/check.mjs#R-01-009/AC-10`、`src/core.mjs::conversationTimeline` |
| 副作用 | 适用：live 项存在时行为不变；原生行两态文字/图标匹配不回归 | `scripts/check.mjs#R-01-009/AC-07`、`scripts/check.mjs#R-01-012/AC-03`、`src/client.mjs::renderTrace` |

## 终态与证据

- 实现: `src/core.mjs` `conversationTimeline` 新增提升闸口（快照 running 且无 pending、无 live 项、时间线无其他执行中项时，尾部 done 非用户项克隆提升为 running）；新增纯函数 `mergeTraceStatus` 承载渲染层状态合并（核心 running 优先于原生行 data-state，非 running 保持原生优先旧语义）；`src/client.mjs` `renderTrace` 改经 `mergeTraceStatus` 合并；`.dsh-plugin/client.js` 已重新生成。
- 测试: `node scripts/check.mjs` 通过（R-01-009/AC-10 锚点：提升/非运行/pending/error/stopped/用户尾项/live 在场/中部已有执行中项反例/克隆引用不复用，及 mergeTraceStatus 六条语义断言 + bundle 契约）；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过。`scripts/acceptance.mjs` 补 AC-10 人工验收步骤。
- DESIGN 对照: PRD R-01-009 新增 AC-10；DESIGN 产品契约工作项时间线呈现与活动状态模型模块条目同步（提升闸口、克隆语义、mergeTraceStatus 合并优先级）；需求追溯索引既有 R-01-009 行保持准确。
- commit: 4c1d6f1
- commit: 4df1e48
- review:
  - 审核方: Standards 子代理 `481ce897-90b3-4acb-8d26-a591144028e0`；Spec 子代理 `a50c9af4-a548-4f44-b662-28626f02ccbd`。
  - 目的理解: 实现 T-030——运行中会话时间线尾项恒为蓝闪工作标志（R-01-009/AC-10，东家确认语义：等待用户行动不闪、尾部用户输入项保持绿、error/stopped 标识优先、提升为克隆保 memo）；锚定 R-01-009/AC-10 与 DESIGN 产品契约对应条目。
  - 执行方式: `code-review` skill；固定基线 `e85c95e`，范围 `git diff e85c95e...HEAD`；Standards/Spec 双轴并行，复审基线 4df1e48。
  - 问题与修复: Standards 一项硬性（client.mjs 死赋值 + 误删 data-icon 行）与 Spec 三项（闸口未排除时间线中部已有执行中项、渲染层优先级改动无自动化锚点、status 缺省被强制 running 改变旧语义）均在 4df1e48 修复并加回归锚点；Spec 的 data-icon 移除 finding 与 Standards 同源，同次消解。
  - 复审结论: Standards 复审通过；Spec 复审通过，无遗留 finding。
