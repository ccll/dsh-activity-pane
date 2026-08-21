---
doc-type: task
mutation: lifecycle
id: T-003
---

# T-003 运行卡外观对齐 answer-pet（状态文案/动作时间线/进度条）

状态: active
关联: R-01-009 → 活动状态模型；R-01-009 → 窗格渲染器
风险等级: standard

## 背景与目标

东家反馈运行卡在几处与 answer-pet 卡片外观不一致，要求全方位模仿：

1. 状态 + token 统计行：answer-pet 流式时显示「回答中」，我们显示「运行中…/正在回复…」；
2. 动作时间线：answer-pet 的节点圆点之间有竖线串联、圆点带半透明外环、正在执行的节点圆点闪烁，我们的小圆点没有外环、无竖线、执行点不闪烁；
3. 进度条：answer-pet 工作（流式）时填充内部有向右滚动的条纹/阴影动画，我们是静态的；且显示的进度/百分比取值与 answer-pet 不一致（纯客户端近似口径下的偏差）。

已确认真实 answer-pet 源码（web profile node_modules 内）与 PRD/DESIGN 的约束：不引入宿主半端、自有路由或状态轮询（R-02-001/R-02-004），纯客户端原生订阅快照复刻（DECISIONS C-005）。

## 差距评估

- `statusLine` 头文案：现为「工具：X / 正在回复… / 运行中…」，answer-pet 的 `PHASE_LABELS` 为「使用工具 / 回答中 / 思考中」，且工具名按 `statusText` 惯例拼在状态行**末尾**（tok/速率/时长之后）。
- 动作时间线 CSS：现为 `display:flex` 内联圆点（无外环/无竖线/不闪烁）；answer-pet 为容器 `border-left` + `padding-left` 竖线 + `::before` 绝对定位圆点（`box-shadow 0 0 0 2px` 半透明外环、running 蓝色 + `ap-pulse` 闪烁、done 绿/error 红）。
- 进度条：现为 4px / `color-mix` 背景 / 静态渐变；answer-pet 为 5px / `rgba(255,255,255,.11)` 轨 / 辉光渐变 / 流式阶段 `repeating-linear-gradient` + `ap-stripes` 向右滚动。
- 进度/百分比数值：`progressOf` 阶段公式（think `5+0.5s`、stream `10+80·饱和`、tool 冻结、同回合单调）与 answer-pet `computeProgress` 已同形；偏差来自纯客户端近似口径（tokenUsage 按回合差分、无 maxTokens、无逐 chunk usage/步级重置）——已为 DESIGN/DECISIONS 记录的 ≈ 近似。另有一个真实语意偏差：**首观测即 tool 阶段（中途接入会话）时我们回落到 0%**，answer-pet 冻结的是 ≥ 思考基线的值。
- `cardSignature` 未纳入 `streaming`，`data-streaming` 属性翻转无稳定重绘触发源。
- 授权差距：本 task 承接 DESIGN「边界与对外契约 / 核心数据与不变量 / 产品契约 / 子系统与模块」的运行卡外观对齐与 PRD R-01-009/AC-02、AC-08、AC-09。

## 收敛方案

- `活动状态模型`（src/core.mjs，纯函数）：
  - `statusLine` 头文案对齐 answer-pet 阶段标签：工具→「使用工具」、流式→「回答中」、其余→「思考中」；工具名拼在状态行末尾（tok/≈速率/时长之后）；token/速率仅在 >0 时拼接（对齐 answer-pet `statusText` 的 >0 守卫）。
  - `buildTrace` 兜底当前阶段节点文案「运行中…」→「分析任务」（对齐 answer-pet 的 think 阶段节点 `step/start` 文案语义）。
  - `cardSignature` 纳入 `streaming` 字段，保证流式标记翻转触发重绘。
