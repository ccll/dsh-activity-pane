---
doc-type: rationale
mutation: append-only
id: C-074
owner: agent
---

# C-074 会话累计运行时长由宿主侧记账 + sessionQuery 懒回填承载，经独立 busy 通道只读下发

日期: 2026-09-10

#### 上下文
R-01-020 需要在会话卡片标题行显示全会话累计 busy 运行时长（不含回合间空闲）。宿主快照 `turnTimings` 只覆盖已加载事件窗口，长会话历史回合缺失；客户端虽有 `session.history` 深翻基建，但逐卡片全量翻页成本 O(全会话) 且多端重复。需要选定数据承载与下发通路。

#### 决策
- 宿主侧插件（与完成确认宿主侧同文件）订阅 `session/event` 配对 `turn/start`–`turn/end` 实时累加，持久化于 storageDomain 新表 `turnStats`（`{ busyMs, openTurnStart, watermarkSeq }`）；主/子统一登记，过滤由客户端判定（沿用 C-030 模式）。
- 存量回合与宿主停机缺口经注入的 `sessionQuery.listEvents(sessionId)` 懒回填——仅客户端请求可见会话时触发，每会话至多一个在途回填，以 `watermarkSeq` 幂等衔接不重不漏。
- 下发为只读通道：`GET /api/busy` 全量快照 + `/busy/stream` SSE，与 acks 通道同模式；不新增写回路径、不引入轮询（R-02-004）。

#### 被否方案及原因
- 客户端深翻全量 `session.history` 后把结果上报宿主：引入第二条客户端写回路径，多客户端会并发上报同一会话需要去重仲裁，且每个新客户端都要重复 O(全会话) 翻页。
- 纯快照 `turnTimings` 窗口内累计：实现最省，但长会话窗口外回合永久缺失，冷启动后数字逐渐长大，不满足全会话口径（AC-05）。
- 宿主侧 sessionProjections：纯 JS 插件无法做 `SessionProjectionMap` 的 TS 模块增强（C-030 已证），且投影对历史日志惰性折叠会让回填时机不可控。
- busy 统计并入 acks 通道：改动既有 acks SSE 契约形态，牵连 R-01-002 既有测试；独立通道与 C-030 同构、增量最小。

#### 影响面
R-01-020 / 回合统计宿主侧、活动状态模型、窗格渲染器
