---
doc-type: task
mutation: lifecycle
id: T-036
---

# T-036 工作项时间线移除行级耗时对齐主会话窗口

状态: completed
关联: R-01-009 → 活动状态模型
风险等级: standard

## 背景与目标

工作项时间线镜像主会话窗口的工作项行，但插件额外在行尾显示耗时：仅工具行可由 `time - callTime` 得出，用户/Assistant/上下文行硬编码 `durationMs: null`，导致同一时间上部分行有耗时、部分行没有。东家查证原生实现后确认：主会话窗口任何行均无行级耗时（原生 `time - callTime` 仅用于聚合统计），要求对齐。PRD R-01-009/AC-07 已经东家确认改写为「不显示行级耗时」；DESIGN 产品契约同步演进；决策记录于 C-012。卡片级已运行时长（`elapsedMs`）不在本次范围内。

## 差距评估

- `src/core.mjs`：`timelineToolItem` 计算 `durationMs = time - callTime`；`timelineItemFromChatNode`（user/assistant/context）、`conversationTimeline`（partial 兜底项）、`timelineItemFromEvent`（user/assistant）均携带 `durationMs` 字段。
- `src/client.mjs`：`renderTrace` 为每行创建 `.dap-trace-time` 并按 `durationMs` 填文本；两处 `.dap-trace-time` CSS（含浅主题覆盖）。
- `scripts/check.mjs`：R-01-009/AC-07 锚点断言含 `durationMs === 2000`（耗时=time-callTime）；history 时间线夹具条目带 `durationMs: null`。
- `scripts/acceptance.mjs`：R-01-009/AC-07 人工验收步骤含「状态与耗时」。

## 收敛方案

- `src/core.mjs`：删除所有 timeline item 的 `durationMs` 字段（含 `timelineToolItem` 的耗时计算）。
- `src/client.mjs`：删除 `renderTrace` 中 `.dap-trace-time` 的创建/赋值块（含 `lastOnly` 守卫内联逻辑）与两处 `.dap-trace-time` CSS；卡片级 `fmtElapsedMs(entry.elapsedMs)` 保留。
- `scripts/check.mjs`：R-01-009/AC-07 锚点断言保留状态/摘要语义、删除耗时断言；夹具条目同步去 `durationMs`；新增「timeline item 不携带 durationMs」反向断言钉住契约。
- `scripts/acceptance.mjs`：R-01-009/AC-07 人工步骤去除「耗时」，补充「行尾无耗时显示」验收点。
- 不新增依赖；其余契约不变。

## 测试计划

- `pnpm build:client && pnpm check`：纯函数断言 + bundle 契约（含无 `.dap-trace-time` 残留断言）。
- `python3 tools/agentmap_lint.py --report`：追溯与锚定完整。
- `git diff --check`：空白检查。
- GUI 现场验收（时间线各行行尾无耗时，其余呈现不漂移）由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：时间线各行不再显示行级耗时，状态/图标/摘要呈现不变 | `scripts/check.mjs#R-01-009/AC-07`、`scripts/acceptance.mjs#R-01-009/AC-07`、`src/client.mjs::renderTrace`、GUI 现场验收 |
| 异常 | 适用：运行中/错误/停止等工作项状态显示不受移除影响 | `scripts/check.mjs#R-01-009/AC-07`、`scripts/acceptance.mjs#R-01-009/AC-07`、`src/core.mjs::timelineToolItem` |
| 边界配置 | 适用：卡片级已运行时长（elapsedMs）与统计行不受影响；`lastOnly` 增量渲染路径不再涉及时间元素 | `scripts/check.mjs#R-01-009/AC-05`、`src/client.mjs::renderTrace` |
| 副作用 | 适用：bundle 无 `.dap-trace-time` 残留；DOM 结构变化不破坏原生行匹配（匹配只用 label/summary/state） | `scripts/check.mjs#R-01-009/AC-07`、`src/client.mjs::nativeWorkItemPresentation` |

## 终态与证据

- 实现: `src/core.mjs`——`timelineToolItem` 删除 `durationMs = time - callTime` 计算，user/assistant/context/partial 兜底项与 `timelineItemFromEvent` 均不再携带 `durationMs`，`tool/result` 分支同步删除不再被读取的 `time`/`callTime` 死字段；`src/client.mjs`——`renderTrace` 删除 `.dap-trace-time` 创建/赋值块与两处 CSS（含浅主题覆盖），卡片级 `fmtElapsedMs(entry.elapsedMs)` 保留。`scripts/check.mjs` R-01-009/AC-07 锚点改为状态/摘要断言 + 反向契约钉（item 无 `durationMs`、bundle 无 `dap-trace-time`）；`scripts/acceptance.mjs` AC-07 人工步骤同步为「行尾无耗时显示」。
- 测试: `pnpm build:client && pnpm check` 全部断言通过（测试先行：改锚点后先红、实现后转绿）；`python3 tools/agentmap_lint.py --report` 通过（19 需求 / 80 AC 全追溯、全锚定）；`git diff --check` 干净。GUI 现场验收（时间线各行行尾无耗时，其余呈现不漂移）由东家按 `scripts/acceptance.mjs` 清单执行。
- DESIGN 对照: 与 DESIGN「产品契约 → 工作项时间线呈现」（工作项含 label/summary/status、不显示行级耗时、C-012）及需求追溯索引（R-01-009 → 活动状态模型 → src/core.mjs、src/client.mjs）逐条一致，无差异。
- commit: 461637d3f7cbe5d72e0a1f7f8c1cd31e37f38905
- review:
  - 审核方: 独立 reviewer 双轴（Standards 子代理 58e09826、Spec 子代理 a15c4678，code-review skill 流程）
  - 目的理解: 工作项时间线移除行尾耗时显示，对齐主会话窗口（原生任何工作项行均无行级耗时）；关联 PRD R-01-009/AC-07、DESIGN 产品契约、DECISIONS C-012；卡片级 elapsedMs 不在范围；预期验证为 `pnpm build:client && pnpm check` 与 agentmap lint（两轴均在审核前记录目的理解）。
  - 执行方式: `code-review` skill，评审基线为工作树 `git diff HEAD`（实现提交前），范围含 src/core.mjs、src/client.mjs、scripts/check.mjs、scripts/acceptance.mjs、PRD/DESIGN/DECISIONS、tasks/T-036 与构建产物一致性。
  - 问题与修复: Standards 轴 1 条判断性建议——`timelineItemFromEvent` 仍向 `timelineToolItem` 传不再被读取的 `time`/`callTime` 死字段（已修，全仓 grep 确认唯一残留）；Spec 轴无发现（残留路径、elapsedMs 保留、锚点有效性、文档同步、无 scope creep 逐项核实）。
  - 复审结论: Standards 轴复审通过、无遗留，双轴最终均通过。
