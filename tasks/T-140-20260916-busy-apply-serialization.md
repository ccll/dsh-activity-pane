---
doc-type: task
mutation: lifecycle
id: T-140
---

# T-140 busy 实时登记会话级串行化：并发读-改-写丢失边界事件效果导致总耗时缺记

状态: completed
关联: R-01-020 → 回合统计宿主侧
风险等级: standard

## 背景与目标

- 背景: 东家报告会话总耗时常常短于当前轮次耗时。实证（本机 `~/.dsh/storages/dsh_activity_pane_turns.json` 对全会话日志全量重放）：22 个会话持久化 busyMs 缺记，最大 `session-e51e6c4a` 缺 19,227,276ms（104 回合）；活体会话 `session-f7341eb1` 同一 watermarkSeq=284 处持久化 busyMs=126,325、全量重放=736,852，差值 610,527ms 与「第一次 `ask_user_question` 的 `tool/call`（seq 69，t=1789525885678）到 `turn/end`（seq 282，t=1789526728436）的整段 842,758ms − 两段已配对等待 232,231ms」精确吻合——提问 `tool/call` 与 11ms 后的 `tool/result` 并发交错，结算事件读到旧状态被当作「无效果」丢弃，等待区间悬挂到 `turn/end` 强制结算，把整段真实运行过程从累计中扣掉。
- 根因: 宿主存储域 `KvTableImpl.put` 先异步落盘、落盘完成后才更新内存快照（dsh-storage-domain）；实时登记 handler 为并发 async 读-改-写，后到事件在先到事件 put 落盘前读到旧状态——其效果被永久丢弃且水位已被先到事件推进，增量回填不再补齐。DESIGN 原文「get+put 无竞态」的假设被证伪。
- 定性: 缺陷修复（map 措辞同步：DESIGN 的「get+put 无竞态」描述修正为串行化登记契约）。
- 目标: 同一会话的边界事件读-改-写严格按派发序逐个完成（含 put 内存生效）后再处理下一事件；并发登记结果与顺序重放一致。
- 非目标: 不追溯修正已缺记的存量 busyMs（沿用 T-124「不追溯修正存量累计值」先例，全量重放自愈仅由既有水位重编/legacy 扫描路径触发）；不改 acks 通道的 `ackedAt` 读取（窗口极窄、症状不同，留待单独评估）。

## 差距评估

- src/host.mjs: 实时登记 handler 为并发 async 读-改-写，直接读 `turnStats.get(id)` 与 `turnStats.put` 交错。
- src/core.mjs: 无会话级任务串行化原语。
- DESIGN.md: 「实时登记随 session/event 按会话序提交（get+put 无竞态）」与实测不符。
- scripts/check.mjs: 无并发登记回归断言。

## 收敛方案

1. core.mjs 新增 `createSessionEventSerializer()`：按会话 id 串行执行 run（前一 run 完成含其 put 内存生效后才执行下一 run），不同会话互不阻塞，链空闲即清理。
2. host.mjs: 实时登记 handler 改为同步注册进会话级串行链（注册同步保持派发序），读-改-写整体移入链内；水位幂等、重编检测、回填排队逻辑不变。
3. DESIGN.md: 「get+put 无竞态」修正为会话级串行化契约描述。
4. scripts/check.mjs: 新增并发登记回归断言（同步注册 + put 延迟生效，最终记账与顺序重放一致）。

## 测试计划

- `scripts/check.mjs`（UNIT）: 新增 R-01-020/AC-02 会话级串行化断言（同步注册 4 个边界事件、put 延迟 5ms 更新内存，最终 busyMs 与顺序重放一致、回合闭合无残留起点）。
- `pnpm verify:fast` 编辑循环；`pnpm verify` 全量回归。
- `.dsh-plugin/client.js` 随实现重建（`pnpm check` 校验一致）。
- 机制验证（一次性）：以无串行化的同构脚本复现并发登记丢失结算（busyMs=null），确认修复非空转。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-020/AC-02 | 增强（并发登记与顺序重放一致） | UNIT | update | `scripts/check.mjs` 会话级串行化断言 |
| DESIGN | 记账运行时措辞（get+put 竞态实证、登记串行化契约） | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：并发同步注册下逐事件登记与顺序重放一致 | `scripts/check.mjs#R-01-020/AC-02`、`e2e/specs/session-lifecycle.mjs::R-01-020/AC-01` |
| 异常 | 适用：put 延迟生效时不丢边界事件效果 | `scripts/check.mjs#R-01-020/AC-02`、`src/host.mjs::serializeBusyEvent` |
| 边界配置 | 适用：不同会话互不阻塞；链空闲清理不随会话数增长 | `src/core.mjs::createSessionEventSerializer` |
| 副作用 | 适用：不改变通道契约与持久化形态，无新增轮询/写回 | `e2e/specs/session-lifecycle.mjs::R-01-020/AC-01` |

