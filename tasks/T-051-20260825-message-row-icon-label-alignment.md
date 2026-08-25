---
doc-type: task
mutation: lifecycle
id: T-051
---

# T-051 消息行图标尺度与角色标签对齐（时间线/槽位/最近卡）

状态: completed
关联: R-01-012（AC-05、AC-11）、R-01-013（AC-07、AC-08）→ 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家现场使用发现活动会话消息行的图标与文字格式不一致：①时间线 assistant 行机器人图标因 viewBox 上下留白（24 框内笔墨仅 22×18）在 12px 图标盒内显小；②时间线用户消息行只有人物图标、无角色标签，与 assistant 行「图标+标签+圆点+摘要」形式不一致；③用户消息固定槽位图标疑似比时间线用户图标大；④最近卡用户/agent 预览行图标 10px 且无角色标签，与时间线形式不一致。查证结论：③不属实——`.dap-slot-icon` 与 `.dap-trace-icon` 均为 12px 盒且同一 `createUserIcon` 几何，bundle 与 src 一致，尺寸完全相同，东家确认不改（视觉差异源于槽位贴卡片左缘无缩进）。①②④属实，按「图标尺度铺满图标盒、用户/助手行同构带中文角色标签、最近卡对齐时间线形式」收敛。UI/UX 改进，走全链：PRD R-01-012 改写 AC-05、新增 AC-11，R-01-013 改写 AC-07/AC-08；DESIGN 四处条目同步演进，两闸口均经东家确认。

## 差距评估

- PRD/DESIGN：已同次演进（R-01-012 AC-05 改写+AC-11 新增；R-01-013 AC-07/08 改写；DESIGN 运行卡外观、显示行图标、最近卡预览行与双段结构四条目同步）。
- `src/core.mjs`：用户行派生两处（`timelineItemFromChatNode` 用户分支、`timelineItemFromEvent` 的 `user/message` 分支）无 `label` 字段，assistant 行已有「助手/思考」label。
- `src/client.mjs`：`createRobotIcon` viewBox `0 0 24 24` 上下留白；最近卡骨架（`cardChildren` recent 分支）为「图标+文本」双段，`.dap-history-icon` 10px。
- `scripts/check.mjs`：冷路径用户行 deepEqual 期望（约 610 行）需同步补 `label: "用户"`；缺 AC-05 用户行 label、AC-11 机器人 viewBox、R-01-013/AC-07/08 标签段锚点。
- `scripts/acceptance.mjs`：需补三条人工验收步骤（时间线用户行标签、机器人尺度一致、最近卡标签与 12px 图标）。

## 收敛方案

- `src/core.mjs`：用户行派生两处补 `label: "用户"`（槽位派生只取 text，不受影响）。
- `src/client.mjs`：`createRobotIcon` viewBox 改为笔墨边界盒 `1 3 22 18`（几何不动，线性放大约 20%）；最近卡骨架改为「图标+角色标签+圆点分隔符+文本」结构，标签静态写入「用户」/「助手」；`.dap-history-icon` 10px → 12px（含 svg 规则），新增 `.dap-history-label`/`.dap-history-separator` 样式（圆点分隔符深浅主题色镜像 `.dap-trace-separator`）。
- 测试先行：`scripts/check.mjs` fixtures 补 label，新增 AC-05（folded 用户行 label「用户」）、AC-11（bundle 含 viewBox `1 3 22 18`）、R-01-013/AC-07/08（bundle 含标签段与 12px 图标盒）锚点断言。
- `scripts/acceptance.mjs`：补三条人工验收步骤。

## 测试计划

- `pnpm build:client && pnpm check` 全绿（新锚点先红后绿）。
- `python3 tools/agentmap_lint.py --report` 追溯完整。
- `git diff --check` 干净；提交时 pre-commit 钩子重放通过。
- GUI 现场验收（用户行「用户」标签、机器人图标尺度、最近卡标签+12px 图标）由东家按 `scripts/acceptance.mjs` 人工核验。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：用户行 label「用户」；机器人 viewBox 笔墨盒；最近卡标签段+12px 图标 | `scripts/check.mjs#R-01-012/AC-05`、`scripts/check.mjs#R-01-012/AC-11`、`scripts/check.mjs#R-01-013/AC-07`、`scripts/check.mjs#R-01-013/AC-08`、`src/core.mjs::timelineItemFromChatNode`、`src/client.mjs::createRobotIcon`、`src/client.mjs::cardChildren` |
| 异常 | 不适用：纯呈现层与派生字段补全，无新失败路径 | — |
| 边界配置 | 适用：reasoning+正文同节点剥离、折叠分组等既有用户行场景 label 不漂移 | `scripts/check.mjs#R-01-017/AC-02`、`src/core.mjs::foldWorkGroups` |
| 副作用 | 适用：槽位派生只取 text 不受 label 影响；槽位图标尺寸维持 12px 不变（查证结论）；机器人图标两处消费（时间线/最近卡）同源同步放大 | `scripts/check.mjs#R-01-018/AC-01`、`src/core.mjs::slotOf`、`src/client.mjs::renderSlot` |
| 兼容性 | 适用：等待卡/parent 卡复用同一时间线行，用户标签随行一致呈现 | `scripts/check.mjs#R-01-016/AC-04`、`src/client.mjs::renderTimelineArea` |

