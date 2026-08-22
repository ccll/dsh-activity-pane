---
doc-type: task
mutation: lifecycle
id: T-022
---

# T-022 最近历史卡标题常规字重

状态: completed
关联: R-01-013/AC-09 / 窗格渲染器
风险等级: standard

## 背景与目标

TODO 条目「历史会话标题使用常规字重，不再加粗」经东家确认升级为 R-01-013/AC-09：最近历史卡与活动卡共用 `.dap-title`（font-weight: 700），历史区标题加粗使已结束会话视觉强调过高。目标：最近卡标题使用常规字重，活动卡标题保持加粗不变。

## 差距评估

- `src/client.mjs` 的 `.dap-title` 统一 `font-weight: 700`，无 `data-kind="recent"` 覆盖；仅需一条 CSS 覆盖。
- 数据层（`src/core.mjs`）与 DOM 结构不变，纯呈现调整。
- T-005 撤回的是最近卡内容增强（工作区徽标/最后活动概览），与字重无关，无否决史冲突。

## 收敛方案

- 在 `.dap-title` 规则后增加 `[data-dsh-activity-pane] .dap-card[data-kind="recent"] .dap-title { font-weight: 400; }`。
- 不改动活动卡、子代理卡标题字重，不改动 DOM 结构与数据流。

## 测试计划

- `scripts/check.mjs`：bundle 契约断言最近卡标题字重覆盖规则存在且活动卡保持 700。
- `scripts/acceptance.mjs`：新增 R-01-013/AC-09 人工验收步骤。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：最近卡标题常规字重、活动卡保持加粗 | `scripts/check.mjs#R-01-013/AC-09`、`src/client.mjs::CSS` |
| 异常 | 不适用：纯 CSS 呈现调整，无数据/失败路径 | — |
| 边界配置 | 适用：长标题截断与布局不受字重影响 | `scripts/check.mjs#R-01-013/AC-02`、`src/client.mjs::CSS` |
| 副作用 | 适用：不改动 DOM 结构、数据流与活动卡呈现 | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::CSS` |

## 终态与证据

- 实现: `src/client.mjs` 在 `.dap-title` 基础规则后新增 `[data-dsh-activity-pane] .dap-card[data-kind="recent"] .dap-title { font-weight: 400; }` 覆盖；活动卡与子代理卡标题保持 700；`.dsh-plugin/client.js` 已重新生成。
- 测试: `node scripts/check.mjs` 通过（新增 R-01-013/AC-09 bundle 契约断言）；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过；`git diff --check` 通过；`curl -fsS -I http://127.0.0.1:3080/` 返回 HTTP 200。`scripts/acceptance.mjs` 新增 R-01-013/AC-09 人工验收步骤（常规字重与活动卡加粗区分），真实视觉结果仍需人工 GUI 验收。
- DESIGN 对照: 样式细节属实现自由，DESIGN 无需演进；R-01-013 需求追溯索引既有行（窗格渲染器 / src/core.mjs、src/client.mjs）保持准确。
- commit: e77eb8b
- review:
  - 审核方: Standards 子代理 `e8553a89-91dd-4482-9e01-6ef723b9f2b7`；Spec 子代理 `4d8f247f-0344-4fdc-b8a0-8413a75d6a84`。
  - 目的理解: 实现 R-01-013/AC-09——最近历史卡标题降为常规字重以降低历史区视觉强调；纯 CSS 覆盖，不改 DOM 结构、数据流与活动卡呈现；关联约束为 AgentMap 纪律、提交规范与 strict 测试锚定。
  - 执行方式: `code-review` skill；固定基线 `96dd4dd`，范围为 `git diff 96dd4dd...HEAD` 的 T-022 工作单元；Standards/Spec 双轴并行审核。
  - 问题与修复: 无 blocking 问题。Standards 两条 judgement call（check.mjs CSS 文本断言脆性、边界配置行以 AC-02 间接论证）与 Spec 一条弱项（活动卡 700 断言对误伤不敏感，区分由 acceptance.mjs 人工步骤锚定）均属既有验证分工与文件约定，不修。
  - 复审结论: Standards 通过；Spec 通过，无遗留 finding，无需复审。
