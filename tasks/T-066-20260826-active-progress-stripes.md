---
doc-type: task
mutation: lifecycle
id: T-066
---

# T-066 活动会话进度条全程移动条纹

状态: active
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

- `src/client.mjs`：条纹背景与 `dap-stripes` 动画从 `[data-streaming]` 选择器移入 `.dap-fill` 基础规则（进度条仅存于运行卡骨架，运行即条纹）；删除 `[data-streaming]` 规则、`toggleAttribute("data-streaming")`、`entry.streaming` 派生与 `livenessFromSnapshot` 的 `streaming` 字段。
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

（完成时填写）
