---
doc-type: task
id: T-099
mutation: lifecycle
---

# T-099 进度百分比与耗时右缘对齐

风险等级: standard
状态: active

## 背景与目标

- 背景: 运行卡百分比已有固定宽占位，但文字默认左对齐，右缘未与下一行最右侧耗时对齐。
- 目标: 百分比数值在既有占位内向右对齐，使其文字右缘与统计行耗时文字右缘对齐。
- 非目标: 不改变进度计算、统计内容或其它布局；百分比占位只扩至容纳最宽的 `100%`。
- 需求与设计确认: 东家当次明确要求上述右缘对齐，直接确认 R-01-009/AC-06 与对应 DESIGN 几何契约按此演进。

## 差距评估

- `src/client.mjs` 的 `.dap-pct` 已有 `width: 4ch`，但未设置文本右对齐，且该宽度不足以容纳粗体 `100%`。
- R-01-009/AC-06 与 DESIGN 只约束百分比位于进度条右侧且固定宽，未约束其文字右缘与下一行耗时对齐。
- `e2e/specs/session-lifecycle.mjs` 已验证同行、右置与固定宽，尚未比较百分比和耗时的文字右缘。

## 收敛方案

1. 修订 R-01-009/AC-06，明确百分比右对齐并与下一行最右侧耗时右缘对齐。
2. 同步 DESIGN 的运行卡外观、渲染期字段与回合进度几何契约。
3. 在 browser E2E 中以文字实际边界比较两者右缘，先形成失败证据。
4. 为 `.dap-pct` 增加原生 CSS `text-align: right`，并将固定占位从 `4ch` 扩至可完整容纳 `100%` 的 `5ch`，保持既有 DOM 不变。
5. 更新人工验收证据并重建 client bundle。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-009/AC-06 | 百分比文字右缘对齐契约变化 | E2E/MANUAL | update | 比较百分比文字与下一行耗时文字的右缘，并目验不同位数下保持对齐 |
| DESIGN | 运行卡进度行与统计行的跨行几何关系变化 | E2E/MANUAL | update | 同步设计描述与浏览器几何断言 |

## 测试计划

- 测试先行：更新 `session-lifecycle` browser E2E，使现有左对齐实现失败。
- 运行受影响的 focused browser E2E。
- 运行 `pnpm verify:fast` 与 `pnpm verify`。
- 刷新现有 GUI，目验百分比右缘与耗时右缘对齐。
- 调用 `code-review` skill 做独立双轴审核并处理 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：百分比文字右缘与统计行耗时文字右缘对齐 | `package.json::test:e2e`、`e2e/specs/session-lifecycle.mjs#R-01-009/AC-06`、`scripts/acceptance.mjs#R-01-009/AC-06` |
| 异常 | 不适用：纯 CSS 文本对齐，无失败路径 | — |
| 边界配置 | 适用：9% 到 100% 均在固定 5ch 占位内完整右对齐，窄卡宽不漂移 | `package.json::test:e2e`、`e2e/specs/session-lifecycle.mjs#R-01-009/AC-06`、`package.json::accept:manual`、`scripts/acceptance.mjs#R-01-009/AC-06` |
| 副作用 | 适用：进度条、统计行与计算不变，占位仅扩至容纳 100% | `package.json::check`、`scripts/check.mjs#R-01-009/AC-05`、`package.json::test:e2e`、`e2e/specs/session-lifecycle.mjs#R-01-009/AC-06` |

## 终态与证据

- 实现: 待填写。
- 测试: 待填写。
- DESIGN 对照: 待填写。
- commit: 待填写。
- review: 待填写。
