---
doc-type: task
id: T-096
mutation: lifecycle
---

# T-096 进度百分比移至进度条后

风险等级: standard
状态: active

## 背景与目标

- 背景: 运行卡当前把进度百分比放在会话标题之后，百分比与其实际说明的进度条分离。
- 目标: 将运行卡的进度百分比移到进度条右侧，并与进度条保持同一行。
- 非目标: 不改变进度计算、标题内容、统计行、卡片状态或其它布局。

## 差距评估

- `src/client.mjs` 在标题行创建 `.dap-pct`，进度条则作为标题行后的独立节点。
- `PRD.md` 与 `DESIGN.md` 尚未明确百分比相对进度条的位置。

## 收敛方案

1. 修订 R-01-009/AC-06，明确百分比紧跟进度条右侧、两者同行。
2. 在 DESIGN 的运行卡外观与产品契约中记录该几何关系。
3. 运行卡骨架增加最小进度行容器，内部依次放置可伸缩进度条与固定宽百分比。
4. 更新 browser E2E 与人工验收证据，重建 client bundle。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-009/AC-06 | 百分比与进度条的布局契约变化 | E2E/MANUAL | update | 验证百分比不再位于标题行，且在同一进度行中紧跟进度条右侧并保持固定宽度 |
| DESIGN | 运行卡进度行几何关系变化 | E2E/MANUAL | update | 更新设计、浏览器布局断言与人工验收步骤 |

## 测试计划

- 测试先行：更新 browser E2E，使旧标题行布局失败。
- 运行 `pnpm verify:fast`。
- 运行受影响的 focused browser E2E。
- 运行 `pnpm verify`。
- 在现有 GUI 刷新后目验运行卡标题末尾无百分比，进度条右侧显示百分比。
- 调用 `code-review` skill 做独立双轴审核并处理 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：百分比在进度条右侧且同行 | `package.json::test:e2e`、`e2e/specs/session-lifecycle.mjs#R-01-009/AC-06`、`package.json::accept:manual`、`scripts/acceptance.mjs#R-01-009/AC-06` |
| 异常 | 不适用：纯呈现位置调整，无失败路径 | — |
| 边界配置 | 适用：位数变化不改变百分比占位，窄卡宽下进度条收缩、百分比保持可见 | `package.json::test:e2e`、`e2e/specs/session-lifecycle.mjs#R-01-009/AC-06`、`package.json::accept:manual`、`scripts/acceptance.mjs#R-01-009/AC-06` |
| 副作用 | 适用：标题、省略、进度宽度、统计行顺序不变 | `package.json::check`、`scripts/check.mjs#R-01-009/AC-05`、`package.json::test:e2e`、`e2e/specs/session-lifecycle.mjs#R-01-009/AC-06` |

## 终态与证据

- 实现: `src/client.mjs` 新增 `.dap-progress` 进度行，标题行移除 `.dap-pct`；进度行依次承载可伸缩 `.dap-track` 与 4ch 固定宽 `.dap-pct`，统计行顺序不变；`.dsh-plugin/client.js` 已重建。
- 测试: 测试先行新增 browser E2E，裁决百分比右置、同行、脱离标题行及 9%→100% 占位宽度稳定；focused `session-lifecycle` 通过（9.567s）；`pnpm verify:fast` 通过；最终 `pnpm verify` 12/12 通过（134.266s）；`pnpm lint:agentmap` 与 `git diff --check` 通过；现有 `http://127.0.0.1:3080/` 刷新验证窗格已加载含 `.dap-progress` 与 `.dap-pct { width: 4ch; }` 的新 bundle。
- DESIGN 对照: R-01-009/AC-06 与 DESIGN 已明确标题行不承载百分比，进度行按进度条、百分比顺序同行呈现；百分比固定 4ch 占位，进度计算、标题内容、统计行与其它布局未改变。
- commit: 待提交。
- review:
  - 审核方: Standards reviewer `9e1685ba-9307-427e-8849-e872ad730131`；Spec reviewer `69ea1d56-ba15-4975-9c0e-9234be1bc158`。
  - 目的理解: 将运行卡标题后的进度百分比移到进度条右侧并同行呈现，保持位数变化时占位稳定，不改变进度计算、标题内容、统计行与其它布局。
  - 执行方式: `code-review` skill，以 `6ebbe64d483073b2242e5a35cbf268f56cbf1f2c` 为固定基线审核当前工作树与 T-096，Standards/Spec 双轴独立并行评审并由原审核方复审。
  - 问题与修复: Standards 初审发现新增 contract 断言依赖 bundle 内部字面量、源码注释复述 DOM 结构，已删除并改由 browser E2E 裁决；后续发现验证矩阵把源码 fixture 与已删除断言列为可执行证据，已改为 E2E/manual 及其 package 执行入口。Spec 初审发现 `.dap-pct` 未兑现固定宽，已增加 `width: 4ch` 并新增 9%→100% 宽度稳定 E2E。
  - 复审结论: Standards Hard 0、Judgement 0；Spec findings 0，双轴最终通过。
