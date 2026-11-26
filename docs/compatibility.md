# 宿主兼容

兼容分支只保留在 `src/` 源码与端到端夹具中；支持代际、补丁点或 CI 宿主版本变化时同步更新本文件。

## 宿主矩阵

| 宿主版本 | 状态 | 关键差异 |
|---|---|---|
| 0.1.5 | 已退役 | 仅历史注释提及，无活跃补丁；差异入口为旧代快照与日志口径：事件 seq 空间被重编时水位自愈并全量重放（`src/host.mjs:238`、`src/core.mjs:2604`）；会话快照不再携带会话内容，工作项统一取自日志分页（`src/client.mjs:4338`）；快照不再携带 turnTimings，开放回合起点改由宿主侧 busy 记账兜底（`src/client.mjs:5207`）。 |
| 0.2.0 | 当前支持 | CI clean runner 的 pin 为 `0.2.0-rc.2`，同代差异入口：retain/release 承载会话引用代际，binding() 只借用已保留代际（`src/client.mjs:2679`）；jobsBySession 从列表快照移除，任务 roster 改经 jobs 服务的 state.rows 快照（`src/client.mjs:13`）；current 从列表快照移除，当前会话以行上 retainedBy.mainView 推导（`src/core.mjs:1669`）；待确认、待审查、待回复经 sessionStatus 统一状态面承载（`src/client.mjs:2982`）；会话导航改经 uiWorkspace.openSession（`src/client.mjs:5612`）；scrollbar-width token 收窄到 5px，调宽手柄须与原生滚动条分离（`src/client.mjs:173`）。 |
| 0.2.2 | 当前支持 | `0.2.2-rc.1` 实测的同代差异入口：窄视口新增宿主自己的浮动侧栏开关，开关落位须按可见命中盒避让（`src/client.mjs:1742`）；壳层 3.3.x 在标题行下新增 Chat/Trajectory 标签行，透明命中带伸入标题行底部，叠置带命中归开关（`src/client.mjs:1755`）。 |

## 兼容补丁

| 补丁点 | 位置 | 为什么需要 |
|---|---|---|
| 任务 roster 订阅 | `src/client.mjs:13` | 0.2.0 起列表快照不再携带 jobsBySession，后台任务须改经 jobs 服务的 state.rows 订阅。 |
| 会话引用代际 | `src/client.mjs:2679` | 0.2.0 起 retain/release 承载会话代际，旧的显式打开与释放调用已移出会话面。 |
| 当前会话推导 | `src/core.mjs:1669` | 0.2.0 起列表不再携带 current，须以 retainedBy.mainView 引用计数推导。 |
| 子代理目录读取 | `src/core.mjs:1699` | 0.2.0 起 subagentsByParent 移除，须改读列表投影 projectionsBySession。 |
| 等待状态面 | `src/client.mjs:2982` | 0.2.0 起 sessionStatus 取代 pendingInteractions，等待类别取自统一快照。 |
| 会话导航 | `src/client.mjs:5612` | 0.2.0 删除 sessions.open，导航改经 uiWorkspace.openSession。 |
| 滚动条宽度 token | `src/client.mjs:173` | 0.2.0 起宿主 scrollbar-width token 收窄到 5px，须以 max() 保底避免手柄压住滚动条命中区。 |
| 窄视口壳层开关避让 | `src/client.mjs:1742` | 0.2.2 起窄视口新增宿主浮动侧栏开关，开关落位须按可见命中盒避让。 |
| 壳层标签行叠置 | `src/client.mjs:1755` | 壳层 3.3.x 新增 Chat/Trajectory 标签行，透明命中带伸入标题行底部，须以置顶与命中归开关处理。 |
| 事件 seq 水位自愈 | `src/host.mjs:238` | 0.1.5 的 V3 迁移会重编事件 seq，水位超前时须从空状态全量重放。 |
| 开放回合起点兜底 | `src/client.mjs:5207` | 0.1.5 起快照不再携带 turnTimings，开放回合起点须由宿主 busy 记账提供。 |
| 日志为工作项来源 | `src/client.mjs:4338` | 0.1.5 起快照不再携带会话内容，工作项须经日志分页读取。 |

## 回执

- [0.2.0-rc.2 布局回执](docs/receipts/T-193-0.2.0-layout.md)
- [0.2.2-rc.1 布局回执](docs/receipts/T-193-0.2.2-layout.md)

## 更新规则

- 新增或移除兼容补丁时，同一提交更新本文件。
- 支持代际增减或 CI 宿主版本变化时，同步更新宿主矩阵与回执。
