# 后台任务 roster 订阅

后台任务只作标注与子卡呈现，不改变会话的活动归属、等待类别或提醒成立。数据面来自 shell 的 `jobs` 客户端服务，不在列表快照里。

## 数据面

- 任务快照：`jobs.state.getSnapshot().rows`，形状为 `Record<sessionId, JobView[]>`。
- 每会话 roster：`jobs.watchRows(id)` 建立引用计数共享流，返回停止函数。
- 订阅分两层：`jobs.state.subscribe` 驱动渲染帧；`watchRows(id)` 维持每会话 roster 的活跃引用。
- 读点单点：`jobsRowsOf()` 从 `jobs.state` 取 rows，订阅回调与基线重置共用同一取法。
- 去抖：`jobsPaneSignature(rows)` 只覆盖在跑任务（id、kind、label、status、startedAt），签名不变不点亮渲染轮。
- 代际基线：服务代际更替时以当帧快照重置 `lastJobsSignature`，此后仅真实变化触发重绘。

## roster 差集同步

- 每帧调用 `syncJobsWatches(listSnapshot)`；服务缺失整轮跳过。
- 快照引用短路：同一列表快照引用下 ids 集合不变，不重建集合。
- 差集：列表新增 id 建 `watchRows`，离开列表的 id 调 stop 并除名。
- 单会话订流失败不缓存失败态，下一帧重试。
- 释放点：列表 prune、服务代际更替、插件卸载；`stopAllJobWatches` 单点停全部流。
- 任务视图订阅与母卡数量标注不随显示档位停摆。

## 条目派生

- `liveJobsOf(rows, id)`：取 `status ∈ {running, stopping}` 的任务，按 `startedAt` 升序。
- 归一字段：`{ id, kind, label, status, startedAt }`；非记录、字段非法一律剔除，不抛错。
- 活动区母卡与历史卡都携带 `liveJobs`；不改变入选判定与排序。
- 每个在跑任务另产出 `kind: "job"` 子条目：
  - 复合 id `job:<sessionId>:<jobId>`，与会话 id 空间隔离。
  - `parentId` 为母会话，`depth` 为母会话深度 +1。
  - 标题取任务内容原文 `label`，另带 `jobKind`、`jobStatus`、`jobStartedAt`。
- 子条目只由活动区母卡产出；历史卡只标注数量。
- 子卡为纯展示：不绑激活、不设按钮语义、无悬停反馈。

## 呈现

### 母卡数量注

- 文本 `后台 ×N`，由 `jobsChipState(entry)` 单点判定文本、隐藏与闪烁。
- 闪烁条件：卡片处于等待态、非阻塞等待、自身回合未运行、存在在跑任务。
- 闪烁以卡根 `data-jobs-blink` 属性驱动，CSS 同一节奏脉冲数量注。
- 同门控暂停时间线执行中圆点与标题状态点的呼吸，着色与光晕不变。
- 自身回合运行中、阻塞等待、最近历史卡不闪烁。

### 任务子卡

- 第一行：状态点 + 工具名 + 右对齐时长。
- 状态点：running 蓝、stopping 琥珀，仅这两态闪烁并带同色相光晕。
- 工具名映射 `jobKindLabel`：`bash`→Bash、`pwsh`→PowerShell、`subagent`→子代理；未知 kind 原样，不可得时只留状态点与时长。
- 第二行：任务内容原文，mono 单行省略，悬停以原生 tooltip 显示全文；内容为空时整行隐藏。
- 时长随时钟推进，写入 `jobsAgeSec` 秒桶进入渲染签名。
- 卡面底色在子代理卡底色上轻染任务状态同族色，两种主题同法。
- 档位门控：仅完整档构建子卡；中间/紧凑档从活动条目剔除，且时长不注入签名。

## 失败与降级

| 场景 | 结果 |
|---|---|
| `jobs` 服务缺失 | 整轮跳过，无标注无子卡 |
| `watchRows` 不存在 | 不建立 roster 订阅，仍消费 `state.rows` |
| 单会话订流抛错 | 下一帧重试 |
| 快照形状非法 | 签名空串、派生按无任务处理 |
| 流已断（卸载/代际更替） | stop 抛错被吞，除名继续 |

## 验证

- `e2e/specs/background-jobs.mjs`：数量注、任务子卡、闪烁门控、档位剔除与母卡状态。
- `scripts/check.mjs`：`liveJobsOf`、`jobsPaneSignature`、`jobKindLabel`、`jobsChipState` 的单元断言。
