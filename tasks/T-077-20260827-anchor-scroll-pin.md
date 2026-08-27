---
doc-type: task
mutation: lifecycle
id: T-077
---

# T-077 指令锚行滚动停留语义

状态: completed
关联: R-01-012/AC-12～AC-15 → 活动状态模型
风险等级: standard

## 背景与目标

东家实测：活动会话结束一轮后输入新指令，时间线从 4 行塌缩为仅剩新指令 1 行（表现为「清空」）。根因是 `selectTimelineRows` 旧语义「到达即钉首行」且工作行只取锚行之后项，新指令位于会话尾部时工作行名额全部落空。东家重新定义契约并经确认（C-039）：用户消息作为普通显示行自时间线末尾进入、随滚动上升、触顶停留为第一行锚行；更近的非空文本用户消息滚动至第二行时取代旧锚行，其后各行上移、暂减一行；空时间线时首条用户消息直接占据第一行；空文本用户行不参与停留与取代；快照与 history 两路径语义统一。

## 差距评估

- `src/core.mjs` `selectTimelineRows`：旧语义把最近可锚用户行无条件前置首行，`work = list.slice(userIndex + 1)` 只取其后工作行——新指令到达尾部瞬间工作行清零。
- `scripts/check.mjs` 1027–1169 段与 `scripts/acceptance.mjs` 147 段：AC-12～AC-15 断言固化旧语义（含「顶替后暂减为 3、随后回填恢复 4」的弱解读）。
- map 层已先行演进：PRD R-01-012/AC-12～AC-15 改写；DOMAIN「指令锚行」术语与不变量改写；DESIGN 第 148/256/289 行同步；DECISIONS 追加 C-039（修订 C-035 锚行条目）。

## 收敛方案

- `src/core.mjs`：重写 `selectTimelineRows` 为「末尾进入、触顶停留、第二行顶替」窗口语义，按显示行位置判定（链起点 + 逐次顶替迭代）——
  - 链起点：`fallbackAnchor` 充当的窗口外停留锚行优先；否则最早滚动触顶（其后显示行数 ≥ limit-1）的可锚用户行；均无且时间线不足一窗时，自然窗口首行的可锚用户行直接停留（空时间线首条指令占据第一行）；链起点不存在时为纯自然窗口；
  - 逐次顶替：停留锚行之后窗口的首行（显示第二行）为可锚用户行时，该行取代旧锚升上首行、其后各行上移暂减一行——满窗几何为「其后显示行数 ≥ limit-2 的最近可锚用户行」，短窗为锚行后首个历史行；顶替可链式连续发生；
  - `fallbackAnchor` 与窗口内任一可锚用户行文本相同时判为同一消息，不充当停留锚行（避免同一指令双行）；
  - 工作行的真实当前活动行保留末行逻辑（R-01-009/AC-11）原样复用。
- `src/client.mjs`：渲染层只消费最终行序列，无需改动；`snapshotHasAnchorableUserRow` 记账口径不变（输出含用户行的不变量在新语义下保持成立）。
- 测试先行：先改写 `scripts/check.mjs` AC-12～AC-15 锚定断言与 `scripts/acceptance.mjs` 对应条目为新语义失败态，再实现转绿。

## 测试计划

- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 刷新现有 `http://127.0.0.1:3080/` 现场验证：回合结束后输入新指令，时间线保持 4 行滚动不清空，新指令自末尾进入、触顶停留、次条指令到第二行时顶替。
- 独立 `code-review` skill 双轴审核；存在 finding 时由同一 reviewer 复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：新指令末尾进入不清空（[u1,w2,w3,w4]→[u1,w3,w4,u2]）；触顶停留；第二行顶替暂减一随后恢复；空时间线首条指令直接占据第一行；短窗内新指令位于显示第二行即顶替（shortReplace/shortNoReplace）；fallback 停留锚行被顶替（fallReplaced） | `scripts/check.mjs#R-01-012/AC-12`、`scripts/check.mjs#R-01-012/AC-13`、`scripts/check.mjs#R-01-012/AC-14`、`scripts/check.mjs#R-01-012/AC-15`、`src/core.mjs::selectTimelineRows` |
| 异常 | 适用：空文本用户行不停留不顶替、仅作普通行滚动；无可锚用户行且无 fallback 时为纯自然窗口 | `scripts/check.mjs#R-01-012/AC-15`、`src/core.mjs::selectTimelineRows` |
| 边界配置 | 适用：limit=1 时锚行独占一行；长会话 ×3 扩窗前走命中窗口前用户节点；快照窗口无用户行时 fallbackAnchor 充当停留锚行、同文本判为同一消息不双行 | `scripts/check.mjs#R-01-012/AC-13`、`src/core.mjs::foldedConversationTimeline` |
| 副作用 | 适用：真实当前活动行保留末行（R-01-009/AC-11）不受新窗口语义影响；`snapshotHasAnchorableUserRow` 记账不变量保持 | `scripts/check.mjs#R-01-009/AC-11`、`src/core.mjs::selectTimelineRows` |
| 兼容性 | 适用：冷 history 路径（`foldedHistoryTimeline`）与快照路径同一窗口选择，等待卡/最近卡时间线语义一致 | `scripts/check.mjs#R-01-012/AC-13`、`src/core.mjs::foldedHistoryTimeline` |

## 终态与证据

- 实现: `src/core.mjs::selectTimelineRows` 重写为「链起点 + 逐次顶替迭代」位置语义（末尾进入不清空、触顶停留、显示第二行顶替、短窗同口径、fallback 充当窗口外停留锚行且同文本判同不双行）；`src/client.mjs` 零改动（渲染层消费最终行序列，`snapshotHasAnchorableUserRow` 不变量保持）。
- 测试: 测试先行（先红后绿）；`scripts/check.mjs` AC-12～AC-15 锚点断言按新语义重写并新增 shortReplace/shortNoReplace/fallReplaced 三锚点，`scripts/acceptance.mjs` 人工条目同步；`pnpm build:client && pnpm check` 全绿；`agentmap_lint --report` 通过（22/22 需求、127/127 验收点锚定）；`git diff --check` 干净。GUI 目验项（回合结束后新指令不清空、触顶停留、第二行顶替）由东家现场验收。
- DESIGN 对照: DESIGN 第 148/256/289 行与实现一致（fallbackAnchor 兜底、链起点+逐次顶替位置语义、满窗/短窗两口径）；DOMAIN「指令锚行」术语与不变量、PRD R-01-012/AC-12～AC-15、DECISIONS C-039 互洽；无 DESIGN-实现偏差。
- commit: 5a21b4a97802cd0172bef1e338f187cf6375c039
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards 轴 4a9acb81、Spec 轴 7051f187）
  - 目的理解: 两轴 reviewer 均先读取 PRD R-01-012/AC-12～AC-15、DOMAIN 指令锚行术语、DECISIONS C-039、DESIGN 窗口选择段落与本任务文件，明确被审代码目的为「修复回合结束后新指令清空时间线，落地东家确认的末尾进入/触顶停留/第二行顶替契约，快照与冷 history 两路径统一」，预期行为与验证方式（check.mjs 锚点断言、node 复现脚本）记录于各自首轮报告。
  - 执行方式: `code-review` skill 双轴并行子代理审核，评审基线 05cfc5fd61f248d594a8b9417fcb976de61e0268（HEAD~1），范围为首轮提交及复审提交的全量 diff；首轮审 64be9aa，该提交因硬性违规拆分后重做为 5a21b4a97802cd0172bef1e338f187cf6375c039，由同一审核方复审。
  - 问题与修复: Standards 轴首轮 2 项硬性违规（提交夹带 T-077/T-078 E2E map 内容——已拆分剔除；task 文件未入库——已重排为 T-077 并入库）+ 2 项 smell（pin 出口逐字重复、max-1/max-2 幻数口径不一——随算法重构消除）；Spec 轴首轮 1 项缺失（fallback 被顶替无锚点——已补 fallReplaced）、1 项 scope creep（同上拆分）、1 项语义偏差（短窗按窗口计数不顶替，与 AC-15 位置语义不符——实现重写为显示位置判定，补 shortReplace/shortNoReplace，DESIGN 措辞同步）；遗留判断项 2 条（C-038 编号空洞由后续 E2E 工作以 C-040 起编、task 正文同步——已在本关闭提交同步）。
  - 复审结论: 双轴复审均通过，无新增问题。
