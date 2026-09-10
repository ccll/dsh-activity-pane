---
doc-type: task
mutation: lifecycle
id: T-118
---

# T-118 会话卡片标题行显示累计运行时长

状态: active
关联: R-01-020 → 回合统计宿主侧
风险等级: standard

## 背景与目标

- 背景: 东家希望在会话卡片标题行最右侧显示全会话累计 busy 运行时长（所有回合运行时间之和，不含回合间空闲）；宿主快照 `turnTimings` 只覆盖已加载窗口，无法满足全会话口径（评估结论见本会话记录）。
- 目标: 按 R-01-020 实现——宿主侧实时配对记账 + 懒回填存量回合，经只读 HTTP/SSE 通道下发，客户端在主会话卡片标题行最右侧呈现并逐秒推进（R-01-020/AC-01～AC-06）。
- 非目标: 不改变 R-01-009 既有单回合耗时语义、不合并 acks 通道、不做子代理卡片显示、不引入任何轮询。
- 需求闸口: 东家确认方案 C（宿主侧记账）与三个口径（全部结束原因计入 / 仅主会话卡片 / 逐秒累加）；PRD、DESIGN 闸口先后经东家确认（C-074）。

## 差距评估

- PRD: 已新增 R-01-020（AC-01～AC-06）；DESIGN 已新增「回合统计宿主侧」子系统、记账不变量、运行时语义与追溯索引行；DOMAIN 已登记术语与实体。
- 代码: `src/host.mjs` 现只订阅 `turn/end` 登记提醒（acks 表），无回合起止配对记账、无 `sessionQuery` 注入、无 busy 通道；`src/client.mjs` 标题行（`dap-row`）无时长节点；`src/core.mjs` 无事件流配对累计纯函数。
- 数据面: 宿主 `sessionQuery.listEvents(sessionId)` 返回全会话升序事件，回填通路可行；`dsh-storage-domain` 无迁移机制（version 不同在 open 时拒绝），故 turnStats 必须使用独立新 domain，不可在现有 domain 上加表或升版。
- 测试: `scripts/check.mjs` 无累计口径断言；e2e 无标题行时长锚点。

## 收敛方案

1. `src/core.mjs` 新增纯函数：事件流配对累计（升序 seq 扫描、start–end 同回合成对、逆序/残缺跳过）与显示值合成（busyMs + 开放回合实时已耗时）。
2. `src/host.mjs`：注入 `sessionQuery`；新 domain `dsh_activity_pane_turns` 表 `turnStats`；实时登记 `turn/start`–`turn/end`；懒回填（每会话单飞、水位幂等）；`GET /api/busy` + `/busy/stream` SSE 下发。
3. `src/client.mjs`：订阅 busy SSE；`buildEntries`/`buildRecent` 注入主会话 `totalBusyMs`；标题行末尾 `flex:none` 时长 span，运行中随 1s 时钟实时推进。
4. 重建 `.dsh-plugin/client.js`，`pnpm verify` 全量验证，独立 code-review 后关闭。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-020/AC-01 | 新增标题行累计时长契约 | UNIT/E2E | add | `scripts/check.mjs` 显示值合成断言；e2e 标题行锚点 |
| R-01-020/AC-02 | 新增全部结束原因计入契约 | UNIT | add | `scripts/check.mjs` 配对累计断言（含 aborted/error 回合） |
| R-01-020/AC-03 | 新增开放回合实时增量契约 | UNIT | add | `scripts/check.mjs` 起点不可得降级断言 |
| R-01-020/AC-04 | 新增重启/刷新恢复契约 | UNIT | add | `scripts/check.mjs` 水位幂等断言 |
| R-01-020/AC-05 | 新增懒回填契约 | UNIT | add | `scripts/check.mjs` 回填补齐断言 |
| R-01-020/AC-06 | 新增无数据不显示契约 | UNIT | add | `scripts/check.mjs` 空数据显示为空断言 |
| R-01-002 | acks 通道与完成确认语义不变 | E2E | update | `e2e/specs/session-lifecycle.mjs` 既有 completion-sync/error-reminder 断言随本次改动继续通过 |
| DESIGN | 新增回合统计宿主侧子系统、记账不变量、运行时语义与追溯索引行 | UNIT/E2E | add | 同次变化由本 task 记录：R-01-020 六条 AC 锚定于 `scripts/check.mjs#R-01-020/AC-01`～AC-06 与 `e2e/specs/session-lifecycle.mjs` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：可见主会话卡片标题行显示累计值并逐秒推进 | `scripts/check.mjs#R-01-020/AC-01`、`e2e/specs/session-lifecycle.mjs::R-01-020/AC-01` |
| 异常 | 适用：回填失败保留记账下次重试；起点缺失/逆序回合跳过 | `scripts/check.mjs#R-01-020/AC-02`、`e2e/specs/session-lifecycle.mjs::R-01-020/AC-03` |
| 边界配置 | 适用：空会话/无计时数据不显示；watermark 幂等不重复计数 | `scripts/check.mjs#R-01-020/AC-06`、`e2e/specs/session-lifecycle.mjs::R-01-020/AC-06` |
| 副作用 | 适用：acks 通道、完成/错误提醒、统计行布局不变 | `scripts/check.mjs#R-01-020/AC-05`、`e2e/specs/session-lifecycle.mjs::R-01-013/AC-12` |

