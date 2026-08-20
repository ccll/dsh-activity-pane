---
doc-type: task
mutation: lifecycle
id: T-002
---

# T-002 运行卡向 answer-pet 富化（参数摘要/Token/速率/进度/流程节点轨迹）

状态: completed
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

- 实现: 运行卡向 answer-pet 富化：白名单参数摘要（`summarizeToolArguments`，覆盖 description/query/pattern/file_path/path/url）、输出 token 计数与 ≈速率（`fmtTokens` + `statusLine` 扩展，取 `sessions.list` 条目 `projectionValues.tokenUsage`/`sessionStats`）、阶段进度（`progressOf` 估计 + 渲染层按回合 token 差分单调下限，tool 阶段冻结、回合切换重置）、最近流程节点轨迹（`buildTrace`：`legacy.nodes` 已定案工具调用 + `runningCalls`/`partial` 当前阶段，含状态与耗时）、子代理卡当前阶段摘要行；`cardSignature` 并入 progress/trace。实现链：a6956d7、b46bd7d、bc98512。
- 测试: `node scripts/check.mjs` 全过（含 R-01-009/AC-04 白名单摘要、AC-05 token/≈速率与向后兼容、AC-06 progressOf 各阶段与 PROGRESS_THINK_BASE 同源、AC-07 buildTrace 节点/状态/耗时/上限/不泄密、签名并入 progress/trace 断言、bundle 无 `fetch(` 契约）；GUI 交互验收见 `scripts/acceptance.mjs`（R-01-009/AC-04..07 人工清单）。`agentmap_lint` 全绿（15 需求 / 39 AC / 锚定 39 / design-covered 15）。
- DESIGN 对照: 按 AgentMap「实现后调和」：新增行为（白名单摘要/token 计数与 ≈速率/阶段进度/流程节点轨迹/子代理当前阶段/回合 token 差分重置）已同步进 DESIGN「边界与对外契约 / 核心数据与不变量 / 产品契约 / 子系统与模块」，DOMAIN 术语与 DECISIONS C-005 同步；DESIGN 与实现对照无差异。
- commit: bc98512
- review:
  - 审核方: standards 子代理 d8950ae4 / spec 子代理 ab3533eb（同一审核方复审修复提交）
  - 目的理解: 审核 T-002 实现相对 PRD R-01-009/AC-04..07 与 DESIGN（statusLine 契约、buildTrace/summarizeToolArguments/progressOf、R-02-001/R-02-004 订阅纪律）的符合度，以及仓库标准（AGENTS.md 工程原则、DESIGN 横切约束、DOMAIN 术语）遵循。
  - 执行方式: code-review skill 双轴（Standards+Spec）并行子代理，评审基线 62c5a8f..a6956d7；修复提交 b46bd7d 由同一审核方复审；复审建议的 NaN 防护补入 bc98512。
  - 问题与修复: Standards — ①「输出速率」DOMAIN 承诺"标注为近似值"未上卡 → statusLine 速率加 ≈ 前缀、DOMAIN 同步；②renderTrace/renderCurrentTrace 重复 → 合并为 renderTrace(…,{lastOnly})；③pct 兜底 5 与 progressOf think 起点漂移 → 导出 PROGRESS_THINK_BASE 共用 + 同源断言；④DOMAIN「轮内状态」术语滞后 → 扩展含 token/速率/推理/流程节点/进度。Spec — ①验证门禁红（提交前修复未同步测试）→ check.mjs 锚点同步 `≈12 tok/s`、PROGRESS_THINK_BASE 断言；②AC-06「回合切换重置」在累计 token 下架空 → 进度改按回合 token 差分（tokensBase 随回合切换重记）；③复审非阻断注 NaN 基线污染 → 累计口径先 Number.isFinite 净化（bc98512）。
  - 复审结论: 两轴复审确认 b46bd7d 修复后全部发现已解决、无新增问题；NaN 防护按 reviewer 建议补入 bc98512。残留判断性提示（非偏差）：token/速率/进度为估计口径且已 ≈/近似标注、暂停等待的子代理仅显示标题（计划内取舍）、turnTokens 差分属渲染层实现细节（DESIGN 契约已覆盖 AC-06）。
