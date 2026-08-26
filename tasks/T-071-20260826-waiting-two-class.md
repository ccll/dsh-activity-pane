---
doc-type: task
mutation: lifecycle
id: T-071
---

# T-071 等待状态双类分流重设计

状态: completed
关联: R-01-002、R-01-001 / 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家反馈：活动会话卡片的等待状态标识与描述不够清晰——「回合完成等下一条指令」（不阻塞）与「向用户提问等回答」（阻塞，不答就无法继续）性质相反，却共用同一套琥珀色卡面，只能靠读徽标小字区分；且唯一脉冲的是不阻塞的「需要响应」，真正阻塞的三种反而静默，注意力权重倒挂。

经方案确认（双类分流方向、完成类文案「已完成」、计数徽标仅阻塞时脉冲、待回复卡显示问题首行），R-01-002 全量改写、R-01-001 计数语义同步演进，决策见 C-028。

## 差距评估

- 现状四类等待（需要响应/待确认/待审查/待回复）共用 `[data-kind="awaiting"]` 琥珀卡面，仅徽标文案不同；脉冲闪烁仅属「需要响应」（`dap-badge-flash`），计数徽标任一等待即脉冲。
- 渲染层以文案比较（`pendingText === NEEDS_RESPONSE_LABEL`）判定闪烁归属与备注行模板，无结构化等待类别字段。
- 待回复卡的问题正文不可得：时间线 ask_user_question 工作项只携带状态摘要（「等待回答」等），不携带参数中的问题文本。
- 计数统计 `awaitBadgeStats` 只产出 waiting/total，无阻塞等待计数。

## 收敛方案

- core（`src/core.mjs`）：
  - 条目新增 `waitClass`（`'blocked'|'done'`）、`pendingKind`（原始 pendingInteraction 种类）、`noteText`（备注行文案），在 `buildEntries` 单点产出；`NEEDS_RESPONSE_LABEL` 改名 `ROUND_DONE_LABEL`，值「需要响应」→「已完成」。
  - 时间线 ask_user_question 工作项新增 `question` 字段（`askQuestionPreview(argsRaw)` 取参数中首个问题文本）；`noteText` 由纯函数 `awaitNoteText` 派生（阻塞三类动作说明 / 待回复附问题首行 / 完成提醒固定文案）。
  - `awaitBadgeStats` 增加 `blocked` 计数；`countBadgeState` 增加 `blocked` 出参（脉冲归属）；`awaitPulsePeriod` 入参语义改为阻塞等待数。
- client（`src/client.mjs`）：
  - awaiting 卡片写入 `data-wait="blocked"|"done"`；阻塞类徽标前置 12px 类型图标（对勾/文档/问号气泡），徽标闪烁归属由文案比较改为 `waitClass === 'blocked'`；完成类状态点静止、描边光晕弱化（CSS 分裂）。
  - 备注行直接采用条目 `noteText`。
  - 计数徽标：`data-awaiting` 保持「任一等待行动即琥珀底」，脉冲动画改由 `data-blocked` 门控；`--dap-await-period` 仅阻塞时写入；aria 文案更新。
- map：PRD R-01-002 改写（AC-01～AC-09）、R-01-001/AC-04～06 与 R-01-010/AC-06、R-01-016/AC-01 文案同步；DOMAIN 新增「阻塞等待」、改写「完成提醒/响应保持/等待行动」；DESIGN 等待双类呈现、计数脉冲、核心结构字段同步；DECISIONS 追加 C-028。

## 测试计划

- `scripts/check.mjs`：改写「需要响应」相关断言为「已完成」；新增 `waitClass`/`pendingKind`/`noteText`/`askQuestionPreview`/阻塞计数与脉冲门控的单测（锚定 R-01-002/AC-01～AC-09、R-01-001/AC-05）；bundle 契约断言图标元素、data-wait 分裂、闪烁归属、备注行文案。
- `scripts/acceptance.mjs`：更新 R-01-002 人工验收步骤（双类一瞥可区分、脉冲归属、备注行与问题首行、计数脉冲门控）。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：四类等待分别以目标文案/图标/动效呈现，备注行说明动作与后果 | `scripts/check.mjs#R-01-002`、`scripts/acceptance.mjs#R-01-002`、`src/core.mjs::buildEntries`、`src/client.mjs::createPendingIcon` |
| 异常 | 适用：问题正文不可得（冷会话无 ask 参数）时备注行回落动作说明；未知阻塞种类以中性「待处理」兜底（文案/图标/动效一致） | `scripts/check.mjs#R-01-002/AC-09`、`src/core.mjs::awaitNoteText` |
| 边界配置 | 适用：仅完成提醒无阻塞等待时计数徽标不脉冲；全部阻塞时脉冲达上限频率 | `scripts/check.mjs#R-01-002/AC-06`、`src/core.mjs::countBadgeState` |
| 副作用 | 适用：运行卡/最近卡/子代理卡呈现不受影响；委托周期与响应保持既有行为不回归 | `scripts/check.mjs#R-02-003`、`src/core.mjs::cardSignature` |

