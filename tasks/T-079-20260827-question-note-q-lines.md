---
doc-type: task
mutation: lifecycle
id: T-079
---

# T-079 待回复卡末行改提问 Q 行列表与徽标文字「问题」

状态: completed
关联: R-01-002/AC-02、AC-09 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

C-040 后待回复卡末行显示第一条提问的 `header` 短标题（如「演示选择」），东家实测认为不能体现所问的问题内容。东家确认新契约：末行改为逐条列出的提问 Q 行列表，并给出细节裁定——仅一条问题时前缀为「Q：」不带编号；行尾多余冒号剥除（数据原文「…随便点）：」→「…随便点）」）；最多显示 3 条问题、其后以省略行收尾。同时徽标文字自「待回复」改为「问题」（图标不变）。

## 差距评估

- `src/core.mjs`：`askQuestionPreview` 只取首问 `header` 优先的单行文本；`PENDING_LABELS.question` 为「待回复」。
- `src/client.mjs`：`.dap-note` 为单行 nowrap + ellipsis，无多行承载。
- `scripts/check.mjs`：R-01-002 锚点断言固旧行为（首问 header 优先、pendingText「待回复」单行 noteText）。
- `scripts/acceptance.mjs`：AC-09 人工条目描述首问标题。
- map 层已先行演进：PRD R-01-002/AC-02、AC-09 改写；DESIGN 等待双类呈现提示文字段落重写；DOMAIN 阻塞等待词条改写。

## 收敛方案

- `src/core.mjs`：
  - `askQuestionPreview` 更名/改为 `askQuestionsPreview(argsRaw, max=60)`：解析全部 questions，逐条取正文物理首行（该条正文缺失回落其 `header`，仍不可得跳过该条），剥除行尾多余冒号；仅一条问题时前缀「Q：」，多条为「Qn: 」分行；最多 3 条，其后有未展示问题时追加省略行「…」；全部不可得返回 null。
  - `PENDING_LABELS.question` 改「问题」；`timelineToolItem` 的 `question` 字段改由 `askQuestionsPreview` 派生（多行文本经折叠组行上浮链路不变）。
  - `awaitNoteText`/`timelineQuestionPreview` 签名不变（questionPreview 现为多行文本，直出）。
- `src/client.mjs`：`.dap-note` 由 `white-space: nowrap; text-overflow: ellipsis` 改为 `white-space: pre-line`（保留换行符、折叠其余空白；单行提示不受影响）；注释同步。
- 测试先行：先改写 check.mjs 断言为新契约失败态，再实现转绿。
- map 层已先行演进：PRD R-01-002/AC-02、AC-09；DESIGN 等待双类呈现段落；DOMAIN 阻塞等待词条；DECISIONS C-040 原文保留（历史）。

## 测试计划

- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 刷新现场验证：用「触发DSH提问对话框效果」会话（session-c2fc8721）核对末行 Q 行列表与「问题」徽标。
- 独立 `code-review` skill 双轴审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：多问题 Q 行列表、行尾冒号剥除、徽标文字「问题」 | `scripts/check.mjs#R-01-002/AC-02`、`scripts/check.mjs#R-01-002/AC-09`、`scripts/acceptance.mjs#R-01-002/AC-09`、`src/core.mjs::askQuestionsPreview` |
| 异常 | 适用：正文缺失回落 header、整条缺失跳过、全部不可得回落动作说明；非 JSON/空列表返回 null | `scripts/check.mjs#R-01-002/AC-09`、`src/core.mjs::askQuestionsPreview` |
| 边界配置 | 适用：单问题无编号前缀、恰 3 条无省略行、4 条以上省略行收尾 | `scripts/check.mjs#R-01-002/AC-09`、`src/core.mjs::askQuestionsPreview` |
| 副作用 | 适用：完成提醒/待确认/待审查的末行文案与徽标不变；`.dap-note` 单行用途（完成提醒、recent 时间）不受 pre-line 影响；时序补全链路保留 | `scripts/check.mjs#R-01-002/AC-09`、`scripts/check.mjs#R-01-002/AC-10`、`src/client.mjs::syncCards` |

## 终态与证据

状态: completed

