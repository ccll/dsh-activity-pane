---
doc-type: task
mutation: lifecycle
id: T-077
---

# T-077 指令锚行滚动停留语义

状态: active
关联: R-01-012/AC-12～AC-15 → 活动状态模型
风险等级: standard

## 背景与目标

东家实测：活动会话结束一轮后输入新指令，时间线从 4 行塌缩为仅剩新指令 1 行（表现为「清空」）。根因是 `selectTimelineRows` 旧语义「到达即钉首行」且工作行只取锚行之后项，新指令位于会话尾部时工作行名额全部落空。东家重新定义契约并经确认（C-039）：用户消息作为普通显示行自时间线末尾进入、随滚动上升、触顶停留为第一行锚行；更近的非空文本用户消息滚动至第二行时取代旧锚行，其后各行上移、暂减一行；空时间线时首条用户消息直接占据第一行；空文本用户行不参与停留与取代；快照与 history 两路径语义统一。

## 差距评估

- `src/core.mjs` `selectTimelineRows`：旧语义把最近可锚用户行无条件前置首行，`work = list.slice(userIndex + 1)` 只取其后工作行——新指令到达尾部瞬间工作行清零。
- `scripts/check.mjs` 1027–1169 段与 `scripts/acceptance.mjs` 147 段：AC-12～AC-15 断言固化旧语义（含「顶替后暂减为 3、随后回填恢复 4」的弱解读）。
- map 层已先行演进：PRD R-01-012/AC-12～AC-15 改写；DOMAIN「指令锚行」术语与不变量改写；DESIGN 第 148/256/289 行同步；DECISIONS 追加 C-039（修订 C-035 锚行条目）。

## 收敛方案

- `src/core.mjs`：重写 `selectTimelineRows` 为「末尾进入、触顶停留、第二行顶替」窗口语义——
  - 最近可锚用户行之后显示行数 ≥ limit-1（滚动触顶）→ 该行停留为首行锚行，其后取最近 limit-1 个工作显示行；
  - 存在更早的已停留锚行（窗口内更早可锚用户行，或 `fallbackAnchor` 充当窗口外停留锚行候选）且最近可锚用户行之后恰 ≥ limit-2（滚动至第二行）→ 取代旧锚行升上首行，其后各行上移、暂减一行；
  - 否则停留锚行保持首行，其后为窗口最近 limit-1 行（新用户行作为普通行参与滚动）；无可锚用户行且无 fallback 时为纯自然窗口；
  - `fallbackAnchor` 与窗口内最近可锚用户行文本相同时判为同一消息，不充当更早锚行（避免同一指令双行）；
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
| 成功 | 适用：新指令末尾进入不清空（[u1,w2,w3,w4]→[u1,w3,w4,u2]）；触顶停留；第二行顶替暂减一随后恢复；空时间线首条指令直接占据第一行 | `scripts/check.mjs#R-01-012/AC-12`、`scripts/check.mjs#R-01-012/AC-13`、`scripts/check.mjs#R-01-012/AC-14`、`scripts/check.mjs#R-01-012/AC-15`、`src/core.mjs::selectTimelineRows` |
| 异常 | 适用：空文本用户行不停留不顶替、仅作普通行滚动；无可锚用户行且无 fallback 时为纯自然窗口 | `scripts/check.mjs#R-01-012/AC-15`、`src/core.mjs::selectTimelineRows` |
| 边界配置 | 适用：limit=1 时锚行独占一行；长会话 ×3 扩窗前走命中窗口前用户节点；快照窗口无用户行时 fallbackAnchor 充当停留锚行、同文本判为同一消息不双行 | `scripts/check.mjs#R-01-012/AC-13`、`src/core.mjs::foldedConversationTimeline` |
| 副作用 | 适用：真实当前活动行保留末行（R-01-009/AC-11）不受新窗口语义影响；`snapshotHasAnchorableUserRow` 记账不变量保持 | `scripts/check.mjs#R-01-009/AC-11`、`src/core.mjs::selectTimelineRows` |
| 兼容性 | 适用：冷 history 路径（`foldedHistoryTimeline`）与快照路径同一窗口选择，等待卡/最近卡时间线语义一致 | `scripts/check.mjs#R-01-012/AC-13`、`src/core.mjs::foldedHistoryTimeline` |

## 终态与证据

（待关闭时填写）
