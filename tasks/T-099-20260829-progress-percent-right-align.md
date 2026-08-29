---
doc-type: task
id: T-099
mutation: lifecycle
---

# T-099 进度百分比与耗时右缘对齐

风险等级: standard
状态: completed

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

- 实现: `src/client.mjs` 将 `.dap-pct` 固定占位由 `4ch` 扩至完整容纳粗体 `100%` 的 `5ch`，并增加 `text-align: right`；既有 DOM、进度计算与统计行结构不变；`.dsh-plugin/client.js` 已同步重建。
- 测试: 测试先行——新增文字右缘断言后旧实现 focused `session-lifecycle` 按预期失败；实现后 focused E2E 通过。审核修复继续补齐实际 `200px` 窗格、进度条正宽、文字不越百分比占位、占位不越卡片、卡片不越窗格右界的几何断言。最终 `pnpm verify:fast` 通过；`pnpm verify` 全部 12 个 spec 通过（133137ms）；`git diff --check` 干净。现有 `http://127.0.0.1:3080/` 经 Playwright 刷新后确认窗格已加载新样式（`.dap-pct` 计算宽度 `33.3594px`、`textAlign: right`）。回滚边界为 `PRD.md`、`DESIGN.md`、`src/client.mjs`、`.dsh-plugin/client.js`、`e2e/specs/session-lifecycle.mjs`、`scripts/acceptance.mjs` 中 T-099 对应变更，不影响其它行为。
- DESIGN 对照: 与 R-01-009/AC-06 及 DESIGN 的运行卡外观、渲染期字段、回合进度条目一致：百分比在固定占位内右对齐，与下一行最右侧耗时文字共用右缘；最窄窗格下进度条仍可见，100% 不溢出；无差异。
- commit: fa264ed
- review:
  - 审核方: Standards reviewer `f4c5b09f-0a80-4f43-95a2-0ab1a22b156a`；Spec reviewer `04e4ee2d-67dc-47c8-83ca-0594111f71f1`。
  - 目的理解: 将运行卡进度百分比在固定占位内向右对齐，使其文字右缘与下一行最右侧耗时文字右缘对齐；完整容纳 `100%`，并在实际 `200px` 最窄窗格下保持进度条可见且不越过卡片/窗格边界；关联 PRD R-01-009/AC-05、AC-06、DESIGN 与 T-099。
  - 执行方式: `code-review` skill，以 `d770e2343cb82e3255d65d0188d1f480b024e6e7` 为固定基线，Standards/Spec 双轴独立审核 `d770e23...fa264ed`；每轮修复后复审完整范围。
  - 问题与修复: Standards 全程无 finding。Spec 初审发现 E2E 只比较右缘，未证明 `100%` 完整落在固定占位且未覆盖 `200px` 最窄宽，已在 `dd7a95b` 增加 Range 左缘与窄宽进度条断言；后续复审要求进一步证明实际 pane 宽度及 `textRight <= pctRight <= cardRight <= paneRight`，已在 `fa264ed` 补齐逐层边界断言。
  - 复审结论: Standards Hard 0、Judgement 0；Spec 原 finding 已关闭、剩余 findings 0，双轴最终通过。
