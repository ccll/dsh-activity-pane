---
doc-type: task
mutation: lifecycle
id: T-060
---

# T-060 指令锚行计入时间线总预算与新指令攀顶顶替

状态: completed
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

- 实现: `src/core.mjs::foldedConversationTimeline` 出口分支重构——预扫无锚窗口起点之前的非空文本用户行（无则原样返回至多 max 行）；有则窗口收缩为最近 max-1 个显示行；收缩窗口首行为非空文本用户行时直接顶替（总行数暂为 max-1）；否则重扫收缩窗口起点之前最近的非空文本用户行标记 anchor 前置返回（合计不超过 max）；settle/尾部提升出口归一为 `finish(rows)` 闭包。`.dsh-plugin/client.js` 同步重建。map 同次演进：PRD R-01-012/AC-12 补总预算口径、新增 AC-15（顶替规则）、R-01-017/AC-06 补收缩口径、AC-14 机制描述改挂 AC-15；DOMAIN 术语与不变量同步「计入总预算、总行数恒 ≤4、攀顶顶替」；DESIGN 折叠时间线条目同步收缩/顶替/非空文本口径；DECISIONS 追加 C-023（修订 C-022 窗口名额决策，附东家实测证据与新被否方案）。
- 测试: `node scripts/build-client.mjs && node scripts/check.mjs` 全绿——新增顶替用例（新指令攀至收缩窗口首行 → 总行数 3、旧锚消失）与回填用例（随后新行恢复 4、锚行切换为更近指令）、max=1 边界用例（锚行独占一行、顶替分支不可达回归保护）、空文本窗口首行不顶替负向用例；既有锚行族（挤出/窗口内/×3 扩窗不足/steering/hidden/空文本）与 T-059 取代切换用例回归通过；`python3 tools/agentmap_lint.py --report` 通过（21 需求 / 109 AC 全锚定）；冒烟推演攀顶序列与东家预期逐帧一致。GUI 人工验收点见 `scripts/acceptance.mjs`（总行数恒 ≤4、顶替暂 3 行后回填，深浅主题），由东家按单核验。
- DESIGN 对照: 折叠时间线条目（锚行出现时窗口收缩 limit-1、总行数不超过 limit、非空文本行攀至收缩窗口首行直接顶替、随后回填恢复）与实现逐项一致；需求追溯索引 R-01-012 落点含指令锚行；DOMAIN「指令锚行」术语/不变量与 PRD/DESIGN/实现同口径。
- commit: d28a5ddd7e8006d6e0762fe209966f72f12ebe18
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards 轴、Spec 轴）
  - 目的理解: T-060 交付两点——指令锚行计入时间线总预算（总行数含锚行恒不超过 4：锚行出现时窗口收缩为最近 3 个显示行，无锚行时仍为最近 4 个）；新用户消息到达收缩窗口首行时直接顶替旧锚行（总行数暂为 3，随后回填恢复，可少于 4 不可多于 4），关联 PRD R-01-012/AC-12～AC-15 与 R-01-017/AC-06、DESIGN 折叠时间线模块、DOMAIN 指令锚行、C-023（修订 C-022）；验证方式为 check.mjs 锚点 + agentmap lint + acceptance.mjs 人工验收。
  - 执行方式: `code-review` skill，评审基线 68d220b4162bb5c057cccbb19c8707126d3d9f78（实现提交 d28a5ddd7e8006d6e0762fe209966f72f12ebe18，含修复后 amend），范围为 map 五文档/src/scripts/bundle/task 全量变更；Standards 对照 AGENTS/CONVENTIONS 与 Fowler 味道基线，Spec 对照 T-060 收敛方案与东家三条验收口径原文。
  - 问题与修复: Standards 轴——无硬违规；三处 settle/promoteRunningTail 返回形状重复（已提取 finish() 闭包归一）；DESIGN 长段与 C-023「修订」措辞两项判断题经裁量维持现状，复审接受。Spec 轴——验证矩阵 max=1 边界证据不实（已补真实用例并兼作顶替分支不可达回归保护）；AC-15 未限定非空文本与实现/AC-12 口径不齐（PRD/DESIGN 已补口径并新增空文本窗口首行不顶替负向用例）；AC-14「移出窗口取代」与 AC-15「首行顶替」机制描述冲突（AC-14 已改为援引 AC-15 顶替规则）。
  - 复审结论: Standards 轴复审通过、Spec 轴复审通过（两轴修复逐项核对，无残留问题）。
