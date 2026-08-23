---
doc-type: task
mutation: lifecycle
id: T-036
---

# T-036 工作项时间线移除行级耗时对齐主会话窗口

状态: active
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

（待关闭时填写）
