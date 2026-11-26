# 断流恢复与懒回填

浏览器侧的三条数据通道各有独立恢复路径；宿主侧用「事件是唯一事实来源」承担缺口自愈。通道清单与触发条件见 `docs/architecture.md`，本文只写实现级细节。

## 失效形态

- 移动 PWA 挂起时在途 `setTimeout` 被系统丢弃，节流窗口尾与流式派生窗口不再交付。
- 自建 `EventSource` 在恢复后常以 `CLOSED` 终态落地，不再自动重连。
- 自建 SSE 也可能呈半开死连接：状态看似 OPEN，但不再收到任何广播。
- 壳层 gateway 连接半开时无 `close`、无 `online`、无心跳，推送永久停滞。
- 卡片运行状态只来自壳层推送；自建 SSE 的重建覆盖不到该通道。

## 恢复通道一：渲染管线

- 触发：`visibilitychange` 到 `visible`，或 `pageshow` 且 `persisted === true`。
- 动作：清掉在途 `syncThrottleTimer`，把流式派生的待办按最新日志窗口补算一次，再调度一轮 `deliverSync`。
- 目的：解除 `syncScheduled` 永久置位导致的后续更新全部早退。
- 不以定时器自检，恢复由事件驱动。

## 恢复通道二：自建 SSE

- acks 与 busy 两个通道在回前台时无条件重建连接，不做阈值判断。
- 重建语义：先 `close` 旧连接再 `new EventSource`；连接即收宿主全量 `state` 快照。
- 收敛能力：`CLOSED` 与半开死连接一并恢复；未知事件类型由 `EventSource` 忽略，向前兼容。
- 降级：环境无 `EventSource` 时静默不显示对应功能，其余功能不受影响。

## 恢复通道三：壳层连接重建

- 入口：`ctx.get("connection")`，软依赖，不在 `inject` 清单。
- 触发条件：观测到 hidden→visible 边沿且隐藏时长 ≥30000ms；或 bfcache `pageshow(persisted)` 无条件触发。
- 触屏形态判定：`(hover: none) and (pointer: coarse)` 为真才重建；桌面鼠标主输入形态不重建。
- 去重：两次重建间隔 ≥2000ms，只由真正调用 `reconnect()` 的路径推进。
- 动作：`connection.reconnect()` 中止当前 generation 并立即重连，壳层控制流重发全量快照、事件流重开。
- 降级：`connection` 缺失或 `reconnect` 抛错时静默，不阻断通道一与通道二。
- 测试接缝：URL fragment `dap-e2e-resume-reconnect-ms` 可覆盖隐藏时长阈值，上限 3600000ms；不改变生产门控。

## 宿主侧回合记账回填

- 触发：`GET /dsh-activity-pane/api/busy?ids=` 携带 id 时，对每个非空 id 触发 `ensureTurnStatsFresh`。
- 单飞：每会话至多一个在途回填，重复请求共享同一 promise。
- 收敛函数：`reconcileTurnStats(current, records, options)`。
- 全量重放分支：无记录、水位非法、水位超前于日志最大 seq、或调用方要求强制重放。
- 增量分支：只应用 `seq > watermarkSeq` 的事件，水位衔接保证不重复不遗漏。
- 启动扫描：对残留开放回合按日志最后事件时刻强制结算；无 `watermarkTime` 的旧记录强制全量重放一次。
- 重编检测：实时登记遇到低 seq 事件但事件时刻比 `watermarkTime` 更新时，判定 seq 空间重编并强制全量重放。
- 失败：读取失败保留既有记账，下一次请求重试；会话不存在或已删除时静默跳过。
- 写入路径：回填结果写入宿主内存权威缓存，标脏落盘，并向 busy SSE 广播该会话 patch。

## 客户端懒回填

- 触发点：渲染时对可见主会话发起一次 `GET .../busy?ids=`，`cache: "no-store"`。
- 去重：`busyRequestedIds` 防重复请求；在途时跳过。
- 只补缺：`applyBusyBackfill` 只写入本地缺失的 id，不覆盖既有记录。
- 权威通道：busy SSE 始终是权威来源，GET 响应只作补录。
- 失败退避：请求失败后该 id 30s 内不再请求；不构成逐帧轮询。

## 串行化与落盘

- acks 通道：`await domainReady` 之后是单个同步段，读-改-写-标脏-广播不可分割。
- busy 通道：`createSessionEventSerializer` 按会话串行，不同会话互不阻塞；run 内含 `await`。
- 事件序：派发序等于缓存变更序等于 patch 广播序。
- 落盘：脏键经 `createDirtyFlusher` 500ms 尾沿合帧；批次间串行，同键写有序。
- 崩溃窗口：合帧窗口内进程消失至多丢该窗口落盘，下次回填经全量重放自愈，水位不回退。
- 卸载：冲刷与关域合并在同一 disposer 内串行 `await`；cordis 多 effect 的 disposer 并发执行，分属两个 effect 无法保证顺序。

## 失败语义汇总

| 场景 | 结果 |
|---|---|
| 无 `EventSource` | 对应通道缺席，其余功能正常 |
| `connection` 缺失或重连抛错 | 壳层通道降级，其余恢复通道照常 |
| acks 写回 HTTP 失败 | 本地游标回滚，提醒恢复 |
| 落盘写失败 | 告警不丢内存态，下次变更重标脏，缺口由重放自愈 |
| 回填读取失败 | 保留既有记账，下次请求重试 |
| 壳层代际更替 | 先释放旧订阅与引用，再绑定新代际 |

## 验证

- `e2e/specs/connection-resume.mjs`、`e2e/specs/connection-resume-desktop.mjs`：回前台壳层连接重建与桌面不重建。
- `e2e/specs/mobile-resume.mjs`：移动挂起恢复。
- `e2e/specs/hidden-derive-resume.mjs`：隐藏期派生的回前台补齐。
- `e2e/specs/busy-backfill-race.mjs`：回填与实时登记并发。
- `scripts/check.mjs`：`reconcileTurnStats`、`totalBusyDisplayMs`、`createDirtyFlusher`、`parseBusyIdsParam` 的单元断言。
