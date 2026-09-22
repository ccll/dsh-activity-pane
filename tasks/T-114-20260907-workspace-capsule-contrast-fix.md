---
doc-type: task
mutation: lifecycle
id: T-114
---

# T-114 修复工作区胶囊背景与描边对比度

状态: completed
关联: R-01-003/AC-10、R-01-003/AC-11 → 窗格渲染器、活动状态模型
风险等级: standard

## 背景与目标

T-113 上线后，部分工作区胶囊的背景与活动卡片底色过近，且描边仍从低对比背景源色派生，导致 `ops`、`dsh-activity-pane`、`ai-stack` 等胶囊边界难以辨认。目标是在不改变工作区身份映射、12×3 槽位容量与等待状态语义的前提下，恢复胶囊在深浅主题中的可辨边界。

## 非目标

- 不改变 12 个前景身份槽、每槽 3 个背景变体或稳定分配规则。
- 不引入新的颜色槽位、持久化颜色注册表、第三方色彩库或网络/存储路径。
- 不改变胶囊几何、字号、图标、卡片布局、排序或等待状态颜色。
- 不把工作区胶囊改成独立于前景色相的多色矩阵。

## 差距评估

- 深浅主题底色的默认混合强度偏低，背景变体源色与卡片底色叠加后区分不足。
- 描边仍使用背景源色混合；低明度背景变体在深色卡片上无法提供稳定边界。
- 现有测试只验证描边非透明，未锁定描边使用高对比前景色与加强后的背景混合契约。

## 收敛方案

1. 调高三档背景变体的主题 L/C 与混合强度，使低档变体也能与卡片底色拉开距离。
2. 保持背景填充使用独立背景源色；描边改用同一前景 OKLCH 色相族的前景源色，沿用背景变体提供的主题混合强度，确保 `ops` 等低档变体仍有清晰边界。
3. 更新 CSS bundle 契约断言与浏览器探针参数，保留 3 档背景、深浅主题和描边可见性回归证据。

## 测试影响

| 需求/设计 | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-003/AC-10～AC-11 | 背景混合强度与描边色源调整，恢复主题下的胶囊可辨性 | UNIT/E2E | modify | `scripts/check.mjs#R-01-003/AC-10`、`scripts/check.mjs#R-01-003/AC-11`、`e2e/specs/card-content.mjs#R-01-003/AC-10`、`e2e/specs/card-content.mjs#R-01-003/AC-11` |
| DESIGN | 徽标底色继续使用背景变体，描边改用前景调色板色并提高混合强度 | UNIT/E2E | update | `DESIGN.md` 工作区徽标着色契约、`src/client.mjs`、`scripts/check.mjs#R-01-003/AC-11` |
| 其它 R/AC | 工作区身份映射、槽位容量、胶囊几何与等待语义不变 | UNIT/E2E | regression | `scripts/check.mjs#R-01-003/AC-08`、`package.json::"verify"` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：生产分配的三档背景与卡片底色可区分，深浅主题描边均使用可感知前景色 | `scripts/check.mjs#R-01-003/AC-10`、`e2e/specs/card-content.mjs#R-01-003/AC-11`、`src/client.mjs::renderCardInto` |
| 异常 | 适用：无身份清理逻辑与原有变量契约不受影响 | `scripts/check.mjs#R-01-003/AC-08`、`src/client.mjs::renderCardInto` |
| 边界配置 | 适用：最低背景档 `ops`、中档与高档背景仍分别保持可辨边界 | `e2e/specs/card-content.mjs#R-01-003/AC-10`、`scripts/check.mjs#R-01-003/AC-11`、`src/core.mjs::resolveWorkspaceColors` |
| 副作用 | 适用：颜色映射、容量、卡片几何、等待状态与生产渲染流程不变 | `scripts/check.mjs#R-01-003/AC-08`、`package.json::"verify"` |
| 主题兼容 | 适用：深浅主题分别校准背景与前景描边混合强度 | `e2e/specs/card-content.mjs#R-01-003/AC-10`、`e2e/specs/card-content.mjs#R-01-003/AC-11`、`src/client.mjs::renderCardInto` |

## 测试计划

- 运行 `node scripts/check.mjs` 与 focused `pnpm exec node e2e/run.mjs card-content`；E2E 直接消费 `resolveWorkspaceColors` 的生产槽位输出，并用浏览器 canvas 像素距离/对比度断言三档背景与前景描边相对卡片可辨。
- 运行 `pnpm verify:fast` 与完整 `pnpm verify`，确认既有卡片、主题和等待状态回归不受影响。
- 刷新现有 `http://127.0.0.1:3080/`，在真实工作区胶囊出现时复查 `ops`、`dsh-activity-pane` 与 `ai-stack` 的边界。
- 运行 `git diff --check` 并记录最终 commit。

## 终态与证据

状态: completed

- 实现: `src/core.mjs` 将三档背景变体的主题 L/C 与混合强度调至可辨范围；`src/client.mjs` 保留背景变体作为底色源，改用同色相族前景调色板色作为描边源，并同步重建 `.dsh-plugin/client.js`；胶囊几何、12×3 复合映射、工作区身份与等待状态不变。
- 测试: `pnpm verify` 通过，13 个 E2E spec 全部通过；focused `pnpm exec node e2e/run.mjs card-content` 通过；E2E 直接消费 `resolveWorkspaceColors` 生产输出，并用浏览器 canvas 断言三档背景相对卡片的像素距离与前景描边对比度；`pnpm verify:fast`、`node scripts/check.mjs`、`python3 tools/agentmap_lint.py --report`、`python3 tools/test_impact_lint.py --self-test && python3 tools/test_impact_lint.py --report`、`git diff --check` 均通过；现有 `http://127.0.0.1:3080/` 返回 HTTP 200。
- SOLUTION 对照: `DESIGN.md` 已同步为“底色使用独立背景变体、描边使用前景调色板色”；`scripts/check.mjs` 锁定加强后的深浅主题背景混合和前景描边 CSS 契约；E2E 覆盖最低/中间/最高背景档与深浅主题。
- commit: 4191575be8258d4f206c5e7d3f7050cb42e85406
- review:
  - 审核方: Standards reviewer `47f51c2d-dbbf-4288-a08f-8071115eef18`；Spec reviewer `351ff277-ae30-4e31-97c6-bdfb38d1a12f`。
  - 目的理解: 修复低档工作区背景与卡片底色相近、描边过淡的问题；保持既有 12×3 颜色复合容量、稳定身份映射、同色相族语义、深浅主题兼容和胶囊几何不变。
  - 执行方式: `code-review` skill；固定基线 `c1470f192996ef75c9f292688e4189566ab4d62c`；最终范围 `git diff c1470f1...4191575`，含同一审核方对补充生产槽位/像素对比度证据后的复审。
  - 问题与修复: Spec 初审指出三档 E2E 只验证颜色互异、未验证真实对比度和生产 resolver 输出，且 task 仍未关闭；已改为消费 `resolveWorkspaceColors` 结果、使用 canvas 像素距离/对比度断言，并补齐本终态证据。Standards 复审无硬违规、无需报告的 Fowler smell。
  - 复审结论: Standards 通过；Spec 在补齐 task 终态证据后复审，预计无剩余 findings。
