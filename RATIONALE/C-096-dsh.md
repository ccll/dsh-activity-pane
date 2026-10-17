---
doc-type: rationale
mutation: append-only
id: C-096
owner: agent
---

# C-096 客户端数据面迁移到 dsh 0.2.0 引用分配模型

> 登记编号说明：本条在 staging 适配分支登记为 C-086（正文内任务引用 T-159），因 main 侧同号条目先行存在，合并时按编号递增改号为 C-096；任务同步改号（任务文档 T-170，日期后缀同原登记）。
日期: 2026-10-08

#### 上下文
dsh 0.2.0-rc.2 重构了客户端会话对象层：
- `sessions.list` 删除 `current`/`subagentsByParent`/`jobsBySession`/`currentAddress`。
- `uiSession.pendingInteractions` 替换为 `sessionStatus`。
- `binding()` 收紧为只借用已保留代际；显式打开与释放调用移出会话面；`sessions.open` 删除。
- 子代理目录移入 `projectionsBySession` 投影。
窗格六处消费点失去直接数据源。东家下达 staging 分支适配指令（T-170）。

#### 决策
- 当前会话以行上 `retainedBy.mainView > 0` 推导（宿主外壳同款口径）。
- 子代理目录改读 `projectionsBySession.values.subagentCatalog`，经 `refreshProjections` 按需拉取。
- 后台任务经 `jobs` 服务 `watchRows`+`state.rows`。
- 会话窗口与轮内订阅迁移到 `retain()/release()` 生命周期（独立 source `dsh-activity-pane`）。
- 导航经 `uiWorkspace.openSession`；子代理以持久父地址寻址。
- 等待状态读 `sessionStatus.pendingInteraction`。

#### 被否方案及原因
- 读取 `uiSession.current` 私有面：非公开契约，随内部重构随时失效。
- 以 `sessionStatus.running` 或 `pinnedSessionIds` 推导当前会话：语义不等价（前者是运行态、后者是置顶），产出错误高亮而非显式失败。
- 维持旧 `binding()` 隐式借用并容忍 undefined：非当前会话窗口永不水合，功能倒退且掩盖故障。
- 双版本兼容层（按快照形状探测分支）：0.1.5 与 0.2.0 数据面无公共子集，双倍维护成本，违背根因优先。

#### 影响面
R-01-001、R-01-023 / 活动状态模型（T-170）；R-01-003、R-01-005、R-01-006、R-01-009、R-01-012 / 窗格渲染器（T-170）