## 测试计划

- 先在 `scripts/check.mjs` 补 R-01-020 六条 AC 的纯函数断言（RED），再实现转 GREEN。
- `pnpm verify:fast` + `pnpm verify` 全量；e2e 新增/扩展标题行锚点。
- 重建 `.dsh-plugin/client.js` 并随实现提交暂存。
- 调用 `code-review` skill 做独立审核，修复并复审全部 finding 后关闭 task。

## 终态与证据

状态: completed

- 实现: 宿主侧（src/host.mjs）新独立 domain `dsh_activity_pane_turns` 表 `turn_stats`（sessionId → { busyMs, openTurnStart, watermarkSeq }），注入 sessionQuery；`session/event` 配对 turn/start–turn/end 实时记账（seq ≤ watermark 幂等跳过、全部结束原因计入、主/子统一登记），表内无记录的会话先经 sessionQuery.listEvents 全量重放懒回填再应用实时事件（每会话单飞）；`GET /dsh-activity-pane/api/busy?ids=` 全量快照 + `/busy/stream` SSE 只读下发。客户端（src/client.mjs）busy SSE 订阅 + 可见主会话回填触发，active/recent 条目注入 totalBusyMs（totalBusyDisplayMs 渲染期合成，运行中含开放回合实时已耗时），标题行最右侧 dap-total-time 呈现，子代理卡不显示。core（src/core.mjs）applyTurnEventToStats/totalBusyDisplayMs 纯函数；cardSignature 纳入 totalBusyMs。`.dsh-plugin/client.js` 随 d72a8aa 重建。
- 测试: `scripts/check.mjs` 先行补 R-01-020 六条 AC 断言（配对累计、孤儿/逆序回合、水位幂等、显示合成、重放补齐、空数据 null）确认实现后全绿；fetch/EventSource 契约断言按 C-074 演进为 2 处（ack 写回 + busy 懒回填触发；acks/busy 两条 SSE 通道）；e2e session-lifecycle 新增运行卡与历史卡标题行累计时长锚点（R-01-020/AC-01、AC-03、AC-05、AC-06 反向覆盖 hidden）。`pnpm verify:fast` 全绿；`pnpm verify` 全量 13 spec 通过（202140ms）。
- DESIGN 对照: DESIGN.md 新增「回合统计宿主侧」子系统条目、关键机制「会话累计运行时长」条目、核心数据不变量「回合统计记账」、运行时语义「回合统计运行时」与需求追溯索引行（R-01-020 → 回合统计宿主侧，实现位置 src/host.mjs、src/core.mjs、src/client.mjs）；PRD R-01-020 六条 AC 与实现逐条对应（agentmap lint：requirements=24、design-covered=24、test-anchored=142/142）；DOMAIN.md 登记术语「累计运行时长」与实体「回合统计宿主侧」；无实现与 DESIGN 差异。
- commit: d72a8aa
- review:
  - 审核方: Standards reviewer `91417982-db55-46e7-bf5c-fbd0f25f603b`；Spec reviewer `41ed45aa-1aa8-4de7-97c7-9b33c09dbd98`。
  - 目的理解: 会话卡片标题行最右侧需显示全会话累计 busy 运行时长（所有回合运行时间之和、不含回合间空闲，运行中逐秒推进），宿主快照 turnTimings 仅有加载窗口口径，故按 C-074 以宿主侧实时记账 + sessionQuery 懒回填 + 只读 HTTP/SSE 通道承载；约束为不引入轮询（R-02-004）、不动 acks 契约（C-030）、PRD R-01-020 六条 AC 为可判定锚点。
  - 执行方式: `code-review` skill；基线 `0bd600e`，范围 `git diff 0bd600e...HEAD`（提交 d72a8aa）；Standards/Spec 双轴并行独立审核后聚合。
  - 问题与修复: Standards 轴 3 项判断性意见（active/recent 两处注入块形状重复、{busyMs, openTurnStart} 数据团、变量名 turnStats 与表名 turn_stats 并存），均评估为不阻断、与既有惯例一致，未修改；Spec 轴 2 项证据覆盖备注（子代理卡不显示与宿主重启恢复无 e2e 直证，前者实现路径正确、后者由 storageDomain 持久化架构同构先例推断），无缺陷、无 scope creep、无 spec 缺失。无需要修复的问题。
  - 复审结论: Standards 轴通过（无硬性标准违反）；Spec 轴通过（AC-01～AC-06 全部有实现与测试锚点，无 scope creep、无错误实现）；双轴最终通过，T-118 实现与追溯证据闭合。
