---
doc-type: task
mutation: lifecycle
id: T-002
---

# T-002 运行卡向 answer-pet 富化（参数摘要/Token/速率/进度/流程节点轨迹）

状态: active
关联: R-01-009 → 活动状态模型；R-01-009 → 窗格渲染器
风险等级: standard

## 背景与目标

东家要求活动卡片内容向 answer-pet 的卡片靠拢：运行卡在现有「工具名/流式提示/已运行时长」之外，补充工具参数白名单摘要、输出 token 计数与速率、阶段进度（百分比 + 进度条）、最近流程节点轨迹（阶段与工具，含状态与耗时）。已确认走纯客户端原生订阅快照复刻（见 DECISIONS C-005）：不引入宿主半端、自有路由或状态轮询，不越 PRD R-02-001/R-02-004 边界。

## 差距评估

- 当前 `statusLine({ runningTool, streaming, elapsedMs })` 状态行仅含「工具：X / 正在回复… / 运行中… · 时长」；无参数摘要、token/速率、进度、流程节点轨迹。
- 原生客户端数据面已带齐等价原语，尚未被利用：
  - `sessions.binding(id).session` 快照的 `runningCalls[].{name,argsRaw}`、`partial.blocks`（text/reasoning 块）、`turnTimings`（回合 startTime）、`legacy.nodes`（已定案工具调用节点：`call.name`/`call.argsRaw`/`callTime`/`time`/`isError`）；
  - `sessions.list` 条目 `projectionValues.tokenUsage`（累计输出/输入）与 `sessionStats`（decodeTokens/decodeMs 吞吐），复用既有列表订阅。
- `cardSignature` 未纳入进度/流程节点字段，富卡新增字段变化不会触发重绘。
- 已授权差距：运行卡富化（摘要/token/速率/进度/流程节点）见 DESIGN「核心数据与不变量 / 产品契约 / 子系统与模块」与需求追溯索引 R-01-009。

## 收敛方案

- `活动状态模型`（src/core.mjs，纯函数）：
  - 新增 `fmtTokens(n)`：token 人性化短格式（`1.2k`），不外泄非有限值。
  - 新增 `summarizeToolArguments(raw)`：只从白名单字段（description/query/pattern/file_path/path/url）提取摘要，绝不返回完整命令或原始 JSON（R-01-009/AC-04）。
  - 扩展 `statusLine`：新增可选 `outputTokens`/`rateTokS`，拼入状态行（向后兼容现有返回）。
  - 新增 `progressOf({ phase, outputTokens, elapsedMs })`：阶段权重 + 输出 token 饱和填充估计 0–100；tool 阶段冻结返回 null（R-01-009/AC-06）。
  - 新增 `buildTrace({ nodes, runningTool, runningArgs, streaming, reasoning, turnStartTime, now })`：已定案工具调用（来自 legacy.nodes，含 label/detail/status/durationMs）+ 当前阶段节点，上限 `TRACE_MAX_ITEMS`（R-01-009/AC-07）。
  - `cardSignature` 纳入 `progress`/`trace` 字段，保证富卡变化触发重绘。
- `窗格渲染器`（src/client.mjs）：
  - `livenessFromSnapshot` 扩展归一：`runningArgs`、`reasoning`（partial 含 reasoning 块）、`streaming`（partial 含 text 块）、`turn`（当前回合号）、`nodes`（legacy.nodes）。
  - 运行卡状态行 = `statusLine(…投影 token/速率)`；进度经 `progressOf` + 按回合单调下限（tool 阶段冻结、回合切换重置）写入 `entry.progress`；`entry.trace = buildTrace(…)`。
  - 运行卡骨架对齐 answer-pet：workspace 徽标 + 头行（dot/标题/百分比）+ 状态行 + trace 容器 + 进度条（track/fill）；子代理卡补一行当前阶段摘要；节点文本一律 `textContent` 写入。
  - 列表条目 `projectionValues` 直接复用，不新增订阅；`progressFloor` 随运行集清理，卸载清空。
- 测试/文档：`scripts/check.mjs` 新增 R-01-009/AC-04~07 锚点；`scripts/acceptance.mjs` 补人工验收步骤；README 卡片信息同步。

## 测试计划

- 核心（Node，`scripts/check.mjs`）：`fmtTokens`、`summarizeToolArguments`（含完整命令/原始 JSON 不入摘要）、`statusLine`（token/速率拼接与向后兼容）、`progressOf`（stream 填充 / think 爬升 / tool 冻结）、`buildTrace`（已定案节点 label/status/durationMs、当前阶段、上限裁剪、白名单过滤），全部锚定 R-01-009/AC-04~07。
- 契约（Node，`scripts/check.mjs`）：继续断言 bundle 无 `fetch(`；`cardSignature` 在 progress/trace 变化时签名必变。
- GUI（人工，`scripts/acceptance.mjs`）：运行卡富化呈现（摘要/token/速率/进度条/流程节点实时演进）、同回合进度不倒退、回合切换进度重置、停止运行后富卡字段停止更新、卸载无残留。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：运行卡富化字段正常呈现与实时更新 | `scripts/check.mjs#R-01-009/AC-04`、`scripts/check.mjs#R-01-009/AC-05`、`scripts/check.mjs#R-01-009/AC-07`、`scripts/acceptance.mjs#R-01-009/AC-06`、`src/core.mjs::buildTrace` |
| 异常 | 适用：工具参数不可解析 / 投影缺token / 节点形状异常时应优雅降级 | `src/core.mjs::summarizeToolArguments`、`src/core.mjs::buildTrace`、`src/client.mjs::livenessFromSnapshot` |
| 边界配置 | 适用：token=0、elapsed=0、进度上限 100、trace 上限裁剪 | `src/core.mjs::fmtTokens`、`src/core.mjs::progressOf`、`src/core.mjs::TRACE_MAX_ITEMS` |
| 副作用 | 适用：新增字段不进 DOM 复用表、卸载/停止运行后 progressFloor 与订阅归零 | `scripts/check.mjs#R-02-003/AC-02`、`scripts/acceptance.mjs#R-02-004/AC-01`、`src/client.mjs::syncLiveness` |
| 性能 | 适用：富卡字段在 1s 时钟下重绘受签名去重控制，trace/进度并入签名 | `src/core.mjs::cardSignature`、`scripts/check.mjs#R-02-003/AC-01` |
| 并发 | 适用：多运行会话各自的进度下限互不串扰，按回合独立管理 | `scripts/acceptance.mjs#R-01-009/AC-06`、`scripts/check.mjs#R-01-009/AC-07`、`src/core.mjs::cardSignature` |
| 恢复 | 适用：外壳重挂载后富卡字段随轮内订阅恢复 | `scripts/acceptance.mjs#R-02-002/AC-01`、`src/client.mjs::syncLiveness` |

## 终态与证据

- 实现: （关闭时填写）
- 测试: （关闭时填写）
- DESIGN 对照: （关闭时填写）
- commit: （关闭时填写）
- review: （关闭时填写，含独立代码审核证据）
