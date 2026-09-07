---
doc-type: task
mutation: lifecycle
id: T-114
---

# T-114 修复工作区胶囊背景与描边对比度

状态: active
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

状态: active

- 实现: 待完成。
- 测试: 待完成。
- DESIGN 对照: 待完成。
- commit: 待提交。
- review: 待调用 `code-review` skill 做 Standards/Spec 双轴审核。
