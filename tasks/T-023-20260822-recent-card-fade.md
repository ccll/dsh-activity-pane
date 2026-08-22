---
doc-type: task
mutation: lifecycle
id: T-023
---

# T-023 最近历史卡整体淡化

状态: completed
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

- 实现: `src/client.mjs` 的 `.dap-card[data-kind="recent"]` 增加 `opacity: 0.8;`；opening 等待脉冲（同特异性且居后）与悬停 brightness 反馈不受影响；`.dsh-plugin/client.js` 已重新生成。
- 测试: `node scripts/check.mjs` 通过（新增 R-01-013/AC-10 不透明度断言与 recent/opening 层叠次序断言）；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过。`scripts/acceptance.mjs` 新增 R-01-013/AC-10 人工验收步骤（整体更淡、悬停反馈保留），真实视觉结果仍需人工 GUI 验收。
- DESIGN 对照: 样式细节属实现自由，DESIGN 无需演进；R-01-013 需求追溯索引既有行保持准确。
- commit: b94807f
- commit: 228c97c
- review:
  - 审核方: Standards 子代理 `1c1f4806-749b-46b2-a915-a042103978de`；Spec 子代理 `a4580238-8fc1-44b0-814a-b6dab2951a70`。
  - 目的理解: 实现 R-01-013/AC-10——最近历史卡整体不透明度降为 0.8 以弱化历史区视觉强调，悬停保持既有高亮反馈；纯 CSS 调整，不改 DOM 结构、数据流与活动卡/子代理卡呈现。
  - 执行方式: `code-review` skill；固定基线 `7f54479`，范围为 `git diff 7f54479...HEAD` 的 T-023 工作单元；Standards/Spec 双轴并行审核，修复后由同一 Spec 审核方复审。
  - 问题与修复: Spec 初审 finding——验证矩阵边界配置行引用通用脉冲人工步骤、锚定不准；修复为 check.mjs 新增 recent/opening 层叠次序断言并改引该断言（228c97c）。Standards 无 finding（两处 smell 嫌疑均判不成立，属既有文件约定）。
  - 复审结论: Standards 通过；Spec 复审确认 finding 消失、修复未引入新问题，双轴通过，无遗留 finding。
