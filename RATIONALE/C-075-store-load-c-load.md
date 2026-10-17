---
doc-type: rationale
mutation: append-only
id: C-075
owner: agent
---

# C-075 目录 store 在 0.1.5 改为订阅 + 显式一次性 load（修订 C-024 的「只订阅不 load」）

日期: 2026-09-11

#### 上下文
dsh 0.1.5 把 per-session 模型目录 store 改为惰性加载：不调用 `load()` 就不产出当前选择，C-024 的「只订阅」路径不再能获得模型初值；同时原 C-024 依赖的初值来源 `session.models` 一次性 RPC 已随 V3 迁移移除。

#### 决策
主会话目录链改为「订阅 + 显式一次性 `load()`」：`loadDirectoryOnce` 每会话至多触发一次，load 与用户 `select()` 同经目录的「最新操作胜出」生成规则仲裁，订阅推送仍即时更新卡片；子代理不建立订阅（目录 RPC 被宿主 agent-busy 拒绝），模型/effort 改经其会话日志 `request/header` 提取。

#### 被否方案及原因
- 维持「只订阅不 load」：0.1.5 惰性 store 永不产出，卡片模型永久空白（e2e loading-ready 实证）。
- 主会话也走 `request/header` 日志提取：请求头只反映「最后请求所用」而非「当前选择」，切换即刻生效的呈现会回退到 C-024 否决过的滞后语义。
- 轮询/回合边界重读：同 C-024 已否决的定时器纪律与滞后问题。

#### 影响面
R-01-012 / 模型上下文、活动状态模型