## 终态与证据

- 实现: core.mjs 新增 `createSessionEventSerializer()`（per-id Promise 链：前一 run 完成含其 put 内存生效后才执行下一 run，不同会话互不阻塞，`prev.then(run, run)` 保证单 run 失败不中断链，链空闲清理且容忍新 run 抢占）；host.mjs 实时登记 handler 改同步注册进串行链、读-改-写整体入链，水位幂等/重编检测/回填排队逻辑逐行保留；DESIGN.md「get+put 无竞态」证伪措辞改为会话级串行化契约（拆嵌套列表）。
- 测试: `pnpm verify` 全量通过（exit 0，15 个 e2e spec 全绿；首轮 compact-density 时序偶发单跑复跑通过、全量复跑通过）；`scripts/check.mjs` 新增 R-01-020/AC-02 会话级串行化断言（同步注册 4 边界事件、put 延迟 5ms 更新内存，最终 busyMs=3989 与顺序重放一致、回合闭合无残留起点）。机制验证（一次性，task 外内联脚本）：无串行化同构并发登记输出 busyMs=null（正确值 3989），实证修复非空转。
- DESIGN 对照: 回合统计运行时条目拆为实时登记串行化/口径收敛/懒回填/SSE 推送四子项，串行化契约与 core 引用一致；「按会话序写入」「实时登记与回填共用同一转移」等既有描述与实现对照无差异；代码位置引用（core.mjs::createSessionEventSerializer、host.mjs::serializeBusyEvent）与实现一致。
- commit: 088e9c7
- review:
  - 审核方: code-review skill（Standards/Spec 双轴并行独立 reviewer 子代理，fixed point = HEAD 018d227 对工作树全 diff；复审同章程另行发起）
  - 目的理解: 修复 busy 实时登记并发读-改-写竞态——KvTable.put 先落盘后更新内存，后到事件读到旧状态、先到事件效果被永久丢弃（提问 tool/call 与 11ms 后的 tool/result 结算丢失，等待悬挂到 turn/end 强制结算，总耗时系统性缺记）；同次收敛 DESIGN「get+put 无竞态」证伪措辞与 R-01-020/AC-02 回归断言；非目标为不追溯存量 busyMs、不动 acks 通道。
  - 执行方式: code-review skill 双轴评审（Standards 轴对照 AGENTS.md 工程原则 + CONVENTIONS.md + Fowler 基线；Spec 轴对照 T-140 背景与目标/收敛方案/测试计划），两轴独立并行后聚合；复审仅复核修复 hunks 与文档收敛。
  - 问题与修复: ① DESIGN.md 超长单句违反写作风格规范 → 拆为父条目 + 4 嵌套子项；② 根因叙述三处全量重复 → core JSDoc 权威、host 缩一行引用（check.mjs 测试注释保留完整叙述，独立可读性权衡，非阻断残余）；③ core JSDoc「tail 可能 reject」与 host 丢弃 tail 的契约矛盾 → 改为「run 内部须自行捕获错误、不得让拒绝外泄（调用方可安全丢弃 tail）」；④ `applySerializedBusyEvent` 命名与形状错位 → 更名 `serializeBusyEvent`；⑤ 一次性机制验证证据未留痕 → 实证结果（无串行化 busyMs=null vs 正确值 3989）记入本终态。全部修复后 `pnpm verify:fast` 复跑通过。
  - 复审结论: 双轴复审通过——Standards 轴 4 条全部关闭（1 条非阻断残余：check.mjs 测试注释保留根因叙述）；Spec 轴无新 finding，关闭前条件（终态证据落实）已在本次填定。
