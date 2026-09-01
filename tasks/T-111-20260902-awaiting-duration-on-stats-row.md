---
doc-type: task
mutation: lifecycle
id: T-111
---

# T-111 等待卡耗时归位统计行

状态: active
关联: R-01-009/AC-12 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

- 背景: T-110 为 awaiting 卡恢复了 token 统计，但固定回合耗时仍显示在「已完成/等待」类型胶囊同行；运行卡的相同耗时位于 token 统计行最右侧，造成同一统计信息在状态间换行。
- 目标: 完成提醒、阻塞等待与错误提醒卡把固定最近回合耗时显示在 `.dap-token-stats` 最右侧，与 tok/s、缓存、输入/输出处于同一行，视觉结构与运行卡一致。
- 非目标: 不改变耗时取值、冻结方式、token 统计字段、等待类型、正文、按钮、时间线、历史卡、排序或订阅生命周期；不把等待时间计入回合耗时，不新增轮询、路由、持久化或依赖。
- 需求闸口: 东家本次明确要求将「已完成」胶囊后的耗时移回 tok/s 统计行末尾，保持与运行中的活动会话一致。

## 差距评估

- `src/client.mjs::cardChildren("awaiting")` 同时在 `.dap-await-head` 与 `.dap-token-stats` 预留 `.dap-token-time`；当前 `renderTokenStats(..., { showTime: false })` 清空统计行耗时，`renderAwaitingDuration` 将耗时写入胶囊行。
- `.dap-await-head .dap-token-time` 的 CSS 和渲染逻辑把等待卡耗时绑定在等待胶囊同行；需要移除该展示路径，同时清理热更新/旧骨架中的残留节点。
- 运行卡与最近卡已由默认 `renderTokenStats` 在统计行右侧显示耗时；等待卡只需复用同一默认路径，不需要新的格式化或数据来源。
- 既有 `R-01-009/AC-12`、T-110 文档与 E2E 断言仍描述胶囊同行耗时，需同步更新为统计行位置；T-110 已终态，不修改其历史内容。

## 收敛方案

1. 更新 `PRD.md` 的 `R-01-009/AC-12`，将等待卡固定耗时位置改为 `.dap-token-stats` 最右侧，并明确等待类型胶囊同行不重复显示。
2. 更新 `DESIGN.md`、`DOMAIN.md`、README 与 `scripts/acceptance.mjs`，同步等待卡产品契约、领域不变量和验收文字。
3. 在 `src/client.mjs` 移除 awaiting 统计行的 `showTime: false` 特例，使其复用运行卡统计行耗时；awaiting 骨架不再为胶囊头添加耗时节点；保留旧热骨架清理逻辑，避免短时重复显示。
4. 更新 `scripts/check.mjs` 的 bundle 结构断言；将 `session-lifecycle.mjs`、`auto-update.mjs`、`error-reminder.mjs` 的耗时查询与布局断言切换到 `.dap-token-stats`，并继续验证等待期间冻结、刷新恢复与不重复。
5. 重建 `.dsh-plugin/client.js`，运行快速、focused 与完整验证，刷新核验现有 GUI，并完成独立 `code-review`。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-009/AC-12 | 修改等待卡固定耗时位置 | UNIT/E2E/MANUAL | modify | `scripts/check.mjs#R-01-009/AC-12`、三类等待 E2E 与 `scripts/acceptance.mjs#R-01-009/AC-12` |
| R-01-009/AC-13 | 统计字段与耗时同一统计行 | E2E | regression | `session-lifecycle.mjs`、`auto-update.mjs`、`error-reminder.mjs` 均断言统计行位置与耗时 |
| R-01-002 | 等待胶囊、正文、确认按钮与脉冲语义保持不变 | E2E | regression | 既有三类等待结构、按钮和脉冲断言继续通过 |
| R-01-013/AC-12 | 最近卡统计行右侧耗时保持不变 | E2E | regression | `session-lifecycle.mjs` 既有最近卡统计与刷新恢复断言继续通过 |
| R-02-004 | 不新增订阅/轮询，继续复用既有统计派生 | UNIT/E2E | regression | `scripts/check.mjs` 与完整 E2E 门禁 |
| DESIGN | 等待卡耗时渲染位置与兼容清理语义变化 | UNIT/E2E | update | `scripts/check.mjs#R-01-009/AC-12` 与三类等待 E2E |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：done、blocked、error 等待卡均在 `.dap-token-stats` 最右侧显示固定耗时，统计字段仍在左侧 | `scripts/check.mjs#R-01-009/AC-12`、`package.json::check`、`e2e/specs/session-lifecycle.mjs::R-01-009/AC-12`、`e2e/specs/auto-update.mjs::R-01-009/AC-12`、`e2e/specs/error-reminder.mjs::R-01-009/AC-12` |
| 异常 | 适用：统计字段缺失时不伪造；耗时缺少有效边界时不显示；胶囊行不残留重复耗时 | `scripts/check.mjs#R-01-009/AC-12`、`package.json::check`、`e2e/specs/error-reminder.mjs::R-01-009/AC-12` |
| 边界配置 | 适用：统计全空但耗时可用时仍显示统计行；等待卡不显示进度条/条纹；窄卡统计左侧允许省略而耗时保持右侧可见 | `scripts/check.mjs#R-01-009/AC-12`、`package.json::check`、`e2e/specs/session-lifecycle.mjs::R-01-009/AC-12` |
| 副作用 | 适用：等待胶囊、正文、按钮、时间线、等待脉冲、最近卡统计与固定耗时取值不变 | `e2e/specs/auto-update.mjs::R-01-002/AC-09`、`e2e/specs/error-reminder.mjs::R-01-002/AC-10`、`e2e/specs/session-lifecycle.mjs::R-01-013/AC-12`、`scripts/check.mjs#R-01-009/AC-12`、`package.json::check` |
| 恢复 | 适用：页面刷新后三类等待卡仍从既有 retained/projection 恢复统计行耗时 | `e2e/specs/session-lifecycle.mjs::R-01-009/AC-12`、`e2e/specs/auto-update.mjs::R-01-009/AC-12`、`e2e/specs/error-reminder.mjs::R-01-009/AC-12` |

## 测试计划

- 先更新 map、bundle 契约与三类等待 E2E，运行 `node scripts/check.mjs` 及 focused E2E，确认旧耗时位置实现按预期失败。
- 实现后运行 `pnpm verify:fast` 与 `pnpm exec node e2e/run.mjs session-lifecycle auto-update error-reminder`。
- 重建 `.dsh-plugin/client.js`，刷新核验 `http://127.0.0.1:3080/`。
- 调用 `code-review` skill 做 Standards/Spec 双轴独立审核，修复并复审全部 finding。
- 最终运行 `pnpm verify`，记录精确结果后关闭 task。

## 终态与证据

状态: active

- 实现: 待实现。
- 测试: 待运行。
- DESIGN 对照: 待实现后填写。
- commit: 待提交。
- review:
  - 审核方: 待审核。
  - 目的理解: 待审核。
  - 执行方式: 待审核。
  - 问题与修复: 待审核。
  - 复审结论: 待审核。
