---
doc-type: task
mutation: lifecycle
id: T-185
---

# T-185 流式派生增量化——只折叠新增条目与合并间隔再平衡

状态: active
类型: 性能优化
风险等级: major
风险面: 无（派生管线内部增量化的行为保持改造：呈现结果不变、对外契约不变，不触及契约、资金、数据迁移、对外接口、鉴权；合并间隔为内部运行参数，未登记于 SOLUTION 契约）
关联需求: 无新承诺——达标类性能收敛（map 不变短路，C-082 口径）；呈现承诺（R-01-009/AC-09 时间线语义、R-01-012 锚行、R-01-016 配对）不变
决策依据: 东家批准（2026-11-10）并给出设计 directive——「只重新绘制改动过的地方、只处理新的内容」：派生改为增量处理新增条目，已派生的内容跨拍复用；合并间隔 100→250ms 先行缓解。

## 背景与目标

活实例实测（2026-11-10 14:00，3 运行会话、日志窗口已长大）：渲染进程 115.5% 单核，折叠函数占非空闲采样 74.3%、GC 20.4%——T-181 的减半已被窗口增长吃掉（窗口随会话历史增长，折叠成本 O(窗口)/拍 × 10Hz × 并发会话数）。结构性解法即东家指示的增量模型：**每次派生只处理新增条目，已派生内容跨拍保留；任何非纯追加变化整体重算**。合并间隔同步放宽至 250ms 作为落地即得的缓解。

## 差距评估

- PRD：无变化（呈现内容与粒度承诺不变；增量派生是内部计算路径）。
- SOLUTION：无变化（派生管线内部机制；定时器纪律不受影响）。
- 代码：`conversationTimelineFromHistory`（src/core.mjs:1001）每次全窗口重建条目（tool/call–result 配对、live-chunk 累积、流式行合并均为无状态重算）；`applyLogEvents` 每拍全量调用（src/client.mjs:2296）。历史事件窗口为纯追加为主：流式 chunk 逐条追加、回合落定后 transient 条目被 durable 替换（局部变化）、重连/窗口替换为整体更换。
- 失效触发（HANDOFF ④b 风险预案）：history 引用整体替换、条目序列断档/回退、cwd 变化——任一命中即放弃增量状态全量重算（fail-closed 到既有全量路径，错误内容风险由「宁全量勿增量」的守则兜底）。

## 收敛方案

1. 合并间隔：`SYNC_MIN_INTERVAL_MS` 100→250（先落地先缓解；注释登记 T-127 立项值与本次再平衡依据）。
2. core 新增有状态增量折叠：`createHistoryFoldState()` 产出 `{ items, inflightCalls, liveAttempts, count, lastSeq }`；`foldHistoryAppend(state, events, cwd)` 校验纯追加（条目数增长且第 count-1 条 seq 与记录一致）后仅处理新增条目——逐条逻辑与 `conversationTimelineFromHistory` 的循环体完全同源（live-chunk 累积、result 原位替换、call/result 配对、普通条目 push），抽取共享实现避免双实现漂移。
3. 失效触发（任一命中即整表重建）：条目数少于已处理数、第 count-1 条 seq 与记录不符（窗口替换/裁剪/落定替换）、cwd 变化、history 引用整体更换（detail.log 更换代际）。重算后重建状态并继续增量。
4. 客户端接线：detail 持有 foldState；applyLogEvents 改走增量路径（cwd/代际变化即整表重建）；时间线产出沿用既有折叠分组与尾部选择（`foldedHistoryTimeline` 的 limit/settle 语义不变，分组产出由增量维护的 items 提供）。
5. 验收：隔离 A/B（折叠绝对采样数应大幅下降）+ 活实例同窗实测（对照 2026-11-10 上午 115.5%/折叠 74.3%）+ 增量等价性 E2E（长流式回合的呈现与全量派生逐字段一致）。
6. 无分叉点: 增量模型为东家明确指示（GUI 增量渲染类比）；失效守则（宁全量勿增量）为唯一安全口径，无第二认真候选。

## 测试计划

- scripts/check.mjs：增量折叠单测——纯追加序列与全量折叠逐字段一致；落定替换（transient→durable）触发整表重建且结果一致；seq 断档触发重建；cwd 变化触发重建；畸形条目容错与全量路径一致。
- e2e 新增增量等价性 spec：长流式回合（longstream）期间与落定后的卡片时间线内容与既有全量语义一致（含流式行合并、tool/call–result 配对、锚行）。
- 既有回归：card-content、hidden-derive-resume、background-jobs、idle-quiescence、mobile-thermal（rAF 阈值）、session-lifecycle 全量保持。
- 测试影响：PRD/SOLUTION 无变化（map 不变），无 AC 锚点变更。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：合并间隔放宽即时生效；增量派生与全量派生输出一致（实现落地后锚定） | `src/client.mjs::SYNC_MIN_INTERVAL_MS`；增量等价性以 `scripts/check.mjs::conversationTimelineFromHistory` 既有断言为对照基线 |
| 异常 | 适用：非纯追加（替换/断档/裁剪/cwd 变化）触发整表重建 | 失效触发断言随实现提交补锚（对照基线 `scripts/check.mjs::conversationTimelineFromHistory`） |
| 边界配置 | 适用：三档密度、隐藏页、代际更替与增量状态的交互 | `e2e/specs/density-resource.mjs::densityResource`、`e2e/specs/hidden-derive-resume.mjs::hiddenDeriveResume` |
| 副作用 | 适用：增量状态随 detail 生命周期、不跨代际 | 增量状态重建断言随实现提交补锚（对照 `scripts/check.mjs::conversationTimelineFromHistory`） |
| 性能 | 适用：折叠频率先降六成（250ms），增量化后折叠成本降为 O(新增)/拍 | `scripts/perf-ab.mjs::measureProfiledEventPeriod`（折叠绝对采样数对照）与活实例同窗实测（终态记录） |

## 自查清单

- 边界：空窗口/空追加/首帧建立状态；seq 为插值小数（transient）时的比较口径。
- 异常路径：窗口替换（重连）、落定替换、seq 断档、cwd 变化均触发整表重建；dispose 后状态随 detail 消亡。
- 回归影响：tool/call–result 配对、流式行合并、锚行、settle 语义经既有 e2e 与新增等价性 spec 断言；合并间隔放宽至 250ms 后移动端热静默 rAF 阈值只降不升。

## 终态与证据

（关闭时填写）
