---
doc-type: task
mutation: lifecycle
id: T-024
---

# T-024 徽标配色柔和化与数量徽标位置

状态: active
关联: R-01-002/AC-04、R-01-001/AC-04 / 窗格渲染器
风险等级: standard

## 背景与目标

TODO 条目「调整活动会话 badge 的背景色」与「调整活动会话数量 badge 的位置与外观」经东家确认合并升级：等待标识徽标（`.dap-badge`）与列头数量徽标（`.dap-count`）的橙金渐变过于突兀，改用与主题协调的柔和底（与 workspace chip、折叠窄条/移动端计数同系 color-mix）；数量徽标去掉 `margin-left: auto`，紧跟「活动会话」标题文字。醒目性由等待卡描边与计数徽标红色脉冲变体继续承载。

## 差距评估

- `.dap-badge` 橙金渐变 + 深棕字；`.dap-count` 同款渐变且 `margin-left: auto` 顶到列头最右；两处需改。
- `.dap-rail-count`（折叠窄条）与 `.dap-toggle-count`（移动端开关）本已是 color-mix 柔和底，无需改动——本次即向它们看齐。
- `.dap-count[data-awaiting]` 红色渐变 + 脉冲保留（R-01-002 醒目要求）；DOM 结构不变（数量徽标 DOM 本就在标题文字之后，仅 CSS 推移）。
- check.mjs 无针对这两处旧配色的断言，无冲突。

## 收敛方案

- `.dap-badge`：改 `color: color-mix(in srgb, currentColor 88%, transparent)` + `background: color-mix(in srgb, currentColor 12%, transparent)`。
- `.dap-count`：同系配色，删除 `margin-left: auto`；`[data-awaiting]` 变体不动。
- 不改动 DOM、数据流、等待卡描边与脉冲动画。

## 测试计划

- `scripts/check.mjs`：bundle 契约断言新柔和配色、旧渐变消失、数量徽标无 margin-left: auto、等待态红色脉冲保留。
- `scripts/acceptance.mjs`：新增 R-01-002/AC-04 与 R-01-001/AC-04 人工验收步骤。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：徽标柔和配色生效、数量徽标紧跟标题 | `scripts/check.mjs#R-01-002/AC-04`、`scripts/check.mjs#R-01-001/AC-04`、`src/client.mjs::CSS` |
| 异常 | 不适用：纯 CSS 呈现调整，无数据/失败路径 | — |
| 边界配置 | 适用：等待态数量徽标红色脉冲与折叠/移动端变体不回归 | `scripts/check.mjs#R-01-001/AC-04`、`src/client.mjs::CSS` |
| 副作用 | 适用：不改动 DOM 结构、数据流与卡片呈现 | `scripts/check.mjs#R-01-013/AC-09`、`src/client.mjs::CSS` |

## 终态与证据

（待填写）