## 终态与证据

- 实现: `src/core.mjs` 新增 `ROUND_DONE_LABEL`（已完成）/`ROUND_DONE_NOTE`/`PENDING_NOTES`/未知阻塞中性兜底（「待处理」/「等待你处理后继续」）、`askQuestionPreview`（物理首行口径）与 `awaitNoteText`/`timelineQuestionPreview` 纯函数；`buildEntries` 以 `doneWait` 单点判定产出 `waitClass`/`pendingKind`/`noteText`；ask 提问正文经 `foldMemberOf`/`buildFoldRow` 穿透折叠分组上浮组行；`awaitBadgeStats` 增 blocked 计数、`countBadgeState` 增 blocked 门控与混合态 aria、`awaitPulsePeriod` 入参改为阻塞占比；`cardSignature` 增 waitClass/noteText 分量。`src/client.mjs`：徽标改图标+文本双段（`createPendingIcon` 对勾/文档/问号气泡，未知种类无图标）、闪烁归属由文案比较改 `waitClass === "blocked"`、备注行采用条目 `noteText`、卡片 `data-wait="blocked"|"done"` 承载类别、完成提醒卡描边光晕弱化且状态点静止、三处计数徽标脉冲改 `data-blocked` 门控。`.dsh-plugin/client.js` 已重建。
- 测试: `pnpm build:client && pnpm check` 通过（check.mjs 新增/改写断言锚定 R-01-002/AC-01～AC-09 与 R-01-001/AC-05～06：双类字段、备注行三句式与问题首行/回落/中性兜底、blocked 计数与脉冲门控、bundle 契约含图标结构/data-wait/data-blocked/降噪 CSS）；`python3 tools/agentmap_lint.py --report` 通过（test-anchored=121/121）；`scripts/acceptance.mjs` 更新 R-01-002 人工验收步骤，双类视觉与脉冲表现仍需人工 GUI 验收。
- DESIGN 对照: PRD R-01-002 改写为双类九条 AC，R-01-001/AC-04～06、R-01-010/AC-06、R-01-016/AC-01 文案同步；DOMAIN 新增「阻塞等待」并改写「等待行动/完成提醒/响应保持」与不变量；DESIGN「等待双类呈现」「徽标计数与脉冲紧迫度」、核心结构字段与追溯索引同步；DECISIONS 追加 C-028；map 与实现一致。
- commit: 39921d02227e8823cadc063ec9d8b14031cce8ba
- 编号说明: 本任务在 worktree 中以 T-067、决策以 C-026 立项开发；集成前 main 已被其它 worktree 推进（T-067 被占、C-026/C-027 为工作区徽标色相决策），按未发布冲突规则 rebase 到最新 main 并重写分支提交，任务重排为 T-071、决策重排为 C-028（文件名、frontmatter、正文引用同步）。
- review:
  - 审核方: Standards 子代理（初审+复审两轮独立会话）；Spec 子代理（初审+复审两轮独立会话）。
  - 目的理解: 实现 R-01-002 等待状态双类分流——阻塞等待（待确认/待审查/待回复）图标+脉冲催促、备注行说明动作与后果并附问题首行；完成提醒（「已完成」）静态降噪不脉冲；计数徽标脉冲仅属阻塞等待；响应保持/委托周期行为不回归；测试锚定 AC-ID。
  - 执行方式: `code-review` skill；评审基线 `3b57b76e3aa3967046a4637c565329c4ec33792a`（rebase 前分支基点），范围为 T-071 工作单元；Standards/Spec 双轴并行审核，修复后由同轴审核方分别复审。
  - 问题与修复: Standards 初审 4 项——buildEntries 判定重复三处（提取 doneWait 单点）；未知阻塞种类文案/动效/图标矛盾（统一中性兜底「待处理」+ 无图标 + 保留脉冲）；README alt 残留「需要响应」（改「等待行动」）；aria 混合态吞完成计数（同报阻塞+完成）。Spec 初审 2 项——AC-09 问题「首行」被折叠拼接（改 firstPhysicalLine 物理首行）；未知种类三者矛盾（同上修复）。全部修复后并入 39921d02227e8823cadc063ec9d8b14031cce8ba。
  - 复审结论: Standards 复审通过（四项全部修复、无新问题）；Spec 复审通过（两项全部修复、无 spec 偏差）。
