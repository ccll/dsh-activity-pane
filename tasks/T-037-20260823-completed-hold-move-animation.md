---
doc-type: task
mutation: lifecycle
id: T-037
---

# T-037 完成提醒会话响应保持与活动区→历史区迁移动画

状态: completed
关联: R-01-002、R-01-010 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

宿主语义为「完成提醒（`completed`）= 完成一轮且未被打开」，用户点击卡片打开会话后宿主立即清除 `completed`，窗格被动镜像导致卡片瞬间移入历史区，打断用户「查看后再决定如何处置」的上下文。东家确认的行为（PRD R-01-002/AC-05、R-01-010/AC-06/AC-07，决策 C-013）：

- 响应保持：完成提醒会话被打开后，只要仍为当前会话，活动卡位置与「需要响应」呈现维持不变；用户一直停留则保持不解除。
- 当前会话切走后保持解除，卡片移入历史区；**所有**活动区→历史区迁移均以移动动画呈现，让用户感知卡片来源与去向。

DESIGN 已演进（核心不变量、关键机制、产品契约、并发语义、追溯索引同步）。

## 差距评估

- `src/core.mjs`：`buildEntries`/`buildRecent` 仅按快照派生，无 `heldIds` 概念；保持登记/解除与迁移检测无纯函数载体。
- `src/client.mjs`：无保持状态；活动卡（`cardsById`）与最近卡（`recentCardsById`）为独立卡片池，迁移时旧卡被 `pruneCards` 摘除、新卡重建，无任何过渡呈现。
- `scripts/check.mjs`：R-01-002/AC-05、R-01-010/AC-06/AC-07 无锚点（lint 当前报缺）。
- 宿主时序风险：打开会话时 `current` 变更与 `completed` 清除可能在同一帧原子到达，纯快照观察可能错过「曾被打开的是完成提醒会话」这一事实。

## 收敛方案

- `src/core.mjs`（纯函数，可单测）：
  - 新增 `updateCompletedHolds(heldIds, snapshot, prevCompletedIds)`：登记（上一帧完成提醒 id 成为当前会话，或同帧 `completed && current` 命中）与解除（`current` 非空且切走、会话行消失），返回新集合。
  - 新增 `movedToRecentIds(prevActiveIds, active, recent)`：id 在上一帧活动区、本帧离开活动区且出现于历史区 → 判定一次迁移（彻底消失不判定）。
  - `buildEntries` 增加 `heldIds` 入参：保持中主会话按 awaiting「需要响应」呈现；`buildRecent` 增加 `heldIds` 入参：排除保持中会话。
- `src/client.mjs`：
  - 渲染器持有 `heldCompletedIds`（易失内存态）；每帧先经 `updateCompletedHolds` 更新（`prevCompletedIds` 取上一帧派生中 `pendingText === "需要响应"` 的条目 id），再以 `heldIds` 参与 `buildEntries`/`buildRecent` 派生。
  - 双保险登记：卡片激活路径（点击 awaiting「需要响应」卡）立即登记，覆盖宿主原子帧时序；帧间观察登记覆盖从侧栏等他途打开。
  - FLIP ghost 动画：签名去重通过后、DOM 写入前量取迁出活动卡矩形并克隆 ghost（`position:fixed` 覆盖层，`pointer-events:none`）；DOM 写入后量取目标最近卡矩形，rAF 内写 transform/opacity 过渡，真卡加 `dap-move-in` 淡入；`transitionend`（once）移除 ghost 与淡入类。同一 id 再迁移先移除旧 ghost；卸载时移除全部 ghost。
  - `prefers-reduced-motion` 或源/目标矩形不可量取（零尺寸、元素缺失）时跳过动画直接落位；时长约 300ms，不引入定时器。
- `scripts/check.mjs`：新增 R-01-002/AC-05、R-01-010/AC-06、R-01-010/AC-07 锚点（纯函数断言 + bundle 契约断言 ghost 样式/transitionend/reduced-motion 存在）。
- `scripts/acceptance.mjs`：补充人工验收步骤（保持期间视觉不变、焦点离开动画迁移、reduced-motion 降级）。

## 测试计划

- 测试先行：先写锚点断言（红），再实现转绿。
- `pnpm build:client && pnpm check`：纯函数断言 + bundle 契约。
- `python3 tools/agentmap_lint.py --report`：追溯与锚定完整。
- `git diff --check`。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：完成提醒会话打开后保持位置与「需要响应」呈现；焦点离开后动画迁入历史区 | `scripts/check.mjs#R-01-002/AC-05`、`scripts/check.mjs#R-01-010/AC-06`、`scripts/check.mjs#R-01-010/AC-07`、`scripts/acceptance.mjs#R-01-010/AC-07`、`src/core.mjs::updateCompletedHolds`、`src/client.mjs::runMoveGhosts`、GUI 现场验收 |
| 异常 | 适用：宿主原子帧时序（current 与 completed 清除同帧）下保持仍登记；目标/源矩形不可量取时降级直接落位不报错 | `scripts/check.mjs#R-01-002/AC-05`、`scripts/check.mjs#R-01-010/AC-07`、`src/core.mjs::updateCompletedHolds`、`src/client.mjs::prepareMoveGhosts` |
| 边界配置 | 适用：用户停留不离开则保持不解除；保持中发消息转 running 再结束仍保持；`prefers-reduced-motion` 跳过动画 | `scripts/check.mjs#R-01-010/AC-06`、`scripts/acceptance.mjs#R-01-010/AC-06`、`src/core.mjs::buildEntries` |
| 副作用 | 适用：保持态不写回宿主、不持久化（刷新后自然失效）；卸载移除全部 ghost 与监听；分区不变量（两区不同时出现）保持 | `scripts/check.mjs#R-01-010/AC-06`、`scripts/check.mjs#R-02-003/AC-02`、`src/client.mjs::removeMoveGhost`、GUI 现场验收 |

