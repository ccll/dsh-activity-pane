---
doc-type: task
mutation: lifecycle
id: T-188
---

# T-188 busy/acks 通道增量化——连接全量、变更按会话增量、落盘合帧

状态: active
类型: 性能优化
风险等级: major
风险面: 对外接口（SSE 帧协议与 SOLUTION 契约行 343/417）、数据恢复语义（AC-04 水位与自愈路径）
关联需求: R-01-002/AC-03、AC-10～AC-13、R-01-010/AC-06（完成确认通道）、R-01-020/AC-02～AC-07（累计运行时长通道）——承诺不变，机制演进
决策依据: 东家批准（2026-11-10）性能双路深查结论与第二刀方案——busy/acks 通道是唯一两端都在插件自有代码内的传输通道，现状「每有效边界事件整表全文件重写落盘 + 全量快照广播 × 每连接」且两表无删除路径，成本随会话历史只增不减（实测：acks 表 3747 条/落盘 705KB/广播 508KB；turn_stats 3187 条/924KB/365KB）。SOLUTION 契约微演进（343/417 两行）已经东家批准授权。

## 背景与目标

双路深查实测（2026-11-10）：宿主侧每个有效回合边界事件触发 `turnStats.put`（single 布局整文件 stringify+原子重写+目录 fsync，src/host.mjs:315-316）与 `broadcastBusy()`（全量快照 JSON 序列化发往每个 SSE 连接，src/host.mjs:156）；每个 turn/end 触发 `acks.put` + 全量广播（src/host.mjs:250-256）。客户端收到即全量 parse 并清空重建 Map（src/client.mjs:1819-1831、1921-1925）。回填对已有记录会话也无条件读全会话事件（src/host.mjs:189，增量仅在应用侧）。活跃期写盘节奏 = 每有效边界事件一次整文件重写（非批量）。

目标：广播改「连接即全量（恢复语义不变）、变更按会话 id 增量 upsert」；落盘改「内存即改、按会话合帧尾沿写盘」；`GET /api/busy` 按请求 id 裁剪响应。成本从 O(全表×连接数)/事件 降为 O(变更会话)/事件，落盘从每事件一次降为合帧一次。

## 差距评估

- PRD：无变化（R-01-002/R-01-020 的可观察承诺不变：确认及时性、累计正确、恢复一致、跨客户端同步均由「连接全量+增量按序」继续满足）。
- SOLUTION：343 行 acks 通道契约与 417 行 busy 下发行随实现同笔演进（patch 事件语义、落盘合帧节奏、GET 裁剪），由本 task 测试影响表承载 DESIGN update 行——东家已授权。
- 代码：host.mjs 广播/落盘三处 + client.mjs 两通道 apply 函数 + GET 路由。
- 关键约束（实现前必读）：
  - 现 host 侧读-改-写依赖 `put` 先落盘后更新内存的按会话串行语义（src/host.mjs:269-271 注释）；合帧化必须把「内存即改」与「落盘延后」解耦——内存 Map 仍是权威状态与增量广播源，落盘为尾沿合帧，两者都须在会话串行域内保持事件序。
  - 两表均无删除路径（acks/turnStats 只有 put），patch 帧只需 upsert、无需墓碑。
  - 崩溃窗口：合帧间隔内进程崩溃最多丢失该窗口的落盘写（内存态已失）；下次懒回填经 `reconcileTurnStats` 从事件全量重放自愈（R-01-020/AC-04 恢复语义承载），水位不回退。
  - 客户端 busyById 为原地 clear+set 变更且 busyVersion 记账依赖三处写点递增（T-186）：patch 路径合并写入后同样必须递增 busyVersion。

## 收敛方案

1. core 新增可测纯逻辑（Node 单测直测，host 只做接线）：
   - `buildChannelPatch(records, changedIds)`：由全量 records 与变更 id 集产出 patch 帧对象 `{ upserts: { [id]: record } }`（畸形 id/缺失记录跳过）。
   - `createDirtyFlusher({ flush, intervalMs, now?, schedule?, cancel? })`：按会话（或脏键集）尾沿合帧的落盘调度器——标记脏即内存立即可用，flush 在尾沿把脏键集合交给宿主写盘；dispose/立即冲刷入口供卸载路径；可注入 schedule/cancel 便于单测时钟。
