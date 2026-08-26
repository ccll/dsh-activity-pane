---
doc-type: task
mutation: lifecycle
id: T-073
---

# T-073 完成提醒改显式确认并跨端同步

状态: completed
关联: R-01-002、R-01-010 / 活动状态模型、窗格渲染器、完成确认宿主侧
风险等级: standard

## 背景与目标

东家查证（修复前）：活动会话进入「完成并等待用户确认结果」状态后刷新页面，会话直接落入历史区而非保持等待态。根因：完成提醒两端记账（宿主 `completedNotifications` 边沿观测、插件 `heldCompletedIds` 上一帧活动记账）均为浏览器内存态，刷新即清零；「打开/切走即解除」语义使多客户端状态不一致。

东家决策（经方案确认，C-030）：
- 完成提醒成立 = 主会话 && 非 running && 无阻塞等待 && 非委托周期 && `lastTurnEnd > ackedAt`；`lastTurnEnd` 由宿主侧插件订阅 `session/event` 的 `turn/end` 登记，`ackedAt` 由确认按钮写回，两者持久化于插件自有 storageDomain 表，经 SSE 通道下发。
- 解除仅两条路径：显式确认按钮（「已完成」卡备注行行尾「知道了」，不触发跳转）与新回合隐式更替；打开/切走/刷新不解除。
- 跨端同步：同一宿主全部客户端同步解除；刷新/重连经 SSE 全量快照恢复。
- 删除 `updateCompletedHolds`/`heldCompletedIds` 易失记账，`buildEntries`/`buildRecent` 入参 `heldIds` → `completions`。
- 阻塞等待卡不加按钮。
- 升级后仅新回合触发登记，历史完成不回溯补发提醒。

## 差距评估

- core：`updateCompletedHolds`（登记/解除/兜底）整函数删除；`buildEntries`/`buildRecent` 的 `heldIds` 入参改为 `completions`（Map id → `{ lastTurnEnd, ackedAt }`）；完成提醒成立判定收敛为新纯函数 `completionReminder`。
- client：`heldCompletedIds`/`prevActiveMainIds` 记账与 `updateCompletedHolds` 调用删除；新增 ack 通道（EventSource 订阅 `/dsh-activity-pane/api/acks/stream` + POST `/dsh-activity-pane/api/ack`）；「已完成」卡备注行行尾渲染确认按钮（click stopPropagation、不触发卡片跳转）。
- host（新增）：`.dsh-plugin/index.mjs` 由 no-op 改为转发 `src/host.mjs` 的 cordis 插件——storageDomain 声明式表 `acks`、`session/event` 的 `turn/end` 登记、`webServer` 三条路由（acks 快照 / SSE 流 / ack 写回）。
- 测试：check.mjs 删除 `updateCompletedHolds` 测试组，新增 `completionReminder`/入参改写断言，锚定 R-01-002/AC-03、AC-05、AC-10～AC-12 与 R-01-010/AC-06；bundle 契约断言确认按钮结构；acceptance.mjs 更新人工验收步骤（含跨端/刷新场景）。
- map：R-01-002 全量改写（AC-10～AC-12 新增）、R-01-010/AC-06 改写、NG-2 收窄；DOMAIN 「响应保持」→「完成确认」+「确认按钮」新术语、不变量例外；DESIGN 核心不变量/产品契约/子系统（新增「完成确认宿主侧」）；DECISIONS 追加 C-030。

## 收敛方案

见 C-030 决策与 DESIGN「完成确认宿主侧」「核心数据与不变量」「产品契约」。关键实现约束：

- host 侧只登记 `turn/end`（事件顶层 `time`）为 `lastTurnEnd`，子代理与会话统一登记，主/子过滤在客户端。
- ack 写回 `ackedAt = Date.now()`；SSE 连接即发全量快照、变更即广播；连接集合随插件卸载关闭。
- 客户端渲染仍走既有数据派生管线：`completions` 注入 `buildEntries`/`buildRecent`；确认按钮激活除 ack 写回与本地即时更新外不触发跳转；确认后卡片经既有迁移动画入历史区。
- `.dsh-plugin/client.js` 重建并随提交；`.dsh-plugin/index.mjs` 静态转发入口一并提交。

