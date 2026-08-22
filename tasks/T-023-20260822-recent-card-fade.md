---
doc-type: task
mutation: lifecycle
id: T-023
---

# T-023 最近历史卡整体淡化

状态: active
关联: R-01-013/AC-10 / 窗格渲染器
风险等级: standard

## 背景与目标

TODO 条目「淡化历史会话的整体外观」经东家确认升级为 R-01-013/AC-10，淡化方式选定降低整体不透明度。目标：最近卡整体不透明度低于活动卡，悬停保持既有高亮反馈；活动卡与子代理卡不受影响。

## 差距评估

- `src/client.mjs` 的 `.dap-card[data-kind="recent"]` 仅有较深背景与透明边框，无整体不透明度降级；仅需一条 `opacity` 属性。
- `.dap-card[data-opening]`（脉冲等待反馈，opacity 0.85）与该规则特异性相同且位于其后，最近卡进入 opening 态时仍由 opening 规则接管，不冲突。
- 数据层与 DOM 结构不变，纯呈现调整。

## 收敛方案

- 在 `.dap-card[data-kind="recent"]` 规则内增加 `opacity: 0.8;`。
- 不改动悬停 `brightness(1.12)` 反馈、opening 脉冲、活动卡与子代理卡呈现。

## 测试计划

- `scripts/check.mjs`：bundle 契约断言最近卡规则含 `opacity: 0.8`。
- `scripts/acceptance.mjs`：新增 R-01-013/AC-10 人工验收步骤（整体更淡、悬停反馈保留）。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：最近卡整体不透明度 0.8，低于活动卡 | `scripts/check.mjs#R-01-013/AC-10`、`src/client.mjs::CSS` |
| 异常 | 不适用：纯 CSS 呈现调整，无数据/失败路径 | — |
| 边界配置 | 适用：最近卡点击进入 opening 等待态时脉冲反馈不被淡化规则覆盖（recent 规则先于 opening 规则） | `scripts/check.mjs#R-01-013/AC-10`、`src/client.mjs::CSS` |
| 副作用 | 适用：不改动 DOM 结构、数据流与活动卡/子代理卡呈现 | `scripts/check.mjs#R-01-013/AC-09`、`src/client.mjs::CSS` |

## 终态与证据

（待填写）
