---
doc-type: task
mutation: lifecycle
id: T-052
---

# T-052 委托周期保持运行呈现：废除 parent 卡、进度连续、压制等待态

状态: active
关联: R-01-002（AC-03）、R-01-003（AC-05）、R-01-009（AC-06、AC-10）、R-01-010（AC-06）、R-01-016 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家现场发现：活动会话启动子会话后卡片外观应保持不变并继续更新进度，但实际出现三种异常——进度条打满到头、进度条变成 0、卡片进入等待状态。根因查证：宿主 `running` 只反映母会话自身回合是否在飞，启动后台子代理不延续母会话回合；母会话回合结束而子代理仍在跑时，插件把卡片翻成 `parent` 上下文卡（CSS 满宽条纹，R-01-016/AC-03 旧设计）、响应保持/完成提醒翻成 awaiting「需要响应」（R-01-010/AC-06、R-01-002/AC-03 旧设计）、settle 新回合 `turnTimings` 归零重计（R-01-009/AC-06 旧设计）——三症状均为旧 PRD 明文承诺行为被宿主状态翻转触发，属需求变更。

东家两项裁定：①彻底废除 parent 卡——存在活动后代期间母会话卡片一律保持运行呈现；②整个委托周期进度连续不归零（含 settle 触发的新回合）。

## 差距评估

- PRD/DOMAIN/DESIGN：已同次演进（PRD R-01-003/AC-05 改写、R-01-009/AC-06 改写、R-01-002/AC-03 与 R-01-010/AC-06 补例外、R-01-016 收缩为等待卡时间线；DOMAIN 删「活动层级上下文」「不确定态进度条」、登记「委托周期」；DESIGN 14 处条目同步）。
- `src/core.mjs`：`buildEntries` kind 三分支仍产 `parent`；`shouldSubscribeToSession` 按呈现 kind 判定（委托母会话会被误订阅）；`trackRuns` 过滤含 `parent`；`promoteRunningTail` 仅认快照 `running === true`；缺委托周期进度锚点纯函数。
- `src/client.mjs`：`cardChildren`/`renderCardInto` 有 parent 分支；CSS 三处 `[data-kind="parent"]`；渲染期 elapsedMs 只认 `live.startTime`（委托期无开放回合即归零）；时间线 memo 键不含委托信号。
- `scripts/check.mjs`：R-01-003/AC-05、徽标计数、R-01-016 相关断言按旧 parent 语义编写；bundle 断言钉住 parent 骨架/CSS。
- `scripts/acceptance.mjs`：parent 卡人工验收步骤需改写为委托周期语义。

## 收敛方案

- `src/core.mjs`
  - `buildEntries`：新增 `descendantActive`（自身不活动且在活动祖先集合中）；kind 收敛为 running|awaiting|subagent——主会话 `pending`→awaiting，`running || descendantActive`→running，否则 awaiting；子代理恒 subagent；`completed`/held 在 `descendantActive` 期间不产出「需要响应」；条目输出 `descendantActive` 字段。
  - `shouldSubscribeToSession` 改按 `byId[id].running === true` 判定（订阅口径==宿主运行中会话，与呈现 kind 解耦）。
  - `trackRuns` 子级过滤去掉 `parent`。
  - `promoteRunningTail`/`foldedTimelineWithSlot` 增 `delegating` 入参：委托期尾部提升继续（R-01-009/AC-10）。
  - 新增 `progressAnchor(prev, { descendantActive, hostStartTime, now })` 纯函数（三态状态机 idle/turn/delegating）：turn 态新回合归零（AC-06 周期外语义）；delegating 态锚点连续——不随回合结束或新回合（含 settle 处理回合）归零，无已知起点时取当刻；无后代且无开放回合退回 idle（R-01-009/AC-06）。
- `src/client.mjs`：删除 parent 骨架分支、render 分支与三处 CSS；渲染循环以 `progressAnchorById` Map 记账驱动 elapsedMs（kind 非 running 即清除条目，随可见集合 prune）；时间线 memo 键并入 `descendantActive` 并向 `foldedTimelineWithSlot` 传 `delegating`。
- 测试先行：`scripts/check.mjs` 改写 R-01-003/AC-05（委托链 kinds）、徽标计数夹具（去 parent）、R-01-016（删 parent 断言、保留等待卡）；新增 progressAnchor 状态机锚点（R-01-009/AC-06）、委托期尾部提升（R-01-009/AC-10）、completed/held 压制（R-01-002/AC-03、R-01-010/AC-06）、bundle 无 parent 残留断言。
- `scripts/acceptance.mjs`：parent 卡步骤改写为委托周期保持运行呈现 + 进度连续 + 周期外归零。

## 测试计划

- `pnpm build:client && pnpm check` 全绿（新锚点先红后绿）。
- `python3 tools/agentmap_lint.py --report` 追溯完整。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 人工核验。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：委托期母会话保持 running 呈现、锚点连续、等待标识压制、尾部提升继续 | `scripts/check.mjs#R-01-003/AC-05`、`scripts/check.mjs#R-01-009/AC-06`、`scripts/check.mjs#R-01-009/AC-10`、`src/core.mjs::buildEntries`、`src/core.mjs::progressAnchor` |
| 异常 | 适用：非法/缺失快照入参归一（空快照、缺失 byId、非法起点）不抛错 | `scripts/check.mjs#R-01-001/AC-02`、`src/core.mjs::progressAnchor`（null prev/无 hostStart/无 now 分支） |
| 边界配置 | 适用：pendingInteraction 优先于委托保持 awaiting；子代理多级委托链逐级保持；周期外回合切换归零 | `scripts/check.mjs#R-01-002/AC-01..02`、`scripts/check.mjs#R-01-003/AC-05`、`scripts/check.mjs#R-01-009/AC-06`、`src/core.mjs::buildEntries`、`src/core.mjs::progressAnchor` |
| 副作用 | 适用：订阅数量==宿主运行中会话数；徽标分母含委托母会话；parent CSS/骨架删除后运行卡流式条纹不受影响 | `scripts/check.mjs#R-02-004/AC-01`、`scripts/check.mjs#R-01-001/AC-05`、`scripts/check.mjs#R-01-009/AC-08`、`src/core.mjs::shouldSubscribeToSession`、`src/core.mjs::awaitBadgeStats` |
| 兼容性 | 适用：响应保持登记/解除、活动区→历史区迁移、连接线绘制在委托语义下不漂移 | `scripts/check.mjs#R-01-010/AC-06`、`scripts/check.mjs#R-01-010/AC-07`、`scripts/check.mjs#R-01-003/AC-04`、`src/core.mjs::updateCompletedHolds`、`src/core.mjs::trackRuns` |

## 终态与证据
