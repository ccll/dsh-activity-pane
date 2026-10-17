---
doc-type: rationale
mutation: append-only
id: C-066
owner: agent
---

# C-066 等待卡复用 native 回合边界显示上一轮耗时

日期: 2026-08-29

#### 上下文
运行卡的耗时来自 `turnTimings` 开始时间并在渲染期实时增长；会话进入完成、阻塞或错误等待后，运行卡骨架被替换，原有右下角时长也随之消失。等待卡已经保留最新 `ConversationSnapshot`，冷路径也会读取 native history，因此存在直接复用会话回合边界与扩展 Host 完成登记两种实现方向。

#### 决策
等待卡从保留快照的 `turnTimings` 或 native history 的 `turn/start`、`turn/end` 配对中选择最近已结束且起止完整的回合，显示 `endTime - startTime` 的固定值；不扩展 Host ack 持久化记录，运行卡继续使用实时耗时。

#### 被否方案及原因
- 扩展 Host ack 记录保存 `lastTurnStart` 或 `lastTurnDuration`：完成提醒的持久化本身不需要该字段，新增存储与 SSE 协议字段会扩大迁移和兼容面；现有 native 回合数据已足以覆盖活动卡与刷新后的冷路径。
- 用 `Date.now() - lastTurnEnd` 估算等待卡耗时：把用户等待时间误算为回合耗时，违反「上一轮花费」语义。

#### 影响面
R-01-009 / 活动状态模型、窗格渲染器
