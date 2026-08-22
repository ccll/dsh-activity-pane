---
doc-type: task
mutation: lifecycle
id: T-024
---

# T-024 徽标配色柔和化与数量徽标位置

状态: completed
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

- 实现: `src/client.mjs` 的 `.dap-badge` 与 `.dap-count` 改用 color-mix 柔和底，`.dap-count` 删除 `margin-left: auto` 紧跟标题；等待态红色脉冲变体、折叠/移动端计数变体不动；`.dsh-plugin/client.js` 已重新生成。
- 测试: `node scripts/check.mjs` 通过（新增 R-01-002/AC-04、R-01-001/AC-04 锚点断言与花括号配平/规则闭合结构回归防护）；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过。`scripts/acceptance.mjs` 新增两条人工验收步骤，真实视觉结果仍需人工 GUI 验收。
- DESIGN 对照: 样式细节属实现自由，DESIGN 无需演进；R-01-001、R-01-002 需求追溯索引既有行保持准确。
- commit: f03eb24
- commit: f98e70f
- commit: a1a14a0
- review:
  - 审核方: Standards 子代理 `0dab2456-cffb-4e54-bf85-eccd0e942493`；Spec 子代理 `a1680646-9050-4434-8c58-4224f8199eb0`。
  - 目的理解: 实现 R-01-002/AC-04 与 R-01-001/AC-04——等待标识徽标与列头数量徽标由突兀橙金渐变改为主题协调的柔和配色，数量徽标紧跟标题文字；醒目性由等待卡描边与计数红色脉冲承载；纯 CSS 调整，不改 DOM 结构、数据流与折叠/移动端变体。
  - 执行方式: `code-review` skill；固定基线 `418a202`，范围为 `git diff 418a202...HEAD` 的 T-024 工作单元；Standards/Spec 双轴并行审核，修复后由同一审核方分别复审。
  - 问题与修复: 双轴初审共同发现 hard violation——`.dap-badge` hunk 花括号断裂（残留旧选择器 + 丢失闭合），后续规则被嵌套吞掉且字符串断言漏检；修复为恢复规则结构并新增规则闭合边界断言与 bundle 花括号配平断言（f98e70f）。Spec 另指出脉冲保留断言锚点误挂 R-01-001/AC-04，修正归入 R-01-002/AC-04（a1a14a0）。
  - 复审结论: Standards 复审通过（violation 消失，无新问题）；Spec 复审通过并确认锚点瑕疵消失，双轴闭环，无遗留 finding。
