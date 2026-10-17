---
doc-type: rationale
mutation: append-only
id: C-024
owner: agent
---

# C-024 模型上下文改经 modelDirectories 目录 store 订阅获取实时选择（一次性 RPC 仅作初值）

日期: 2026-08-26

#### 上下文
东家实测发现：会话过程中切换模型后，活动卡/最近卡的模型上下文永远停留在首次读取时的取值。查证确认宿主 `session.selectModel` 只改内存选择并保存默认值，不产生任何会话事件、投影或推送帧；卡片模型来自对每个可见会话仅一次的 `session.models` RPC（T-016 设计的「可见期内不热重试」），会话列表行不含模型字段，故无任何通道感知切换。

#### 决策
模型上下文采用「订阅推送 + 一次性读取初值」双轨：为每个可见主会话订阅原生 `modelDirectories` 服务的 per-session 目录 store（与主会话窗口 `/model` 弹窗、输入框模型座位共享同一 store，`select()` 成功即推送当前选择），推送到达即重归一并就地更新卡片；初值与失败语义完全沿用既有 `session.models` 一次性读取路径；服务缺失、会话无 scope 或订阅失败时退化为纯一次性读取。目录 store 只订阅、不调用 `load()`——`load()` 会推进目录的 generation 计数，与用户进行中的 `select()` 竞争会导致其 store 更新被「最新操作胜出」规则丢弃。

#### 被否方案及原因
- 回合边界重读 `session.models`：切换后要到下一回合开始才更新，与主会话窗口「选择即刻生效」的呈现不一致。
- 从 `request/context` 会话事件派生：数据只有 `{provider, model, contextWindow}`，无 reasoningEffort 与 catalog 显示名，且同样滞后到下一回合；仅反映「最后请求所用」而非「当前选择」。
- 周期性重读 RPC（轮询）：违反定时器纪律（R-02-001「不使用数据状态轮询」）。
- 订阅 store 并主动 `load()` 代替自有 RPC：如上所述会与 `select()` 竞争 generation，且重复原生条目的加载职责。

#### 影响面
R-01-012 / 活动状态模型、窗格渲染器
