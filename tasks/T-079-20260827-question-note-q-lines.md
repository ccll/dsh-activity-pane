---
doc-type: task
mutation: lifecycle
id: T-079
---

# T-079 待回复卡末行改提问 Q 行列表与徽标文字「问题」

状态: active
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

（active 期间持续编辑；关闭时填写实现、测试、DESIGN 对照、commit 与 review 证据）