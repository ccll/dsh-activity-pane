---
doc-type: task
mutation: lifecycle
id: T-028
---

# T-028 废弃参数白名单摘要，fallback 文字全量对齐主会话窗口

状态: active
关联: R-01-009/AC-04、AC-07；R-01-012/AC-03 / 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

时间线 fallback（非选中态）与原生行（选中态）文字两套来源，部分动作两态不一致：todo_write/ask_user_question 标题裸名且摘要为空、cordis/未知工具摘要缺失、错误态摘要不同、工作区内绝对路径未相对化。东家确认白名单非其要求（C-011），可展示原始命令，fallback 文字全量对齐主会话窗口语义。PRD R-01-009/AC-04、AC-07 已改写，DESIGN 已同步。

## 差距评估

- `src/core.mjs` `summarizeToolArguments` 为白名单实现（TRACE_DETAIL_KEYS），需重写为镜像原生 `deriveSummary`（分 variant 参数键、首字符串参数兜底、argsRaw 首行、firstLine）。
- `timelineToolItem` 缺：relativizeToCwd（需会话 cwd 入参）、错误态输出首行、todo 进度摘要、ask 状态摘要、others variant 的 `工具名 · ` 前缀。
- `TOOL_LABELS` 缺 todo_write「更新任务清单」、ask_user_question「提问」。
- `src/client.mjs` `nativeRowIndex` 的 `think`/`context` 只索引首个同类行，多个 Think/context 工作项错配到首行摘要。
- `scripts/check.mjs` 白名单断言（R-01-009/AC-04、AC-07 段）与 `scripts/acceptance.mjs` 人工步骤需改写为新语义。

## 收敛方案

- core：`summarizeToolArguments(name, argsRaw, cwd)` 镜像原生 `deriveSummary` + `relativizeToCwd` + others 前缀；`timelineToolItem` 增加 cwd 入参（由调用侧会话快照提供），摘要优先级 = 错误态输出首行 → callView.description（terminal 语义）→ args 派生；todo/ask 摘要按原生 TodoRow/AskQuestionRow 逻辑复刻（中文案硬编码，与现有 statusLabels 一致）。
- client：Think/context 原生行按工作项身份匹配（byKey 未命中且同类多行时按顺序分配，单行维持现状），不再共用首行。
- 测试先行：check.mjs 新锚点（命令摘要、others 前缀、todo/ask 摘要、错误首行、路径相对化）锚定 R-01-009/AC-04、AC-07 与 R-01-012/AC-03。

## 测试计划

- `scripts/check.mjs`：改写 R-01-009/AC-04（命令可展示、分 variant 键、兜底链）、AC-07（摘要语义一致）断言；新增 R-01-012/AC-03 两态文字一致锚点。
- `scripts/acceptance.mjs`：人工步骤改为「bash 显示原始命令首行、todo/ask 显示状态摘要、选中/非选中切换文字不漂移」。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：bash 显示原始命令首行、todo_write/ask 状态摘要、错误态输出首行、路径相对化 | `scripts/check.mjs#R-01-012/AC-03`、`src/core.mjs::timelineToolItem` |
| 异常 | 适用：argsRaw 非 JSON、无字符串参数、resultView 缺失时兜底不抛错 | `scripts/check.mjs#R-01-009/AC-04`、`src/core.mjs::summarizeToolArguments` |
| 边界配置 | 适用：无 cwd 时路径原样、单行 Think/context 行为不变、未知工具 others 前缀 | `scripts/check.mjs#R-01-009/AC-04`、`src/client.mjs::matchNativeThinkRow` |
| 副作用 | 适用：图标两态一致（T-018 锚点）与既有时间线呈现不回归 | `scripts/check.mjs#R-01-009/AC-07`、`src/core.mjs::conversationTimeline` |

## 终态与证据

（完成后填写）
