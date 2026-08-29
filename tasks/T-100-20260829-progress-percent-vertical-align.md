---
doc-type: task
id: T-100
mutation: lifecycle
---

# T-100 进度百分比视觉上移

风险等级: standard
状态: completed

## 背景与目标

- 背景: 百分比行盒当前与 5px 进度条按几何中心对齐，但文字视觉重心相对进度条偏下，现场观感不协调。
- 目标: 百分比整体上移 1px，使其视觉中心略高于进度条中心。
- 非目标: 不改变百分比水平右对齐、固定宽度、进度条位置、统计行位置或卡片行高。
- 需求与设计确认: 东家当次明确要求百分比向上移动一点，直接确认 R-01-009/AC-06 与对应 DESIGN 几何契约按 1px 最小位移演进。

## 差距评估

- `.dap-progress` 使用 `align-items: center`，`.dap-pct` 无垂直视觉校正，行盒中心与进度条中心完全重合。
- R-01-009/AC-06 与 DESIGN 已约束同行、水平右缘与固定占位，尚未约束百分比的视觉垂直校正。
- `session-lifecycle` E2E 已取得百分比与进度行矩形，可直接比较百分比行盒中心与进度条中心。

## 收敛方案

1. 修订 R-01-009/AC-06，明确百分比相对进度条中心上移 1px。
2. 同步 DESIGN 的运行卡外观与回合进度几何契约。
3. browser E2E 先断言百分比行盒中心比进度条中心高约 1px，使现有实现失败。
4. 为 `.dap-pct` 增加 `transform: translateY(-1px)`，不改变布局占位。
5. 更新人工验收证据并重建 client bundle。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-009/AC-06 | 百分比垂直视觉位置变化 | E2E/MANUAL | update | 比较百分比行盒中心与进度条中心的 1px 位移，并现场目验协调性 |
| DESIGN | 进度行垂直几何关系变化 | E2E/MANUAL | update | 同步设计描述与浏览器几何断言 |

## 测试计划

- 测试先行：更新 `session-lifecycle` browser E2E，使当前完全居中实现失败。
- 运行 focused browser E2E、`pnpm verify:fast` 与 `pnpm verify`。
- 刷新现有 GUI，目验百分比相对进度条略微上移且水平右缘不漂移。
- 调用 `code-review` skill 做独立双轴审核并处理 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：百分比行盒中心比进度条中心高约 1px | `package.json::test:e2e`、`e2e/specs/session-lifecycle.mjs#R-01-009/AC-06`、`package.json::accept:manual`、`scripts/acceptance.mjs#R-01-009/AC-06` |
| 异常 | 不适用：纯 CSS 视觉位移，无失败路径 | — |
| 边界配置 | 适用：200px 最窄窗格与 9%/100% 位数下垂直位移一致 | `package.json::test:e2e`、`e2e/specs/session-lifecycle.mjs#R-01-009/AC-06` |
| 副作用 | 适用：水平右缘、固定宽度、进度条与统计行位置不变 | `package.json::test:e2e`、`e2e/specs/session-lifecycle.mjs#R-01-009/AC-06`、`package.json::check`、`scripts/check.mjs#R-01-009/AC-05` |

## 终态与证据

- 实现: `src/client.mjs` 为 `.dap-pct` 增加 `transform: translateY(-1px)`，仅改变视觉绘制位置，不改变 flex 布局占位、5ch 固定宽、水平右对齐、进度条或统计行位置；`.dsh-plugin/client.js` 已同步重建。
- 测试: 测试先行——E2E 新增百分比行盒中心相对进度条中心上移约 1px 的几何断言后，旧实现按预期失败；实现后 focused `session-lifecycle` 通过。`pnpm verify:fast` 通过；最终 `pnpm verify` 全部 12 个 spec 通过（132668ms）；`git diff --check` 干净。现有 `http://127.0.0.1:3080/` 经 Playwright 刷新确认新样式已加载（`transform: matrix(1, 0, 0, 1, 0, -1)`、`textAlign: right`、宽度 `33.3594px`）。回滚边界为 PRD/DESIGN、`src/client.mjs`、生成 bundle、`session-lifecycle` E2E 与人工验收中的 T-100 对应变更，不影响其它行为。
- DESIGN 对照: 与 R-01-009/AC-06 及 DESIGN 的运行卡外观、渲染期字段、回合进度条目一致：百分比保持同行、水平右缘与固定占位，仅以不改变布局的 `translateY(-1px)` 相对进度条中心视觉上移；无差异。
- commit: ad88edf
- review:
  - 审核方: 独立 Standards reviewer `T100 standards final`；独立 Spec reviewer `T100 spec final`。
  - 目的理解: 百分比当前几何居中但视觉重心偏下；目标是在保持 5ch、水平右缘、进度条/统计行位置与卡片行高不变的前提下，将 `.dap-pct` 相对进度条中心视觉上移 1px；关联 T-100、PRD R-01-009/AC-06 与 DESIGN。
  - 执行方式: `code-review` skill，以 `bffc87f` 为固定基线审核 `bffc87f...ad88edf`；Standards/Spec 双轴独立核查源码、生成 bundle、browser E2E、map 与验收证据。
  - 问题与修复: Standards Hard 0、Judgement 0；Spec findings 0，无需修复。
  - 复审结论: 双轴最终通过。
