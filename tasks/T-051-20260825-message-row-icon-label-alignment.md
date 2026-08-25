---
doc-type: task
mutation: lifecycle
id: T-051
---

# T-051 消息行图标尺度与角色标签对齐（时间线/槽位/最近卡）

状态: active
关联: R-01-012（AC-05、AC-11）、R-01-013（AC-07、AC-08）→ 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家现场使用发现活动会话消息行的图标与文字格式不一致：①时间线 assistant 行机器人图标因 viewBox 上下留白（24 框内笔墨仅 22×18）在 12px 图标盒内显小；②时间线用户消息行只有人物图标、无角色标签，与 assistant 行「图标+标签+圆点+摘要」形式不一致；③用户消息固定槽位图标疑似比时间线用户图标大；④最近卡用户/agent 预览行图标 10px 且无角色标签，与时间线形式不一致。查证结论：③不属实——`.dap-slot-icon` 与 `.dap-trace-icon` 均为 12px 盒且同一 `createUserIcon` 几何，bundle 与 src 一致，尺寸完全相同，东家确认不改（视觉差异源于槽位贴卡片左缘无缩进）。①②④属实，按「图标尺度铺满图标盒、用户/助手行同构带中文角色标签、最近卡对齐时间线形式」收敛。UI/UX 改进，走全链：PRD R-01-012 改写 AC-05、新增 AC-11，R-01-013 改写 AC-07/AC-08；DESIGN 四处条目同步演进，两闸口均经东家确认。

## 差距评估

- PRD/DESIGN：已同次演进（R-01-012 AC-05 改写+AC-11 新增；R-01-013 AC-07/08 改写；DESIGN 运行卡外观、显示行图标、最近卡预览行与双段结构四条目同步）。
- `src/core.mjs`：用户行派生两处（`nodeToTimelineItem` 用户分支、`eventToItem` 的 `user/message` 分支）无 `label` 字段，assistant 行已有「助手/思考」label。
- `src/client.mjs`：`createRobotIcon` viewBox `0 0 24 24` 上下留白；最近卡骨架（`cardChildren` recent 分支）为「图标+文本」双段，`.dap-history-icon` 10px。
- `scripts/check.mjs`：多处用户行 deepEqual fixtures（约 610、729、747、750、773 行）需同步补 `label: "用户"`；缺 AC-05 用户行 label、AC-11 机器人 viewBox、R-01-013/AC-07/08 标签段锚点。
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

（完成后填写）
