---
doc-type: task
mutation: lifecycle
id: T-025
---

# T-025 两区分隔线留白

状态: active
关联: R-01-010/AC-05 / 窗格渲染器
风险等级: standard

## 背景与目标

TODO 条目「在历史会话列表与活动会话列表之间的分隔线上下增加留白」经东家确认升级为 R-01-010/AC-05：分隔线上 4px、下 6px 的间距过小，上下各增至 10px，两区呼吸感明确。

## 差距评估

- `.dap-recent` 规则 `margin-top: 4px; padding: 6px 8px 0`（border-top 为分隔线本体）；仅需改两个数值。
- 数据层与 DOM 结构不变，纯呈现调整；check.mjs 无针对旧间距的断言。

## 收敛方案

- `.dap-recent`：`padding: 10px 8px 0; margin-top: 10px;`。
- 不改动分隔线颜色、列表 gap 与卡片布局。

## 测试计划

- `scripts/check.mjs`：bundle 契约断言新间距（锚定 R-01-010/AC-05）。
- `scripts/acceptance.mjs`：新增 R-01-010/AC-05 人工验收步骤。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：分隔线上下各 10px 留白 | `scripts/check.mjs#R-01-010/AC-05`、`src/client.mjs::CSS` |
| 异常 | 不适用：纯 CSS 呈现调整，无数据/失败路径 | — |
| 边界配置 | 适用：历史区无内容整段隐藏，分隔线不占位、间距不影响布局 | `scripts/check.mjs#R-01-010/AC-01`、`src/client.mjs::CSS` |
| 副作用 | 适用：不改动 DOM 结构、数据流与卡片呈现 | `scripts/check.mjs#R-01-002/AC-04`、`src/client.mjs::CSS` |

## 终态与证据

（待填写）
