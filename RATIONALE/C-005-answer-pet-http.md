---
doc-type: rationale
mutation: append-only
id: C-005
owner: agent
---

# C-005 富卡内容经客户端原生订阅快照复刻 answer-pet 卡片，而非移植宿主侧事件折叠 + HTTP 路由

日期: 2026-08-21

#### 上下文
东家要求活动卡片内容向 answer-pet 的卡片靠拢（阶段文案、工具白名单参数摘要、token 计数与速率、阶段进度、最近流程节点轨迹）。调研确认 answer-pet 的 `/answer-pet/state` 本身源自 DSH 原生 `session/event` 事件流（宿主侧折叠 progress/trace 后经 HTTP 轮询下发），不含任何私有数据；存在两条复刻路线。

#### 决策
不移植 answer-pet 的宿主侧会话事件折叠与自有 HTTP 路由，而是从纯客户端原生订阅快照复刻等价字段：
- 阶段/工具名/参数摘要：`sessions.binding(id).session` 的 `runningCalls`（name/argsRaw）、`partial`（stream/reasoning 块）、`turnTimings`（回合时长）；
- 已定案流程节点：`chat.legacy.nodes` 中的工具调用节点（`call.name`/`call.argsRaw`/`callTime`/`time`/`isError`）；
- token/速率：`sessions.list` 条目 `projectionValues.tokenUsage`（累计输出/输入）与 `sessionStats`（decodeTokens/decodeMs 吞吐），复用既有列表订阅，无新增轮询；
- 阶段进度：由阶段 + 输出 token 累计估计，渲染层按回合叠加单调下限，同回合不倒退。

#### 被否方案及原因
- 移植 answer-pet 宿主侧 `session/event` 折叠 + 自有 `/answer-pet/state` HTTP 路由：字段最精确（逐 chunk usage、速率 EMA、textSnippet 都在宿主侧可算），但要求引入 Node 宿主半端并维护自有状态路由与轮询，违背 NG-4 与 R-02-004「无自有路由、无状态轮询」纪律。
  - 且客户端订阅快照已带齐等价原语，精度损失仅外观级（token 累计口径、速率/进度近似、trace 由节点派生而非逐 chunk 重建）。

#### 影响面
R-01-009 / 活动状态模型、R-01-009 / 窗格渲染器
