---
doc-type: task
mutation: lifecycle
id: T-073
---

# T-073 完成提醒改显式确认并跨端同步

状态: active
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

（实现完成后填写）