- 实现: `src/core.mjs`——`askQuestionPreview` 更名 `askQuestionsPreview`：逐条取问题正文物理首行（该条正文缺失回落其 `header`，仍不可得跳过该条）、剥除行尾多余冒号，输出「Q1: …\nQ2: …」多行文本；仅一条时前缀「Q：」；最多 3 条、其后可展示条数超限时以省略行「…」收尾（编号按 `questions` 数组原始位置 1 基、中间不可得跳过不占号）；全部不可得返回 null 由调用方回落动作说明。`PENDING_LABELS.question` 改「问题」，`timelineToolItem`/折叠组行的 `question` 字段改由 `askQuestionsPreview` 派生（多行文本随既有上浮链路流动）。`src/client.mjs`——`.dap-note` 由 nowrap+ellipsis 改 `white-space: pre-line` 承载 Q 行换行（完成提醒/recent 单行提示无换行符不受影响）。
- 测试: 测试先行改红再转绿；`scripts/check.mjs` R-01-002 锚点重写——pendingText「问题」、单条「Q：」/多条「Qn: 」前缀、双问真实数据结构用例（含尾部冒号剥除）、恰 3 条无省略行、4 条省略行收尾、中间不可得跳过不占号、原始多条仅 1 条可展示仍保留 Qn: 前缀、header 回落、全部不可得回落，并补 `.dap-note` pre-line 的 bundle 契约锚点；`scripts/acceptance.mjs` AC-09 人工条目改写为 Q 行列表并补徽标文字验收；`pnpm build:client && pnpm check` 三轮全绿；`agentmap_lint passed`（22/22 需求、127/127 验收点锚定）；`git diff --check` 干净。真实会话（session-c2fc8721「触发DSH提问对话框效果」）数据结构实测输出与东家期望逐字一致。GUI 目验项（卡片末行 Q 行列表多行呈现、「问题」徽标）由东家现场刷新验收。
- DESIGN 对照: DESIGN 产品契约「等待双类呈现」提示文字段落（C-041 版：Q 行列表、`活动状态模型#askQuestionsPreview`、pre-line 承载）与实现一致；DOMAIN 阻塞等待词条（「待确认 / 待审查 / 问题」徽标 + Q 行列表末行）、PRD R-01-002/AC-02、AC-09 措辞与实现逐条对齐；DECISIONS 追加 C-041、C-042（append-only，C-040 历史原文保留）。
- commit: 1840294
- commit: 5119391
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards 轴 b39839dc、Spec 轴 9a835450）
  - 目的理解: 两轴 reviewer 均先读取 PRD R-01-002（演进后）、DECISIONS C-041、DESIGN 等待双类呈现契约、DOMAIN 词条与本任务文件，明确被审代码目的为「待回复卡末行从首问 header 短标题改为逐条提问正文的 Q 行列表（单条 Q：/多条 Qn: 前缀、尾冒号剥除、最多 3 条省略行收尾）并把徽标文字改为『问题』」，预期行为与验证方式（check.mjs 锚点断言、acceptance 人工条目）记录于各自报告。
  - 执行方式: `code-review` skill 双轴并行子代理审核，评审基线 222a3aa，范围为 1840294 + 5119391 全量 diff；复审由同一审核方分别进行。
  - 问题与修复: Standards 轴首轮 2 项判断项（恰 3 条边界无可执行断言——补三条断言锚定；Qn 跳号语义未入决策层——追加 C-042 明确编号按原始位置、省略行按可展示条数、单条前缀按原始条数）；Spec 轴首轮 4 项（恰 3 条断言缺口——已补；pre-line 多行承载零 bundle 锚点——已补契约断言；单条前缀判定口径——C-042 决策层明确；多行无视觉行数钳制——接受为已知取舍：真实数据与固定文案在宽度内不超宽，不引入 line-clamp）。复审：Standards 轴 1 项 nit（bundle 锚点与 CSS 注释文本耦合略紧，留作后续收窄备注）无残留；Spec 轴 2 条附注（原始多条仅 1 条可展示的 Qn: 前缀分支补直接断言——已补；单条长问包裹多行属已知取舍——记入本任务）无阻塞。
  - 复审结论: 双轴复审均通过，Standards 轴两项建议与 Spec 轴四项审核问题全部闭环。单条长问包裹多行属已知取舍（同 C-042 被否方案动因），不构成回归。