---
doc-type: task
id: T-100
mutation: lifecycle
---

# T-100 进度百分比视觉上移

风险等级: standard
状态: active

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

- 实现: 待填写。
- 测试: 待填写。
- DESIGN 对照: 待填写。
- commit: 待填写。
- review: 待填写。