2. host.mjs 接线：
   - `/acks/stream` 与 `/busy/stream`：连接即发 `event: state` 全量（不变）；变更改发 `event: patch`（upserts，仅本次变更会话）。
   - turn/end 登记与 busy 边界登记：内存即改 → `buildChannelPatch` 增量广播 → 脏键入 `createDirtyFlusher`；`acks.put`/`turnStats.put` 由 flusher 尾沿执行（间隔 500ms，登记为内部运行参数）；插件 dispose 钩子触发立即冲刷（ctx 卸载路径可得则接，不可得则登记崩溃窗口自愈依据）。
   - 回填完成广播同样走增量（变更 id 的 patch）。
   - `GET /api/busy` 支持 `?ids=` 逗号分隔裁剪响应；客户端 `requestBusyBackfill` 请求带 ids。非法/超量 ids 形态回退全量（防御）。
3. client.mjs：
   - `applyAcksState`/`applyBusyState` 拆双分支：`state` 事件全量重建（既有路径，恢复/重连收敛）；`patch` 事件逐 id upsert 合并（形状校验沿用既有 record 归一），busy 路径递增 busyVersion。
   - EventSource 监听注册 patch 事件类型；未知事件类型忽略（向前兼容）。
4. SOLUTION.md:343/417 契约行随实现同笔改写（patch 语义、合帧节奏、GET 裁剪），本 task 测试影响表 DESIGN update 行承载。
5. P1-2 边界裁决（登记项非实现项）：探查 `sessionQuery.listEvents` 是否具备水位/分页增量读取面；不具备则本 task 不改回填读取路径，在终态登记上游缺口（宿主侧读放大留待 dsh web 演进），不得引入行为近似。
6. 无分叉点: 东家批准的方案范围即上述协议（决策依据行）；patch 形状（upsert-only）由「两表无删除路径」事实唯一确定；合帧间隔为内部运行参数非契约。

## 测试计划

- scripts/check.mjs：`buildChannelPatch` 单测（全量→patch 形状、多 id、畸形输入容错）；`createDirtyFlusher` 单测（尾沿合帧、多次标脏合并、dispose 冲刷、注入时钟推进）；既有断言全数保持。
- e2e：既有全量 24 specs 保持通过（completion-sync/busy-backfill-race/auto-update/session-lifecycle 等经新协议路径隐式回归 acks/busy 消费与恢复语义）；如既有 spec 断言了 SSE 全量广播细节则随协议演进而改写（报告单列）。
- perf 守恒：`pnpm perf:ab --check`（折叠采样阈值 1.2）PASS。
- 全量 `pnpm verify` 全绿。
- 测试影响：SOLUTION.md:343/417 演进由本 task 测试影响表 DESIGN update 行承载；PRD 无变化。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：增量协议下确认及时性、累计正确、跨客户端同步、恢复一致全部保持 | `e2e/specs/completion-sync.mjs::completionSync`、`e2e/specs/busy-backfill-race.mjs::busyBackfillRace`；buildChannelPatch/createDirtyFlusher 单测锚随实现提交登记（本 task 收敛方案 1） |
| 异常 | 适用：patch 畸形帧、未知事件类型、flush 写盘失败保留内存态 | `tasks/T-188-busy-acks-delta-channel.md::createDirtyFlusher`（计划锚点登记，实现提交落地后换绑实测符号） |
| 边界配置 | 适用：多连接并发、重连收敛、ids 裁剪的非法形态回退 | `e2e/specs/session-lifecycle.mjs::sessionLifecycle` |
| 副作用 | 适用：崩溃窗口丢失窗口写由懒回填自愈（水位不回退）；busyVersion 记账在 patch 路径递增 | `tasks/T-188-busy-acks-delta-channel.md::崩溃窗口` |
| 性能 | 适用：每事件广播字节与落盘次数显著下降（O(变更会话)/事件） | `scripts/perf-ab.mjs::measureProfiledEventPeriod` 守恒对照；host 侧写盘节奏实测（文件 mtime 频谱）随终态记录 |

## 自查清单

- 边界：空 patch（无变更不广播）、单 id patch、多 id patch、重连后全量→增量衔接、GET ids 空串/重复/超量。
- 异常路径：合帧期间进程崩溃（恢复语义经回填自愈）；patch 与 GET 响应交错的时序（SSE 数据不旧于同刻 GET 的既有论断在增量下的保持）；flush 写盘失败不吞错（宿主 logger 告警，内存态继续）。
- 回归影响：客户端对 `state` 事件的处理路径不变（重连收敛）；completion-sync/busy-backfill-race 等既有 e2e 经新协议全绿；watermarkSeq 只前移。

## 终态与证据

- 关闭时填写: 实现证据、测试证据、SOLUTION 对照（DESIGN 行引用）、commit、review 三标签（active 期间本节留待关闭提交填记）。
