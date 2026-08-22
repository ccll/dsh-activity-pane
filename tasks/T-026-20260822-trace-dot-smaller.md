---
doc-type: task
mutation: lifecycle
id: T-026
---

# T-026 时间线圆点调小至 5px

状态: completed
关联: R-01-009/AC-09 / 窗格渲染器
风险等级: standard

## 背景与目标

TODO 条目「调小活动会话 timeline 中的圆点大小」经东家确认：时间线节点圆点 7px 偏大，调至 5px。R-01-009/AC-09 改写补上 5px 与同圆心口径。几何联动：5px 圆点 left:0 圆心 x=2.5，竖线 left: 3→2px（1px 宽，圆心 x=2.5），圆点 top: 3→4px 保持垂直圆心 6.5 不变；文字轨道 padding-left: 14px 不动。

## 差距评估

- `.dap-trace-item::before`（7px、top 3px）与 `.dap-trace-item::after`（left 3px）需联动调整；T-011 建立的几何注释与 check.mjs 断言（7px、left 3px）需同步更新。
- 竖线 `bottom: -8px` 终点仍没入下一颗 5px 圆点（下一项圆点纵向占 4–9px，线终点落在项内第 5px），无需调整。
- 标题圆点 `.dap-dot`（7px）不在本条范围，保持不变。
- DOM 与数据层不变，纯呈现调整。

## 收敛方案

- 圆点 5px + top 4px，竖线 left 2px，几何注释同步改写。
- check.mjs 断言更新为 5px/left 2px 口径，并精确锚定 ::before/::after 规则文本（避免与 `.dap-dot` 的 7px 串混淆）。

## 测试计划

- `scripts/check.mjs`：更新 R-01-009/AC-09 几何断言（5px 圆点、left 2px 竖线、同圆心）。
- `scripts/acceptance.mjs`：R-01-009/AC-09 既有人工步骤已含同圆心/外环/闪烁判定，尺寸变化由其目视覆盖。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：圆点 5px、竖线 left 2px、同圆心 | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::CSS` |
| 异常 | 不适用：纯 CSS 呈现调整，无数据/失败路径 | — |
| 边界配置 | 适用：末项不画竖线、首项竖线向上引出、子代理不裁切圆点等几何不回归 | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::CSS` |
| 副作用 | 适用：标题圆点 .dap-dot 7px 与运行点脉冲动画不变 | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::CSS` |

## 终态与证据

- 实现: `src/client.mjs` 的 `.dap-trace-item::before` 调为 5px + top 4px（垂直圆心 6.5 不变）、`::after` 竖线 left 2px（同圆心 x=2.5），几何注释同步改写；标题圆点 `.dap-dot` 7px 与运行点脉冲不变；`.dsh-plugin/client.js` 已重新生成。
- 测试: `node scripts/check.mjs` 通过（R-01-009/AC-09 断言更新为 5px/left 2px 口径并精确锚定 ::before/::after 规则文本）；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过。`scripts/acceptance.mjs` 既有 AC-09 人工步骤含同圆心/外环/闪烁判定，尺寸变化由其目视覆盖。
- DESIGN 对照: 样式细节属实现自由，DESIGN 无需演进；R-01-009 需求追溯索引既有行保持准确。
- commit: c1a3520
- review:
  - 审核方: Standards 子代理 `83e49668-c1b7-49b0-96d6-9cc17a01833a`；Spec 子代理 `f9bfabc9-678e-4dcc-aa43-9d3875eb706b`。
  - 目的理解: 实现 R-01-009/AC-09 改写口径——时间线节点圆点 7px 调小至 5px 且与竖线保持同圆心，保留外环+闪烁语义；纯 CSS 几何联动，不改 DOM/数据流、不动标题圆点。
  - 执行方式: `code-review` skill；固定基线 `5109400`，范围为 `git diff 5109400...HEAD` 的 T-026 工作单元；Standards/Spec 双轴并行审核。
  - 问题与修复: 无 finding。Standards 两条 judgement call（PRD 写死 5px 像素值偏机制细节、断言锚定 CSS 内部文本）均经审核方判为可不修的既定取舍。
  - 复审结论: Standards 通过；Spec 通过，无遗留 finding，无需复审。