## 终态与证据

- 实现: PRD R-01-012 改写 AC-05（用户行人物图标+「用户」标签）、新增 AC-11（机器人图标笔墨边界盒尺度），R-01-013 改写 AC-07/AC-08（最近卡角色图标+「用户」/「助手」标签）（两闸口东家确认）；DESIGN 运行卡外观、显示行图标、最近卡预览行与四段结构四条目同步演进；src/core.mjs 用户行派生两处（timelineItemFromChatNode 用户分支、timelineItemFromEvent 的 user/message 分支）补 label「用户」；src/client.mjs createRobotIcon viewBox 0 0 24 24 → 1 3 22 18（几何不动），cardChildren recent 分支改「图标+角色标签+圆点分隔符+文本」结构，.dap-history-icon 10px → 12px，新增 .dap-history-label/.dap-history-separator 样式（含浅主题分隔符色）；scripts/check.mjs 补 AC-05/AC-11 与 R-01-013/AC-07/08 锚点断言并同步冷路径 deepEqual fixture；scripts/acceptance.mjs 三条相关人工验收步骤同步改写；.dsh-plugin/client.js 重新生成一并提交；评审收口更正差距评估两处事实（c457ec633530395eebf5140f8cff3b7d9843e2c5）。
- 测试: pnpm build:client && pnpm check 全绿（测试先行：AC-05 冷路径 fixture 与 bundle 锚点先红后绿）；python3 tools/agentmap_lint.py --report 通过（requirements=22 / acceptance-criteria=106 / design-covered=22 / test-anchored=106）；git diff --check 干净；两次提交 pre-commit 钩子（20-agentmap-lint、30-dsh-activity-pane-check）重放通过。GUI 现场验收（用户行「用户」标签、机器人图标尺度一致、最近卡标签+12px 图标）由东家按 scripts/acceptance.mjs 人工核验。
- DESIGN 对照: 「用户项使用人物图标并带「用户」标签」「机器人 SVG 几何按笔墨边界盒（viewBox 1 3 22 18）渲染」「最近卡预览行图标+角色标签+圆点分隔符+文本、图标盒 12px」与实现一致；指令槽位条目按查证结论未动；需求追溯索引无需变动（无新 R-ID）。
- commit: ad615a10b1420a32073322efeaa82e96e40a6dd2 c457ec633530395eebf5140f8cff3b7d9843e2c5（前者实现，后者双轴评审收口）
- review:
  - 审核方: 独立子代理双轴并行（Standards：e91d5ee0-4cac-4c3e-8ba3-dfad24e62ad1；Spec：4b7164b2-59bc-4f05-9876-6e3887c05951）。
  - 目的理解: 时间线机器人图标 viewBox 裁至笔墨边界盒消除显小、用户行补「用户」标签与 assistant 行同构、最近卡预览行对齐时间线形式（标签+圆点+12px 图标盒）；关联 R-01-012/AC-05、AC-11 与 R-01-013/AC-07、AC-08；预期行为与验证以 PRD AC 与 check/acceptance 锚点为准；查证后槽位图标尺寸明确不改。
  - 执行方式: code-review skill 双轴（Standards + Spec）审核 git diff HEAD~1...HEAD（提交 ad615a10b1420a32073322efeaa82e96e40a6dd2）；Standards 对照 AGENTS/CONVENTIONS/DESIGN 横切约束 + Fowler 味道基线；Spec 对照 tasks/T-051、PRD R-01-012/R-01-013 与 DESIGN 契约，并实跑 pnpm check 复验。
  - 问题与修复: Standards——无硬违规；finding 1) T-051 差距评估误写函数名 nodeToTimelineItem/eventToItem → c457ec633530395eebf5140f8cff3b7d9843e2c5 更正为 timelineItemFromChatNode/timelineItemFromEvent；判断性 2) bundle 断言锚定变量名与 3) recent 分支两行骨架同形——与仓库既有 bundle 契约校验惯例一致/符合 KISS，维持现状。Spec——零 finding；核查确认槽位派生（slotOf/renderSlot 只取 text）不受 label 影响、机器人笔墨盒 x[1,23]×y[3,21] 与 viewBox 严丝合缝无裁切、新断言回退即红；nit：差距评估 fixtures 行号表述不准 → c457ec633530395eebf5140f8cff3b7d9843e2c5 更正为冷路径 deepEqual 期望（约 610 行）。
  - 复审结论: 双轴复审均通过（finding 与 nit 全部消除，无遗留问题）。
