---
doc-type: task
mutation: lifecycle
id: T-022
---

# T-022 最近历史卡标题常规字重

状态: active
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

（待填写）