## 终态与证据

- 实现: `src/core.mjs`——新增纯函数 `updateCompletedHolds`（帧间/同帧双路径登记、切走与会话行消失解除、快照在途早退保留、仅主会话）与 `movedToRecentIds`（离开活动区且出现于历史区才判定迁移）；`buildEntries`/`buildRecent` 增加 `heldIds` 入参，保持中主会话按 awaiting「需要响应」呈现且不入历史区。`src/client.mjs`——渲染器持有易失 `heldCompletedIds`（点击即登记 + 帧间观察双路径，点击路径含 `isSubagentRow` 守卫）；FLIP ghost 动画：prepare 只测量与克隆、append 推迟到 `runMoveGhosts` 目标量取有效后（防异常路径泄漏），`moveGhostsById` 索引同 id 先移除旧 ghost，`transitionend`（once）收口、真卡 `dap-move-in` 淡入、`prefers-reduced-motion`/矩形不可量取直接落位；dispose 经 `removeMoveGhost` 单点清理，apply 重入清扫 `.dap-move-ghost`。`scripts/check.mjs` 新增 R-01-002/AC-05、R-01-010/AC-06、R-01-010/AC-07 锚点（含快照在途保留、子代理不登记、迁移判定边界与 bundle 契约）；`scripts/acceptance.mjs` 补两条人工验收步骤。
- 测试: 测试先行（锚点先红、实现后转绿）；`pnpm build:client && pnpm check` 全部断言通过；`python3 tools/agentmap_lint.py --report` 通过（19 需求 / 83 AC 全追溯、全锚定）；`git diff --check` 干净。GUI 现场验收（响应保持、焦点离开动画迁移、reduced-motion 降级）由东家按 `scripts/acceptance.mjs` 清单执行。
- DESIGN 对照: 与 DESIGN「核心数据与不变量」（显示过滤响应保持分支、分区不变量、易失内存态不变量）、「关键机制 → 响应保持与迁移动画」、「产品契约」（heldIds 入参与迁移动画条目）、「迁移动画并发语义」及需求追溯索引（R-01-002、R-01-010 → 活动状态模型）逐条一致；解除时机措辞（暂缺不解除）经 review 对齐实现，无差异。
- commit: 9aebccee34d2359ab1a771b9ccb637f13bb28ae7
- review:
  - 审核方: 独立 reviewer 双轴（Standards 子代理 53a13e0c、Spec 子代理 e8811ae6，code-review skill 流程）
  - 目的理解: 宿主打开会话即清除 completed 致完成提醒卡瞬移历史区；变更要求打开后仍为当前会话期间保持活动卡位置与「需要响应」呈现（R-01-002/AC-05、R-01-010/AC-06、C-013），当前会话切走解除，所有活动区→历史区迁移播放 FLIP ghost 动画（R-01-010/AC-07），reduced-motion 降级、保持态易失不持久化；预期验证为 `pnpm build:client && pnpm check` 与 agentmap lint（两轴均在审核前记录目的理解）。
  - 执行方式: `code-review` skill，评审基线为工作树 `git diff HEAD`（实现提交前，基线 9137639），范围含 src/、scripts/、PRD/DESIGN/DOMAIN/DECISIONS/TODO、tasks/T-037 与生成产物一致性。
  - 问题与修复: Standards 轴——1 项硬违规（DESIGN 旧显示过滤条目残留，已原地删除）+ 2 条判断性建议采纳（dispose 复用 removeMoveGhost、点击登记补 isSubagentRow 守卫），1 条不采纳（精确字符串断言为本仓惯例）；Spec 轴——3 项（同 id 双 ghost 缺 per-id 记账，已加 moveGhostsById；ghost 在 DOM 写入前 append 的泄漏边界，已将 append 推迟到写入成功后；DESIGN 解除时机措辞未覆盖 current 暂缺分支，已对齐 DESIGN/DOMAIN），无 scope creep。执行 agent 自查另修 2 项（快照在途误解除保持、同 id 旧 ghost 清理）并经双轴复审核验。
  - 复审结论: 双轴复审均通过（Standards 遗留一条不阻塞观察：ghost 双结构可接受；Spec 遗留一条非阻塞措辞建议已顺手统一）。
