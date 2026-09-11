---
doc-type: task
mutation: lifecycle
id: T-124
---

# T-124 总耗时口径改为仅运行过程计时 + 水位卡死自愈

状态: completed
关联: R-01-020 → 回合统计宿主侧
风险等级: standard

## 背景与目标

- 背景: 东家报告会话进入已完成状态后标题行总耗时仍持续增长。实证（本机运行中的 dsh web）：`session-97df2d68` 的 acks 已记录 450 秒前 `completed`，而 busy 记账 `openTurnStart` 停在 16.7 小时前；持久化 `watermarkSeq = 208536` 恰为旧格式日志中 turn 25 `turn/start` 的 seq，而 dsh 0.1.5 V3 迁移后同一事件 seq 重编为 2685（日志最大 seq 2879）——实时登记的幂等守卫 `seq ≤ watermarkSeq` 把迁移后的全部回合事件永久跳过，`openTurnStart` 永不清空，显示值按 `now − openTurnStart` 无限增长。
- 定性: 复合变更（东家确认）：① 缺陷修复——水位超前于日志时增量口径失效，需自愈；② 需求变更（东家拍板）——总耗时只在运行过程计时，回合内的阻塞等待（提问、审批、计划审查）与回合间空闲一律不计入。dsh 会话日志自带等待边界事件（`approval/asked`–`approval/decided`、`ask_user_question` 的 `tool/call`–`tool/result`），宿主侧可持久配对。
- 目标: ① 总耗时只在运行过程推进，等待/完成期间冻结且等待时长永久不计入；② 水位卡死记录自愈，完成后不再增长。
- 非目标: 不追溯修正存量累计值（旧口径已含的等待时长不作回溯扣除）；不改变最近回合耗时（回合固定耗时）的口径；不新增轮询或写回路径。

## 差距评估

- core.mjs: `applyTurnEventToStats` 只识别 `turn/start`/`turn/end`，无等待区间概念；`totalBusyDisplayMs` 无等待扣除项；缺少「增量 vs 全量重放/强制结算」的统一收敛函数。
- host.mjs: 实时登记只订阅 `turn/start`/`turn/end`；busy 通道不下发等待字段；无宿主启动扫描。
- client.mjs: busy 归一只取 `busyMs`/`openTurnStart`。
- 存量数据: 旧空间水位记录（如实测 `watermarkSeq=208536` vs V3 日志最大 seq=2879）永久封死增量登记。
- PRD/DESIGN/DOMAIN: R-01-020 语义扩展（已过闸口）。

## 收敛方案

1. core.mjs `applyTurnEventToStats` 扩展：识别 `approval/asked`（开等待 kind='approval'，记 `data.id`）、`approval/decided`（结算 approval 等待）、`tool/call`（`data.name === 'ask_user_question'`，开等待 kind='question'，记 `data.callId`）、`tool/result`（同 `callId` 时结算 question 等待）；`turn/end` 先强制结算未配对等待再 `busyMs += time − openTurnStart − waitedMs`；id/callId 不匹配的结算事件忽略；等待串行不嵌套。
2. core.mjs 新增 `reconcileTurnStats(current, records, { closeOpenTurn } = {})`：无记录、`watermarkSeq` 非法或 `watermarkSeq > maxSeq` 时从空状态全量重放（自愈）；否则增量应用 `seq > watermarkSeq`；`closeOpenTurn`（宿主启动扫描）在重放后若仍有开放回合按日志最后事件时刻强制结算，日志不可得时仅清除回合态、不制造虚假时长。
3. core.mjs `totalBusyDisplayMs` 扩展：`busyMs + max(0, (now − openTurnStart) − waitedMs − (openWaitStart 非空时 now − openWaitStart))`——等待期自冻结、等待结束与回合结算处连续无跳变。
4. host.mjs: 事件订阅经 `isBusyBoundaryEvent` 放行等待边界事件；无效果边界事件（非提问工具调用、未配对结算等）不落盘、不广播、水位不前移——避免高频 tool 事件的写放大，重放路径对同类事件同样无效果、口径一致；`busySnapshot` 增 `waitedMs`/`openWaitStart` 下发；回填与启动扫描统一走 `reconcileTurnStats`；插件启动扫描 `openTurnStart` 非空的存量记录强制结算关闭。
5. client.mjs: busy 记录归一扩展 `waitedMs`/`openWaitStart`；`applyTotalBusy` 传参新字段，渲染公式不变。
6. e2e: `session-lifecycle.mjs` 补「完成后总耗时不随时间增长」断言（覆盖原缺陷回归）；`auto-update.mjs` 补「提问等待期间总耗时冻结」断言（AC-07）。

## 测试计划

