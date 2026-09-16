---
doc-type: task
mutation: lifecycle
id: T-140
---

# T-140 busy 实时登记会话级串行化：并发读-改-写丢失边界事件效果导致总耗时缺记

状态: active
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

（active 期间待填）
