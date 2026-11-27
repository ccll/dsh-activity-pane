# ack / 回合统计通道与持久化

宿主侧维护两份会话级记账：完成/错误登记（`acks`）与累计运行时长（`turn_stats`）。两者都以 `session/event` 为唯一事实来源，经 HTTP/SSE 下发，客户端只读消费。

## 存储域

| domain | 表 | 字段 |
|---|---|---|
| `dsh_activity_pane` v1 | `acks` | `lastTurnEnd`、`lastTurnEndKind`、`lastTurnEndError`、`ackedAt` |
| `dsh_activity_pane_turns` v1 | `turn_stats` | `busyMs`、`openTurnStart`、`openWaitStart`、`openWaitKind`、`openWaitId`、`waitedMs`、`watermarkSeq`、`watermarkTime` |

- 字段全部可选可空：旧记录缺字段不得让 domain 打开失败。
- 存储域无迁移机制：version 不同即拒绝打开；新增表落新 domain，不改既有 domain 的 version。
- 会话事件可全量重放重建记账，持久化只是加速与恢复载体。

## 事件登记

### 完成/错误登记

- 事件：`session/event` 中 `type === 'turn/end'`。
- `lastTurnEnd` 取事件顶层 `time`；非有限数字直接忽略。
- `lastTurnEndKind` 取 `event.data.reason.kind`；非字符串归一为 `unknown`。
- `lastTurnEndError` 仅在 `kind === 'error'` 且 `reason.error.message` 为字符串时写入，按 Unicode 码点截断到 120 字符（省略号不计入）。
- 非 error 回合把 `lastTurnEndError` 置空。
- 登记保留既有 `ackedAt`：回合更替不清确认游标，只让旧提醒失效。
- 主/子会话统一登记，主/子过滤在客户端完成。

### 回合统计登记

- 边界事件：`turn/start`、`turn/end`、`approval/asked`、`approval/decided`、`ask_user_question` 的 `tool/call` 与同 `callId` 的 `tool/result`。
- 状态转移：`applyTurnEventToStats` 单步推进；无效果事件不落盘、不广播、不前移水位。
- 等待配对：审批按 id、提问按 `callId`；kind 或 id 不一致的结算事件忽略；等待不嵌套。
- 结算：`turn/end` 先按事件时刻强制结算未配对等待，再累计 `time − openTurnStart − waitedMs`。
- 结束原因 completed/blocked/max-tokens/aborted/error 均计入运行时长；回合间空闲与回合内等待不计入。
- 水位：`watermarkSeq` 为已覆盖最大 seq，`watermarkTime` 为水位处事件时刻。

## HTTP 通道

| 方法 | 路径 | 语义 |
|---|---|---|
| GET | `/dsh-activity-pane/api/acks` | 全量 ack 快照 |
| GET | `/dsh-activity-pane/api/acks/stream` | SSE：连接发全量 `state`，变更发 `patch` |
| POST | `/dsh-activity-pane/api/ack` | 写回 `ackedAt` 并广播 |
| GET | `/dsh-activity-pane/api/busy` | 全量或按 `?ids=` 裁剪快照；对 id 触发懒回填 |
| GET | `/dsh-activity-pane/api/busy/stream` | SSE：连接发全量 `state`，变更发 `patch` |

- 鉴权：每个请求先过 `connection.requestRejection(req)`，401/403 直接拒绝，不继承宿主路由门。
- `patch` 载荷：`{ upserts: { [sessionId]: record } }`，只含本次变更会话；空 patch 不广播。
- `?ids=`：逗号分隔、逐项 trim、去空、去重；解析不出合法 id 或超过 200 个即整体回退全量。
- 未携带 `ids` 不回填；携带即对每个非空片段触发回填，忽略裁剪结果。
- `POST /ack`：`sessionId` 缺失或非字符串返回 400；写回只改 `ackedAt`。
- busy 下发视图只含 `busyMs`、`openTurnStart`、`waitedMs`、`openWaitStart`；水位与等待种类不下发。
- SSE 连接集合由宿主维护，写失败即从集合移除；卸载时全部 `end`。
- 路由生命周期：`ctx.webServer.register({ kind: 'prefix', path: API_PATH, handler })` 经 `ctx.effect` 交给插件 fiber 持有；
  fiber dispose 时释放路由，重新 apply 可在同一 `webServer` 上再次挂载。宿主在运行期可能 dispose 再重新 apply
  （模块热重载，或 profile 重载重建该条目）——裸 register 丢弃 disposer 会让旧路由滞留前缀表，新实例以
  `duplicate route` 启动失败，旧 handler 闭包的 ctx 已失效（读取 `connection` 抛 inactive context），
  acks/busy 全部 400、完成提醒随刷新消失，直到重启宿主（2026-11-27 本机事故根因）。

## 内存权威与落盘

- 内存 Map 是读点与读-改-写的权威状态；存储表退化为落盘通道。
- 变更顺序：先改内存 → 标脏 → 广播 patch。
- 合帧：`createDirtyFlusher` 500ms 尾沿，把脏键集合一次性写盘；批次间串行，同键写有序。
- 写盘失败：logger 告警，不吞错到进程退出；内存态继续，下次变更重标脏。
- 崩溃窗口：丢该窗口落盘；恢复由懒回填全量重放自愈，水位不回退。
- 卸载：同一 disposer 内 `await flusher.dispose()` → `await domain.close()`；分属两个 effect 的 disposer 并发执行，无法保证先后。

## 串行化

- acks：`await domainReady` 之后为同步段，读-改-写-标脏-广播不可分割。
- busy：`createSessionEventSerializer` 按会话串行；run 内含 `await`；不同会话互不阻塞。
- 回填在途时实时事件排队等待回填写入完成，避免快照覆盖实时效果。
- 事件序等于派发序、缓存变更序与广播序。

## 累计运行时长显示

- `totalBusyDisplayMs` 合成：已完成累计加开放回合实时已耗时，扣除已配对等待与进行中等待。
- 等待期间两项增量同步增长相互抵消，显示值冻结；结算后从冻结值继续，无跳变。
- 两项皆不可得返回 null，客户端不显示，不以 0 冒充。
- 子代理条目不注入显示值。

## 验证

- `scripts/check.mjs`：`applyTurnEventToStats`、`reconcileTurnStats`、`totalBusyDisplayMs`、`buildChannelPatch`、`parseBusyIdsParam`、`createDirtyFlusher` 的单元断言；
  插件生命周期契约（apply → fiber disposer → 重新 apply）钉住卸载释放 HTTP 路由与重载后可再注册。
- `e2e/specs/completion-sync.mjs`：跨客户端确认同步与恢复。
- `e2e/specs/error-reminder.mjs`：provider→宿主→SSE→浏览器路径。
- `e2e/specs/busy-backfill-race.mjs`：回填与实时登记交错。