- `窗格渲染器`（src/client.mjs）：
  - 时间线 CSS 对齐 answer-pet：`.dap-trace` 改 `border-left` + `padding-left` 竖线容器，`.dap-trace-item` 改 grid 布局 + `::before` 绝对定位圆点（半透明外环、running 蓝色 + `dap-pulse` 闪烁、done/error 纯色），子代理 `.dap-subtrace` 同步竖线 + 圆点几何；`prefers-reduced-motion` 降级停用动画。
  - 进度条 CSS 对齐：`.dap-track` 5px/圆角 6px/`rgba(255,255,255,.11)`，`.dap-fill` 渐变 #58c98f→#2fb27a + 辉光 + `cubic-bezier` 过渡；新增 `[data-streaming]` 时 `.dap-fill` 切换为 `repeating-linear-gradient` + `dap-stripes` 向右滚动动画。
  - `.dap-pct` 12px/#9fe8c4/tabular-nums、`.dap-status` #afb7c4/tabular-nums（对齐 answer-pet），traces 颜色 #c7ced9/#8f9aaa/#7f8998。
  - 渲染层：running 条目设 `entry.streaming = !runningTool && streaming`，卡片经 `data-streaming` 属性驱动条纹动画；进度在 `progressOf` 返回 null（tool）且无历史下限时以 `PROGRESS_THINK_BASE` 兜底并固化下限（中途接入防 0）。
- 测试/文档：`scripts/check.mjs` 更新 statusLine/trace 文案断言并新增 0-token/速率守卫断言；`scripts/acceptance.mjs` 补时间线/条纹/状态文案人工验收步骤；README 卡片信息同步（如需）。

## 测试计划

- 核心（Node，`scripts/check.mjs`）：`statusLine` 对齐断言（工具/流式/思考头文案、工具名在末尾、token/速率 >0 守卫、向后兼容）；`buildTrace` 兜底文案「分析任务」；签名在 `streaming` 变化时必变（并入 progress/trace 既有断言族）；锚定 R-01-009/AC-02、AC-07。
- 契约（Node，`scripts/check.mjs`）：继续断言 bundle 无 `fetch(`；bundle 可解析；`data-streaming`/`dap-stripes` 相关 CSS 进 bundle（`bundle.includes` 校验可选）。不做 CSS 像素级自动断言。
- GUI（人工，`scripts/acceptance.mjs`）：状态文案（回答中/思考中/使用工具）、时间线（竖线/外环/运行点闪烁、子代理竖线）、进度条（5px/流式条纹动画/降低动效停用）、进度百分比与中途接入无 0%（R-01-009/AC-02、AC-06、AC-07、AC-08、AC-09）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：状态文案/时间线/进度条外观与 answer-pet 对齐 | `scripts/check.mjs#R-01-009/AC-02`、`scripts/check.mjs#R-01-009/AC-07`、`scripts/acceptance.mjs#R-01-009/AC-08`、`scripts/acceptance.mjs#R-01-009/AC-09`、`src/core.mjs::statusLine`、`src/client.mjs::render` |
| 异常 | 适用：中途接入 tool 阶段不应显示 0%；无 token/速率时字段隐藏 | `src/core.mjs::statusLine`、`src/client.mjs::render` |
| 边界配置 | 适用：速率/token 为 0、elapsed=0、prefers-reduced-motion、子代理竖线几何 | `src/core.mjs::statusLine`、`src/client.mjs::CSS` |
| 副作用 | 适用：streaming 标记随阶段翻转、签名驱动重绘、无新增订阅/请求 | `src/core.mjs::cardSignature`、`src/client.mjs::syncLiveness`、`scripts/check.mjs#R-02-004/AC-02` |
| 性能 | 适用：纹理动画只在高动效下运行（reduced-motion 停用）；1s 时钟重绘仍受签名去重 | `src/core.mjs::cardSignature`、`scripts/check.mjs#R-02-003/AC-01` |
| 恢复 | 适用：中途接入/外壳重挂载后进度与条纹状态随轮内订阅恢复 | `src/client.mjs::syncLiveness`、`scripts/acceptance.mjs#R-02-002/AC-01` |
| 兼容性 | 适用：既有运行卡字段/跳转/折叠不回归 | `scripts/check.mjs#R-01-009/AC-03`、`src/core.mjs::statusLine` |

## 终态与证据

- 实现: （待填写）
- 测试: （待填写）
- DESIGN 对照: （待填写）
- commit: （待填写）
- review: （待填写）
