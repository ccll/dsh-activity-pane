---
doc-type: task
mutation: lifecycle
id: T-011
---

# T-011 仅缩小工作项图标

状态: completed
关联: R-01-012 / 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

T-010 调整后东家反馈文字和行高被放大，但图标视觉尺寸没有缩小。本次只保留原有文字/行高/轨道尺度，强制缩小工作项图标。

## 差距评估

- T-010 将 `.dap-trace-item` 调整为 14px/24px，并同步放大轨道几何；这超出本次实际需要。
- cloned SVG 的源属性可能继续以 14px 呈现，CSS 尺度不足以保证最终视觉尺寸。

## 收敛方案

- 恢复工作项原有 10px/14px、圆点与竖线几何、时间字号。
- 保留 12px 图标容器和 SVG，并在生成 SVG 时明确写入 12px width/height。
- 不改变 Grep/Search 映射、label/summary、order、state、history、订阅或 DOM 匹配。

## 测试计划

- `scripts/check.mjs`：保留 Grep/Search 映射与时间线几何回归。
- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`。
- `scripts/acceptance.mjs`：确认文字/行高恢复、图标缩小。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：只缩小 SVG，文字和行高恢复原值 | `scripts/check.mjs#R-01-012/AC-03`、`src/client.mjs::cloneNativeIcon` |
| 异常 | 适用：无 host SVG 时 fallback 仍安全 | `scripts/check.mjs#R-01-012/AC-03`、`src/client.mjs::renderTrace` |
| 边界配置 | 适用：窄卡、多个工作项和运行点几何不回归 | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::renderTrace` |
| 副作用 | 适用：不改变数据/订阅/历史行为 | `scripts/check.mjs#R-02-004/AC-01`、`src/client.mjs::syncLiveness` |

## 终态与证据

- 实现: `src/client.mjs` 恢复工作项原有 10px/14px 文字、时间字号和圆点/竖线几何；图标容器和 SVG CSS 固定为 12px，`cloneNativeIcon` 生成 SVG 时强制写入 width/height=12；`.dsh-plugin/client.js` 已生成。
- 测试: `node scripts/check.mjs` 通过；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过；`git diff --check` 通过；`curl -fsS -I http://127.0.0.1:3080/` 返回 HTTP 200。真实视觉结果仍需按 `scripts/acceptance.mjs` 人工 GUI 验收，当前环境没有可用 Playwright/Puppeteer。
- DESIGN 对照: 仅修复工作项图标尺度，恢复原有文字/行高/轨道几何；不改变 Grep/Search、label/summary、timeline order、state、history fallback、session.subscribe 或 callId 匹配。
- commit: 55eb578
- review:
  - 审核方: Standards 子代理 `830d13d3-2d77-4bed-abc2-b8c2f30caf4a`；Spec 子代理 `3b915f3f-cea3-4793-85d9-29e321c12dfe`。
  - 目的理解: 只缩小工作项 SVG，撤销 T-010 带来的文字/行高放大，不改变其它工作项语义和行为。
  - 执行方式: `code-review` skill；固定基线 `d5fec4f`，范围为 `git diff d5fec4f...HEAD` 的 T-011 工作单元；Standards/Spec 双轴复审。
  - 问题与修复: Spec 初审要求补充 10px/14px 与 12px SVG/容器可执行断言，已在 `scripts/check.mjs` 增加 CSS 尺寸和 `cloneNativeIcon` width/height 断言；Standards 无 hard finding。
  - 复审结论: Standards 通过；Spec 通过，无遗留 finding。