## 测试计划

- `scripts/check.mjs`：
  - 删除 `updateCompletedHolds` 相关测试组（约 13 处断言）。
  - 新增 `completionReminder` 单测：主会话/子代理、running/阻塞等待/委托周期抑制、`lastTurnEnd > ackedAt` 比较、空记账、无 `turn/end` 登记（锚定 R-01-002/AC-03、AC-05、R-01-010/AC-06）。
  - `buildEntries`/`buildRecent` 入参改写断言：completions 中未确认主会话以 awaiting「已完成」留活动区、排除历史区；确认后（`ackedAt ≥ lastTurnEnd`）不成立（锚定 R-01-002/AC-10、R-01-010/AC-06）。
  - bundle 契约断言：完成提醒卡含确认按钮元素、点击不触发跳转（R-01-002/AC-10）、SSE 通道接线（AC-11、AC-12）。
- `scripts/acceptance.mjs`：更新 R-01-002 人工验收步骤——双端同步（A 端确认 B 端同帧解除）、刷新后等待态恢复。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：未确认完成提醒留活动区、按钮确认后迁入历史区、跨端同步解除 | `scripts/check.mjs#R-01-002/AC-03`、`scripts/check.mjs#R-01-002/AC-05`、`src/core.mjs::completionReminder` |
| 异常 | 适用：无 turn/end 登记（会话未观测或升级前历史）时无提醒不报错；SSE 断线重连后全量快照恢复；确认写回失败回滚本地游标 | `scripts/check.mjs#R-01-002/AC-12`、`src/core.mjs::completionReminder` |
| 边界配置 | 适用：升级后历史完成不回溯补发提醒；ackedAt 齐平/晚于 lastTurnEnd 时提醒不成立 | `scripts/check.mjs#R-01-002/AC-03`、`src/core.mjs::completionReminder` |
| 副作用 | 适用：运行卡/最近卡/子代理卡/委托周期呈现不回归；阻塞等待卡无按钮；既有双区迁移动画不回归 | `scripts/check.mjs#R-02-003`、`scripts/check.mjs#R-01-002/AC-10`、`src/client.mjs::makeConfirmButton` |
| 并发 | 适用：双客户端同时确认同一会话幂等（后写覆盖）；SSE 广播一次 | `scripts/check.mjs#R-01-002/AC-11`、`src/host.mjs::apply` |

## 终态与证据

