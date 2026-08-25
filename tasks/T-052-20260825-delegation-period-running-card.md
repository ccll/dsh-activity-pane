---
doc-type: task
mutation: lifecycle
id: T-052
---

# T-052 委托周期保持运行呈现：废除 parent 卡、进度连续、压制等待态

状态: completed
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

- 实现: `src/core.mjs`（`buildEntries`/`buildRecent` 接受 `delegatingIds`、`descendantActiveIds`/`lineageActiveIds` 单点上溯、`progressAnchor` 三态状态机 + `delegationActive` + `SETTLE_TURN_GRACE_MS`、`shouldSubscribeToSession` 按宿主 running 判定、`trackRuns` 去 parent、`promoteRunningTail`/`foldedTimelineWithSlot` 支持 `descendantActive`）；`src/client.mjs`（parent 骨架/渲染分支/CSS 三处移除、`progressAnchorById` 逐帧记账驱动进度、时钟按运行呈现卡驱动、时间线 memo 键并入 `descendantActive`）；`PRD.md`/`DOMAIN.md`/`DESIGN.md` 同次演进（R-01-016 收缩为等待卡时间线、「委托周期」术语登记）。三轮审核增补：耗尽空窗 `delegatingIds` 注入保持运行呈现与分区互斥、耗尽宽限归属 settle 处理回合、命名与注释一致性。
- 测试: `pnpm build:client && pnpm check` 全绿（锚点：R-01-003/AC-05 委托链 kinds 与空窗保持、R-01-009/AC-06 状态机全序列含耗尽宽限、R-01-009/AC-10 委托尾部提升、R-01-002/AC-03 与 R-01-010/AC-06 压制/恢复、R-01-001/AC-05 计数口径、bundle 无 parent 残留）；`python3 tools/agentmap_lint.py --report` 通过（requirements=22、AC=104 全锚定）；GUI 人工验收步骤见 `scripts/acceptance.mjs`（委托周期保持运行呈现条目）。
- DESIGN 对照: kind 枚举、显示过滤、回合进度（progressAnchor + 宽限）、订阅口径、窗格渲染器委托周期条目、需求追溯索引均与实现一致；DOMAIN「委托周期」「轮内进度」定义与实现语义一致。
- commit: a161fb5d0024dc3e70d01d720f13006f90611e84
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards 轴、Spec 轴）
  - 目的理解: 母会话启动子代理后卡片外观应保持不变并继续更新进度；关联 PRD R-01-002/AC-03、R-01-003/AC-05、R-01-009/AC-06/AC-10、R-01-010/AC-06、R-01-016 与 DOMAIN「委托周期」；预期行为为委托周期保持运行呈现、进度连续不归零、完成提醒压制与恢复；验证方式为 check.mjs 锚点 + agentmap lint + acceptance.mjs 人工验收。
  - 执行方式: `code-review` skill，评审基线 HEAD（工作区未提交 diff），范围为 PRD/DESIGN/DOMAIN/src/scripts 全量变更。
  - 问题与修复: Standards 轴——activeSessionIds 注释漂移（已更正）、祖先遍历重复（提取 `lineageActiveIds`）、`delegating`/`descendantActive` 命名混用（参数与 memo 键统一改名 `descendantActive`）、锚点生命周期注释矛盾（已更正）；Spec 轴——锚点随 kind 翻转/可见性被清除（改为全部活动条目逐帧记账、dispose 才清除）、耗尽空窗卡片翻 awaiting/消失（`delegatingIds` 注入 `buildEntries`/`buildRecent`，空窗保持运行呈现与分区互斥）、settle 处理回合归属（`SETTLE_TURN_GRACE_MS` 宽限）。另自查修复：运行卡时钟改按运行呈现卡驱动（委托期子代理挂起时进度不停）。
  - 复审结论: Standards 轴第三轮通过；Spec 轴第二轮通过，无残留 finding。
