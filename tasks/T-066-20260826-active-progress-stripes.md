---
doc-type: task
mutation: lifecycle
id: T-066
---

# T-066 活动会话进度条全程移动条纹

状态: completed
关联: R-01-009/AC-08 → 活动状态模型
风险等级: standard

## 背景与目标

东家要求：活动会话的进度条加移动条纹，体现进度条在活动。现状条纹仅在流式阶段出现（`data-streaming` 驱动），工具/思考阶段停止，无法持续表达「会话在活动」。需求变更走全链：PRD R-01-009/AC-08 改写为「运行中状态全程持续条纹」（含委托周期内保持运行呈现的母会话），DESIGN 同步 5 处条纹/签名/轮内归一描述，经东家当次请求确认演进。

## 差距评估

- `src/client.mjs`：条纹 CSS 挂在 `.dap-card[data-streaming] .dap-fill` 选择器；`entry.streaming` 派生（工具调用期间视为非流式）与 `rec.el.toggleAttribute("data-streaming")` 仅为条纹服务。
- `src/client.mjs` `livenessFromSnapshot`：归一出 `streaming` 字段，唯一消费者是 `entry.streaming` 派生。
- `src/core.mjs`：`cardSignature` 含 `streaming` 分量，唯一用途是驱动 `data-streaming` 翻转重绘。
- `scripts/check.mjs`：AC-08 相关断言仅检查条纹动画字符串存在，未锚定「运行全程」语义。

## 收敛方案

- `src/client.mjs`：条纹背景与 `dap-stripes` 动画从 `[data-streaming]` 选择器移入 `.dap-fill` 基础规则（进度条仅存于运行卡骨架，运行即条纹）；删除 `[data-streaming]` 规则、`toggleAttribute("data-streaming")`、`entry.streaming` 派生；`livenessFromSnapshot` 随之收敛为仅归一 `startTime`（runningTool/runningArgs/reasoning 失唯一消费者后一并移除）。
- `src/core.mjs`：`cardSignature` 移除 `streaming` 分量（条纹不再依赖属性翻转）。
- `scripts/check.mjs`：AC-08 锚点改写——断言 `.dap-fill` 基础规则携带条纹渐变与动画、bundle 无 `data-streaming`/`entry.streaming` 残留。
- 条纹配色、`@keyframes dap-stripes`、`prefers-reduced-motion` 语义不变；不新增依赖。

## 测试计划

- 测试先行：`scripts/check.mjs` 锚点先改写（旧实现下必红），实现后 `pnpm build:client && pnpm check` 转绿。
- `python3 tools/agentmap_lint.py --report`：追溯与锚定完整。
- `git diff --check`。
- GUI 现场验收（运行中全程条纹移动、等待/完成提醒卡无条纹）由东家人工确认。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：运行卡（含委托周期母会话）进度条全程向右滚动条纹 | `scripts/check.mjs#R-01-009/AC-08`、`src/client.mjs::dap-stripes`、GUI 现场验收 |
| 异常 | 适用：会话停止运行（等待/完成提醒/非活动）后卡片不再为运行骨架，条纹随骨架消失 | `scripts/check.mjs#R-01-009/AC-08`、`src/client.mjs::dap-fill`、GUI 现场验收 |
| 边界配置 | 适用：`prefers-reduced-motion` 仍只关闭宽度 transition、保留条纹；条纹配色与周期不变 | `scripts/check.mjs#R-01-009/AC-08`、`src/client.mjs::prefers-reduced-motion` |
| 副作用 | 适用：签名移除 streaming 分量后渲染跳过语义不变；timeline/token 统计/进度推进路径不变 | `scripts/check.mjs#R-01-009/AC-08`、`src/core.mjs::cardSignature` |

## 终态与证据

- 实现: `src/client.mjs`——条纹渐变与 `dap-stripes` 动画移入 `.dap-fill` 基础规则（进度条仅存于运行卡骨架，运行全程持续向右滚动，含委托周期母会话），删除 `[data-streaming]` 规则、`toggleAttribute("data-streaming")` 与 `entry.streaming` 派生；审核修复中 `livenessFromSnapshot` 收敛为仅归一 `startTime`（runningTool/runningArgs/reasoning 失唯一消费者后移除），reduced-motion 注释改「进度条纹」。`src/core.mjs`——`cardSignature` 移除 `streaming` 分量。条纹配色、周期与 prefers-reduced-motion 语义不变。
- 测试: 测试先行——`scripts/check.mjs` R-01-009/AC-08 锚点先改写（.dap-fill 基础规则含条纹渐变与动画、无 data-streaming/entry.streaming 残留），旧实现下必红、实现后转绿；审核修复补「进度条骨架仅属运行卡」负向断言（非运行卡不呈现条纹）。`pnpm build:client && pnpm check` 全绿；`python3 tools/agentmap_lint.py --report` 通过（21 需求 / 112 AC 全追溯、全锚定）；`git diff --check` 干净。GUI 现场验收（运行全程条纹移动、等待/完成提醒卡无条纹）由东家人工确认。
- DESIGN 对照: 与 DESIGN「运行卡外观」进度条条目（5px、运行期间持续条纹）、「稳定签名」（无 streaming 分量）、「运行卡渲染期字段」（无 streaming、条纹随骨架常驻）、「轮内状态订阅」归一 `{ startTime }`、`prefers-reduced-motion` 条目逐条一致；PRD R-01-009/AC-08 新口径同原子变更级联，无差异。
- commit: 610f8eef4ecefb991fa824910605729ac321349e
- commit: d4cd51338a0dbc9742e035b5501e6243244a8c86
- review:
  - 审核方: 独立 reviewer 双轴（Standards 子代理 bd19779c、Spec 子代理 444b127c，code-review skill 流程）
  - 目的理解: 活动会话进度条条纹从「仅流式阶段经 data-streaming 门控」改为「运行卡全程持续」，体现会话在活动；关联 PRD R-01-009/AC-08 新口径（经东家确认）、DESIGN 进度条/签名/轮内归一条目；预期行为为条纹随运行卡骨架常驻、非运行卡无条纹，验证经 scripts/check.mjs AC-08 锚点与 pnpm check（两轴均在审核前记录目的理解）。
  - 执行方式: `code-review` skill，评审基线 `git diff main...HEAD`（评审时提交 13dce7e、复审含 e943207；集成重排后为 610f8eef4ecefb991fa824910605729ac321349e/d4cd51338a0dbc9742e035b5501e6243244a8c86，内容仅 T-ID 与 commit 证据同步），范围含 src/client.mjs、src/core.mjs、scripts/check.mjs、PRD/DESIGN、tasks/T-066 与 .dsh-plugin/client.js 构建产物一致性。
  - 问题与修复: Standards 轴无硬违规，2 项判断性发现——livenessFromSnapshot 残留 runningTool/runningArgs/reasoning 无消费者字段（修复：收敛为仅归一 startTime，DESIGN 归一形状同步）、reduced-motion 注释残留「流式条纹」（修复：改「进度条纹」）；Spec 轴 1 项弱缺失——AC-08 负向半句无锚点（修复：补进度条骨架仅属运行卡的负向断言），注释措辞同修；无 scope creep。
  - 复审结论: 双轴复审均通过、无遗留 finding。