- `scripts/check.mjs`: 新增等待配对（approval/asked–decided、tool/call–tool/result、id/callId 不匹配忽略、kind 不匹配忽略、串行不嵌套、turn/end 强制结算）、显示合成（等待期冻结、恢复续走、结算连续）、`reconcileTurnStats`（增量/水位超前全量重放自愈/启动强制结算）断言。
- `pnpm verify:fast` 编辑循环；`pnpm verify` 全量回归。
- `.dsh-plugin/client.js` 随实现重建（`pnpm check` 校验一致）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-020/AC-02 | 修改（回合结算扣除等待区间） | UNIT | update | `scripts/check.mjs` 等待配对与回合结算断言 |
| R-01-020/AC-07 | 新增 | UNIT | update | `scripts/check.mjs` 等待期冻结、恢复续走、结算连续性断言 |
| R-01-020/AC-04、AC-05 | 不变（语义覆盖水位自愈与启动扫描） | UNIT | update | `scripts/check.mjs` 水位超前全量重放自愈、启动强制结算断言 |
| R-01-020/AC-01 | 不变（完成后冻结回归） | E2E | update | `e2e/specs/session-lifecycle.mjs` 补完成后总耗时稳定断言 |
| DESIGN | 记账 v2 + 水位自愈目标态 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：运行期逐秒累计、完成后冻结 | `scripts/check.mjs#R-01-020/AC-01`、`e2e/specs/session-lifecycle.mjs::R-01-020/AC-01` |
| 异常 | 适用：水位超前自愈、残缺等待强制结算、启动扫描关闭残留开放回合 | `scripts/check.mjs#R-01-020/AC-04`、`e2e/specs/session-lifecycle.mjs::R-01-020/AC-01` |
| 边界配置 | 适用：kind 不匹配结算忽略、串行等待不嵌套、提问等待冻结 | `scripts/check.mjs#R-01-020/AC-07`、`e2e/specs/auto-update.mjs::R-01-020/AC-07` |
| 副作用 | 适用：不新增轮询/写回路径，busy 通道仅扩展只读字段 | `scripts/check.mjs#R-01-020/AC-02`、`e2e/specs/session-lifecycle.mjs::R-01-020/AC-07` |

## 终态与证据

- 实现: 记账 v2——`applyTurnEventToStats` 配对回合内阻塞等待（`approval/asked`–`decided`、`ask_user_question` 的 `tool/call`–同 `callId` `tool/result`，id/callId 不匹配忽略、串行不嵌套、`turn/end` 强制结算）；`reconcileTurnStats` 统一收敛（无记录/水位非法/水位超前全量重放自愈，启动扫描 `closeOpenTurn` 强制结算残留开放回合）；host 事件订阅经 `isBusyBoundaryEvent` 放行、无效果事件不落盘不广播、busy 通道增 `waitedMs`/`openWaitStart`；client 消费新字段，显示公式等待期自冻结；`emptyTurnStats`/`turnStatsFrom`/`turnStatsEqual`/`settleTurnClose` 收敛数据集团与结算算式。
- 测试: `pnpm verify` 全量通过——lint（agentmap + test-impact：+R-01-020/AC-07、~AC-02）、`node scripts/check.mjs` 全部断言（等待配对/id·callId 不匹配/强制结算/冻结连续性/水位自愈/启动扫描）、14 个 e2e spec 全绿（`session-lifecycle` 完成后总耗时冻结回归、`auto-update` 提问等待期总耗时冻结；中途一次 session-lifecycle 时序偶发，单跑复跑通过、全量复跑通过）。
- DESIGN 对照: 回合统计记账 v2 字段清单（含 `openWaitId`）、等待边界配对与强制结算规则、显示公式、reconcile 自愈与启动扫描均与实现对照无差异；审核发现的 map≠code（callId 配对缺失、字段清单漏列 `openWaitId`）已同次收敛。
- commit: 6e151c1
- review:
  - 审核方: code-review skill（Standards/Spec 双轴并行独立 reviewer 子代理，fixed point = HEAD 0ca0c15 对工作树全 diff；复审同章程另行发起）
  - 目的理解: 让总耗时只计运行过程——① 修复存量记账被迁移前 seq 空间水位封死导致的「完成后总耗时无限增长」缺陷（增量登记失效、openTurnStart 永不清空）；② 落实东家新需求 AC-07（回合内提问/审批/计划审查等待停表、等待时长永久不计入）；③ 记账、显示、通道、文档（PRD AC-02/AC-07 + DESIGN 记账 v2）同次演进。
  - 执行方式: code-review skill 双轴评审（Standards 轴对照 AGENTS.md 工程原则 + CONVENTIONS.md + Fowler 基线；Spec 轴对照 T-124 收敛方案 + PRD R-01-020 + DESIGN 目标态），两轴独立并行后聚合；复审仅复核修复 hunks 与文档收敛。
  - 问题与修复: ① callId/id 配对缺失（DESIGN 写同 callId 结算而实现只查 kind，map≠code）→ 新增 `openWaitId` 持久化字段并实现 id/callId 配对结算，补不匹配忽略断言；② 边界事件类型清单 core/host 重复 → 收敛为 `isBusyBoundaryEvent` 单点；③ 记账五字段数据集团（≥8 处逐字段展开）→ 收敛为 `emptyTurnStats`/`turnStatsFrom`/`turnStatsEqual`，强制结算算式下沉 `settleTurnClose` 共用；④ 冗余守卫与增量水位赋值简化；⑤ DESIGN 字段清单与 host 头注释漏列 `openWaitId` → 补齐；⑥ 计划外项（无效果事件跳过落盘、非法水位全量重放、空日志关闭行为）→ 记入 task 收敛方案。全部修复后 `pnpm verify` 复跑通过。
  - 复审结论: 通过（Standards 轴：四项修复确认应用、无新增违规；Spec 轴：配对实现忠实于 spec、越计划项已文档化，遗留仅文档层微瑕并已同次收敛）。
