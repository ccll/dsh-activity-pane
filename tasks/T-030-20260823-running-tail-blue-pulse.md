---
doc-type: task
mutation: lifecycle
id: T-030
---

# T-030 运行中会话时间线尾项提升为执行中蓝闪标志

状态: active
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