- 实现: `src/host.mjs` 新增宿主侧（storageDomain 声明式 domain 表 `acks`（sessionId → `{ lastTurnEnd, ackedAt }`）、`ctx.on('session/event')` 的 `turn/end` 登记（事件顶层 `time`）、`/dsh-activity-pane/api` 三路由——`GET /acks` 全量快照、`GET /acks/stream` SSE（连接即发全量、变更广播 `state` 事件）、`POST /ack` 写回 `ackedAt = Date.now()` 并广播；连接集合随卸载全数关闭）；`.dsh-plugin/index.mjs` 由 no-op 改为转发 `src/host.mjs`（免构建）；`package.json` 新增 `@deepseek-ai/dsh-storage-domain`/`zod` 依赖。`src/core.mjs`：删除 `updateCompletedHolds` 整套记账，`buildEntries`/`buildRecent` 入参 `heldIds` → `completions`（Map id → `{ lastTurnEnd, ackedAt }`），新增 `completionReminder`/`completionFor` 纯函数（成立 = 主会话 && `lastTurnEnd > ackedAt`；子代理排除；无登记不成立——升级不回溯补发），`isOwnActiveRow` 不再消费宿主 `completed` 边沿标志（C-030 唯一口径）。`src/client.mjs`：删除 `heldCompletedIds`/`prevActiveMainIds` 记账，新增 ack 通道（EventSource 订阅 `/acks/stream`，`state` 事件全量替换本地 Map 并重绘；`ackCompletion` 乐观更新 + 失败回滚，fetch 是 bundle 内唯一 HTTP 调用），「已完成」卡备注行行尾新增「知道了」确认按钮（click/keydown 双路径 `stopPropagation` 不触发跳转，`hidden` 门控仅 done 卡显示）；`.dsh-plugin/client.js` 已重建。`scripts/check.mjs`：响应保持测试组（约 20 处断言）重写为完成确认组（completionReminder 成立/边界/子代理排除、确认解除、委托周期抑制、阻塞优先、completed 边沿不参与判定——含 `recentSnap` 口径改写），bundle 契约新增按钮结构/SSE/fetch 唯一性/易失记账移除断言，host 契约断言（事件登记/路由/SSE/持久化/`node --check` 语法）与入口加载验证；`scripts/acceptance.mjs` 更新人工验收（打开/切走不解除、刷新恢复、按钮迁移不跳转、双窗口跨端同步）。
- 测试: `pnpm build:client && pnpm check` 通过（test-anchored=125/125；完成确认组锚定 R-01-002/AC-03、AC-05、AC-10～AC-12 与 R-01-010/AC-06，`src/host.mjs` 经 `node --check` + 实际 import 加载验证，`node -e` 确认入口导出 apply/inject/name）；`python3 tools/agentmap_lint.py --report` 通过；跨端同步、刷新恢复与按钮交互的人机验收步骤已写入 acceptance.mjs，需人工 GUI 验收。
- DESIGN 对照: PRD R-01-002 改写（AC-03/AC-05 语义变更，新增 AC-10 确认按钮、AC-11 跨端同步、AC-12 刷新/重连恢复）、R-01-010/AC-06 改写、NG-2 收窄；DOMAIN「响应保持」→「完成确认」+「确认按钮」+「完成确认宿主侧」新术语、不变量加确认写回例外；DESIGN 新增三视图图节（数据与领域模型/状态与生命周期/数据流与信任边界）、完成确认状态机与 ack 状态通道契约、「完成确认宿主侧」模块；DECISIONS 追加 C-030；map 与实现一致（含自查修正：显示过滤不再消费宿主 completed 边沿标志，DESIGN 同步）。
- commit: 3154268bf1e44b237a24d630fe2a709308ad1a4e
- 编号说明: 本任务以 T-073 立项（provisional）；另一个 worktree 亦使用 t073 分支名（t073-workspace-hue-separation），若其先于本任务合并并占用 T-073 编号，按未发布冲突规则在 reconciliation 中重排。
- review:
  - 审核方: 实现 agent 自查（子代理独立审核通道异常启动失败，经东家确认改由实现 agent 自查双轴后关闭）。
  - 目的理解: 实现 R-01-002/AC-03、AC-05、AC-10～AC-12 与 R-01-010/AC-06——完成提醒状态改由宿主侧持久化（lastTurnEnd/ackedAt 游标 + SSE 通道）承载，显式确认按钮取代看过即确认，跨端同步与刷新恢复；删除易失内存记账；阻塞等待卡不加按钮；子代理不产生完成提醒；测试锚定 AC-ID。
  - 执行方式: `code-review` skill 流程（Skills 双轴并行审核 + 聚合）；子代理基础实施四次启动均异常（无产出），经东家选择改由实现 agent 自查双轴；评审基线为 merge-base f8b85a412c2a523d0b96ddd3408fe7358f4ac42f，范围为提交 9cb40ad（T-073 工作单元，map+实现+测试原子提交）。
  - 问题与修复: Standards 轴 0 项；Spec 轴 2 项——(1) `isOwnActiveRow` 仍消费宿主 `completed` 边沿标志，会使「宿主 completed=true 但无完成登记」的会话显示为无标识裸等待卡（违背 C-030 唯一口径）→ 移除该分支，`recentSnap`/活动卡测试改写为 completions 驱动并新增「completed 边沿不参与判定」断言，DESIGN 显示过滤同步；(2) `buildRecent` 中完成提醒判定先于子代理排除执行（结果无害但语义不精确）→ 调整顺序，子代理行先排除再判完成确认。另有文案残留「响应保持」两处（check.mjs 断言 message）修正。全部修复后重新 `pnpm build:client && pnpm check && lint` 通过。
  - 复审结论: 自查双轴复审通过（两项 spec finding 全部修复、无新问题；文档与实现同步）。