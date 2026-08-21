---
doc-type: task
mutation: lifecycle
id: T-008
---

# T-008 修复 T-007 测试证据契约

状态: completed
关联: R-01-012 / 活动状态模型、窗格渲染器；R-01-013 / 活动状态模型、窗格渲染器；R-02-003 / 窗格渲染器
风险等级: standard

## 背景与目标

T-007 独立 Standards 复审指出 `scripts/check.mjs` 新增的 badge、batch、history fallback 断言直接匹配实现字符串，违反“断言可观察行为而非内部实现”。本 task 只修正测试证据，不改变已通过复审的生产实现。

## 差距评估

- `scripts/check.mjs` 当前新增了对 `needsHistorySnapshot`、`Promise.all(pending)` 和具体 CSS 片段的 bundle 字符串断言。
- 其中 snapshot 判定已有纯函数行为断言；batch 协调与 badge 视觉属于 browser runtime，字符串匹配不能证明实际行为。

## 收敛方案

- 删除依赖 `snapshotNeedsHistory`、`Promise.all(pending)` 和具体 CSS 片段的字符串断言。
- 保留 `needsHistorySnapshot` 的纯函数行为断言，以及已有 history/message/timeline 数据行为断言。
- bundle 检查只保留对外契约（native API 使用、无 mux/fetch、token DOM 顺序、无独立状态行）；badge 视觉和批量重绘属于 browser-only 人工 acceptance。
- 不新增测试框架、DOM 模拟器或只为测试服务的生产抽象。

## 测试计划

- `node scripts/check.mjs`。
- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`。
- `git diff --check`。
- 重新执行 Standards/Spec 独立复审。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：保留 cold/open snapshot、history、timeline 和消息预览行为断言 | `scripts/check.mjs#R-01-012/AC-01`、`src/core.mjs::needsHistorySnapshot` |
| 异常 | 适用：空 payload 与缺失字段继续归一为空 | `scripts/check.mjs#R-01-013/AC-03`、`src/core.mjs::messagePreviews` |
| 边界配置 | 适用：空/open snapshot 和无消息 history 的结果保持确定 | `scripts/check.mjs#R-01-012/AC-01`、`src/core.mjs::needsHistorySnapshot` |
| 副作用 | 适用：bundle 仍无 mux/fetch/独立状态行，token DOM 顺序不回归 | `scripts/check.mjs#R-02-004/AC-01`、`src/client.mjs::syncLiveness` |
| 兼容性 | 适用：模型/history native API 与订阅契约保留 | `scripts/check.mjs#R-02-001/AC-01`、`src/core.mjs::buildEntries` |

## 终态与证据

- 实现: 删除 `scripts/check.mjs` 中绑定 `needsHistorySnapshot`、`Promise.all(pending)` 与具体 CSS 片段的实现字符串断言；保留 cold/open snapshot、history、timeline、message preview、native API、订阅与 DOM 顺序等可观察契约检查。
- 测试: `node scripts/check.mjs` 通过；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过；`git diff --check` 通过。badge 视觉与批量渲染时序由 `scripts/acceptance.mjs` 人工 GUI 清单验证，未用字符串断言冒充运行时测试。
- DESIGN 对照: T-007 生产实现未变更；测试仅调整证据方式，符合“行为变化留可执行证据、bundle 仅检查对外契约”的边界。
- commit: 99e89cf
- review:
  - 审核方: Standards 子代理 `0ed85df2-8145-48df-a4dc-882953ff4ea6`；Spec 子代理 `7c721f06-855a-4fcf-a56c-7bc406f56ed3`。
  - 目的理解: 将测试从内部实现字符串匹配改为可观察行为与对外契约证据，避免用函数名/CSS/Promise 表达式证明用户行为。
  - 执行方式: `code-review` skill；固定基线 `69ef831`，范围为 `git diff 69ef831...HEAD` 的 T-008 测试改动；Standards/Spec 双轴复审。
  - 问题与修复: Standards 初审发现三个实现字符串断言违反 AGENTS.md；已全部删除，保留 `needsHistorySnapshot` 纯函数行为断言与现有对外 bundle 契约。Spec 复审确认无需求回归。
  - 复审结论: Standards 通过；Spec 通过；无新增 Fowler smell。
