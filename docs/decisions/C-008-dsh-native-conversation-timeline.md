---
doc-type: rationale
mutation: append-only
id: C-008
owner: agent
---

# C-008 工作项与历史预览使用 DSH native conversation 数据，不重新依赖 timelineUserMessages

日期: 2026-08-21

#### 上下文

新的 R-01-012/R-01-013 要求活动卡复用主会话窗口最近 4 个工作项（含当前实时项），并要求历史卡分别显示最近用户消息与 agent reply 的第一个非空物理行。当前会话快照已经提供 `chat.order`、`chat.nodes`、`partial`、`runningCalls`；冷会话可通过 native `sessions.history` 只读读取原始事件，模型上下文可通过 native `sessions.models` 读取。旧 C-006/T-004 的 `timelineUserMessages` 投影会折叠空白且只表达用户消息/回复对，不能保证工作项顺序与物理首行。

#### 决策

使用 DSH native conversation snapshot、native history API 与 native model catalog 作为数据源：当前会话优先读 `chat.order`/`chat.nodes` 并由 `session.subscribe` 推送刷新；冷会话仅做一次 history/model 读取并在缺失时降级为空字段。不得新增第三方路由、不得把 `agentPreset` 当模型名称，也不重新引入 `timelineUserMessages` 作为必需依赖。

#### 被否方案及原因

- 复用 `timelineUserMessages` 投影：只能提供压平后的用户/回复预览，不能证明主窗口工作项的完整顺序，也丢失物理换行语义。
- 打开每个会话窗口再克隆主窗口 DOM：会改变当前会话选择并产生不可控的布局/网络副作用。
- 自建宿主 projection/HTTP route：会扩大插件部署边界，违背原生只读服务与无自有状态路由约束。

#### 影响面

R-01-012 / 活动状态模型；R-01-013 / 活动状态模型、窗格渲染器；R-02-004 / 窗格渲染器
