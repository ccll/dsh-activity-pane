---
doc-type: rationale
mutation: append-only
id: C-030
owner: agent
---

# C-030 完成提醒改为显式确认：确认状态由宿主侧持久化经 SSE 下发，取代"看过即确认"的易失内存记账

日期: 2026-08-26

#### 上下文
东家查证发现：活动会话进入「完成并等待用户确认结果」状态后刷新页面，会话直接落入历史区而非保持等待态。根因是完成提醒的两端记账（宿主 `completedNotifications` 边沿观测、插件 `heldCompletedIds` 上一帧活动记账）均为浏览器内存态，刷新即清零；且「打开/切走即解除」的语义使多客户端各自为政、状态不一致。东家要求：状态变化跨端同步；解除触发条件改为等待卡上的显式确认按钮，而非"看过就算确认"。

#### 决策
- 完成提醒成立 = 主会话 && 非 running && 无阻塞等待 && 非委托周期 && `lastTurnEnd > ackedAt`：`lastTurnEnd` 由宿主侧插件订阅 `session/event` 的 `turn/end` 登记，`ackedAt` 由确认按钮经 `POST /dsh-activity-pane/api/ack` 写回；两者持久化于插件自有 storageDomain 表。
- 解除路径只有两条：显式确认按钮（写回 `ackedAt`）与新回合隐式更替（`lastTurnEnd` 前移，旧提醒被新回合取代，用户不被打扰）。打开会话、切换当前会话、刷新页面均不解除。
- 下发通道为宿主侧 `webServer` 路由 + SSE（连接即发全量快照、变更即广播）；客户端经 fetch/EventSource 消费，新增写入路径仅此一条，不引入轮询。
- 删除插件 `updateCompletedHolds`/`heldCompletedIds` 整套易失记账与「completed && current」兜底，`buildEntries`/`buildRecent` 入参由 `heldIds` 改为 `completions`。
- 确认按钮只加在「已完成」卡备注行行尾（「知道了」），阻塞等待卡不加——阻塞等待的解除是真正回答问题，按钮无法解除会话真实阻塞。
- `turn/end` 一律登记（含子代理、含中断回合），主/子过滤由客户端判定；升级后仅新回合触发登记，历史完成不回溯补发提醒（避免一次性噪音）。

#### 被否方案及原因
- 插件侧 localStorage 持久化 `heldCompletedIds`：登记依赖本端观测完成边沿、解除依赖本端 current，多客户端必然不一致。
  - B 端打开页面即清掉自己持久化的保持。
  - 用户继续对话后跨端残留陈旧保持，需引入额外校验事实，复杂且不根治刷新。
- 演进 DSH 本体（服务端完成提醒 + ack RPC）：是真正负责行为的层级，但需改 DSH 源码仓库且重编译 web 栈，本仓库工作流不可及；东家选定插件内闭环。
- 宿主侧投影（sessionProjections）+ 会话日志 append `session/ack` 事件：append 需要会话处于 live 态（宿主 `sessions.get` 只返回 live），冷会话确认需先 resume 整个 agent，过重。
  - 投影对历史日志惰性折叠会让升级前的历史完成回溯补发提醒。
  - 纯 JS 插件无法做 `SessionProjectionMap` 的 TS 模块增强。
- 宿主侧自有存储 + `webServer` 路由 + 客户端在列表渲染时轮询刷新：引入轮询，违反定时器纪律（R-02-004）；SSE 推送是推送式、随连接自动重连，符合既有订阅纪律。

#### 影响面
R-01-002、R-01-010 / 活动状态模型、窗格渲染器、完成确认宿主侧
