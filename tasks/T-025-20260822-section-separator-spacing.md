---
doc-type: task
mutation: lifecycle
id: T-025
---

# T-025 两区分隔线留白

状态: completed
关联: R-01-010/AC-05 / 窗格渲染器
风险等级: standard

## 背景与目标

TODO 条目「在历史会话列表与活动会话列表之间的分隔线上下增加留白」经东家确认升级为 R-01-010/AC-05：分隔线上 4px、下 6px 的间距过小，上下各增至 10px，两区呼吸感明确。

## 差距评估

- `.dap-recent` 规则 `margin-top: 4px; padding: 6px 8px 0`（border-top 为分隔线本体）；仅需改两个数值。
- 数据层与 DOM 结构不变，纯呈现调整；check.mjs 无针对旧间距的断言。

## 收敛方案

- `.dap-recent`：`padding: 10px 8px 0; margin-top: 10px;`。
- 不改动分隔线颜色、列表 gap 与卡片布局。

## 测试计划

- `scripts/check.mjs`：bundle 契约断言新间距（锚定 R-01-010/AC-05）。
- `scripts/acceptance.mjs`：新增 R-01-010/AC-05 人工验收步骤。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：分隔线上下各 10px 留白 | `scripts/check.mjs#R-01-010/AC-05`、`src/client.mjs::CSS` |
| 异常 | 不适用：纯 CSS 呈现调整，无数据/失败路径 | — |
| 边界配置 | 适用：历史区无内容整段隐藏，分隔线不占位、间距不影响布局 | `scripts/check.mjs#R-01-010/AC-01`、`src/client.mjs::CSS` |
| 副作用 | 适用：不改动 DOM 结构、数据流与卡片呈现 | `scripts/check.mjs#R-01-002/AC-04`、`src/client.mjs::CSS` |

## 终态与证据

- 实现: `src/client.mjs` 的 `.dap-recent` 改为 `padding: 10px 8px 0; margin-top: 10px;`；分隔线颜色与列表布局不变；`.dsh-plugin/client.js` 已重新生成。
- 测试: `node scripts/check.mjs` 通过（新增 R-01-010/AC-05 间距断言与历史区整段隐藏断言）；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过。`scripts/acceptance.mjs` 新增 R-01-010/AC-05 人工验收步骤，真实视觉结果仍需人工 GUI 验收。
- DESIGN 对照: 样式细节属实现自由，DESIGN 无需演进；R-01-010 需求追溯索引既有行保持准确。
- commit: b7802ff
- review:
  - 审核方: Standards 子代理 `4c5d207f-25d6-483c-b307-0bda07d7ac9d`；Spec 子代理 `8cde0e89-2a48-4eeb-b45d-e11cff29dcb6`。
  - 目的理解: 实现 R-01-010/AC-05——活动区与最近历史区分隔线上下各 10px 留白；纯 CSS 数值调整，不改 DOM 结构、数据流与分隔线颜色；关联约束为 AgentMap 纪律与 strict 测试锚定（含 T-024 花括号断裂教训的 CSS 结构复核）。
  - 执行方式: `code-review` skill；固定基线 `369f14d`，范围为 `git diff 369f14d...HEAD` 的 T-025 工作单元；Standards/Spec 双轴并行审核。
  - 问题与修复: 无 blocking 问题。Standards 两条 judgement call（整段隐藏断言挂 AC-01 的锚定方向、呈现类 AC 的追溯归属）与 Spec 一条观察（task 关联子系统与 PRD 关联设计措辞不一）均经审核方自判非阻断、仅作记录，不修。
  - 复审结论: Standards 通过；Spec 通过，无遗留 finding，无需复审。
