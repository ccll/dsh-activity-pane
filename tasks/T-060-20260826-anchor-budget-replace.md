---
doc-type: task
mutation: lifecycle
id: T-060
---

# T-060 指令锚行计入时间线总预算与新指令攀顶顶替

状态: active
关联: R-01-012、R-01-017 → 活动状态模型
风险等级: standard

## 背景与目标

东家实测 T-059 交付的指令锚行后发现两点：

1. 锚行 + 下方 4 个显示行合计 5 行，超出期望密度；要求时间线总行数（含锚行）恒不超过 4——锚行出现时下方窗口收缩为最近 3 行，无锚行时仍为最近 4 行。
2. 新指令从末行逐行上移、到达第 2 行时与第 1 行旧锚行相邻并列，两条用户消息并列迷惑；要求此时新指令直接顶替旧锚（旧锚消失、各行上移一位），总行数暂减为 3，随后续新行回填恢复，总体恒不超过 4、可少于 4（会话开始阶段本就有少于 4 行的过程）。

实质推翻 C-022 被否方案「锚行出现后下方缩为 3 行保持总高恒定」（当时判为信息无谓减少）。map 演进同次完成并经东家确认：PRD R-01-012/AC-12 补总预算口径、新增 AC-15（顶替规则）、R-01-017/AC-06 补收缩口径；DOMAIN 术语与不变量同步；DESIGN 折叠时间线条目同步；DECISIONS 追加 C-023。

## 差距评估

- `src/core.mjs::foldedConversationTimeline`：现为「窗口 last-4 + 锚行前置」共 5 行；需改为「预扫窗口前是否存在非空文本用户行 → 有则窗口收缩 last-3，窗口首行为非空文本用户行时直接顶替（不叠加旧锚）」。
- `scripts/check.mjs`：两处长度断言（5 行）需改 4 行；缺顶替/回填用例。
- `scripts/acceptance.mjs`：AC-12～AC-14 人工验收点需补总预算与顶替口径。

## 收敛方案

单提交收敛：实现（src/core.mjs + 重建 bundle）+ 测试（check.mjs、acceptance.mjs）+ map（PRD/DOMAIN/DESIGN/DECISIONS）同次入库。

实现要点（`foldedConversationTimeline` 出口分支）：

1. 先按无锚窗口（last-max）预扫起点之前是否存在非空文本用户行；无则原样返回（无锚，至多 max 行）。
2. 有则窗口收缩为 last-(max-1)；若收缩窗口首行本身是非空文本用户行 → 直接顶替（返回收缩窗口，总行数 max-1，AC-15）。
3. 否则重扫收缩窗口起点之前最近的非空文本用户行，标记 anchor 前置返回（合计不超过 max，AC-12）。

## 测试计划

- `pnpm build:client && pnpm check` 全绿：长度断言改 4 行；新增顶替用例（更近用户行攀至窗口首行 → 总行数 3、旧锚消失）与回填用例（随后新行使总行数恢复 4、锚行切换为更近指令）；既有锚行族（挤出/窗口内/扩窗不足/steering/hidden/空文本）回归。
- `python3 tools/agentmap_lint.py --report` 追溯完整（21 需求 / 109 AC 全锚定）。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 人工核验。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：锚行出现时总行数 4（锚 + 最近 3 行）；新指令攀至窗口首行顶替旧锚后暂 3 行，随后回填恢复 4 行 | `scripts/check.mjs#R-01-012/AC-15`、`src/core.mjs::foldedConversationTimeline` |
| 异常 | 适用：无窗口前用户行时无锚行（总行数至多为 max 的窗口行） | `scripts/check.mjs#R-01-012/AC-13`（负向用例）、`src/core.mjs::foldedConversationTimeline` |
| 边界配置 | 适用：max=4 与 max=1 边界下顶替/收缩不越界；会话开始阶段少于 4 行为正常 | `scripts/check.mjs#R-01-012/AC-12`、`src/core.mjs::foldedConversationTimeline` |
| 副作用 | 适用：顶替路径不叠加旧锚、不新增 DOM 分支；渲染层 DOM 复用键不变（顶替行即窗口首行普通用户行） | `scripts/check.mjs#R-01-012/AC-15`、`src/client.mjs::renderTrace` |

## 终态与证据

（关闭时填写）
