---
doc-type: task
mutation: lifecycle
id: T-119
---

# T-119 T-118 双轴审核修复：SSE 卸载、停机缺口与 map 同步

状态: completed
关联: R-01-020 → 回合统计宿主侧
风险等级: standard

## 背景与目标

- 背景: T-118（d72a8aa）关闭后，Standards/Spec 双轴审核的最终报告提出硬性 finding：① client 侧 busySource 未随插件卸载关闭（DESIGN「插件卸载关闭全部连接」契约未兑现，热装重载泄漏 EventSource）；② 回填未覆盖「存在水位缺口」的会话（AC-05 spec 原句要求，宿主离线期间经其它入口发生的回合永远无法补齐）；③ DESIGN 子系统条目仍写「与 acks 同 domain、表 turnStats」，与实现（独立 domain `dsh_activity_pane_turns`、表 `turn_stats`）不一致——T-118 差距评估已记录强制理由（dsh-storage-domain 无迁移机制），但同提交未同步 map。
- 目标: 修复三项硬性 finding 并收敛判断性意见（ACK_API_BASE 名不副实、applyBusyState 序列化往返、注入块重复、回填失败无退避逼近轮询边界、e2e 正则重复），保持 R-01-020 全部既有语义不变。
- 非目标: 不改 R-01-020 的记账口径与展示契约；不重构 acks 通道。
- 需求闸口: 审核驱动（缺陷修复短路，map 不变，DESIGN 细节按实现现状同步）。

## 差距评估

- client.mjs：cleanup 只关 acksSource；busy 通道的 visibilitychange/pageshow 为匿名监听，cleanup 无法移除。
- host.mjs：`ensureTurnStatsBackfilled` 对已有记录者直接 return，无水位缺口校验；回填与实时写入存在「回填快照覆盖实时效果」的竞态窗口。
- DESIGN.md：子系统条目与记账不变量的表名/domain 表述滞后于实现。
- 回填失败后逐 sync 周期重试，逼近 check.mjs 自身钉住的「非状态轮询」边界。

## 收敛方案

1. client.mjs：busy SSE 纳入 cleanup（close busySource + 移除具名监听 onBusyVisibilityResume/onBusyPageShow + 清空 busy 记账）；`ACK_API_BASE` 更名 `PANE_API_BASE`（现承载 acks 与 busy 两组路由）；`applyBusyState` 归一化接受 object/string，消除 fetch 路径序列化往返；提取共享 `applyTotalBusy(entry, now)` 消除注入块重复；回填失败 30s 退避。
2. host.mjs：回填扩展为 `ensureTurnStatsFresh`——无记录会话全量重放、已有记录会话仅增量应用 `seq > watermarkSeq` 的事件（补停机缺口）；实时监听对在途回填排队等待写入完成后再应用事件，防覆盖、防缺口丢失。
3. DESIGN.md 同步：独立 domain 与表名、回填双路径语义、30s 退避。
4. 重建 bundle、全量验证、由同一审核方复审后关闭。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-020/AC-04 | 卸载关闭 busy SSE 与监听清理 | UNIT | update | `scripts/check.mjs` EventSource/fetch 契约断言同步 PANE_API_BASE |
| R-01-020/AC-05 | 回填覆盖水位缺口 | UNIT/E2E | update | `scripts/check.mjs#R-01-020/AC-05` 增量重放断言；`e2e/specs/session-lifecycle.mjs::R-01-020/AC-01` |
| DESIGN | 表名/domain 同步实现、回填双路径与 30s 退避语义 | UNIT/E2E | update | 同次变化由本 task 记录：DESIGN.md 三处细节同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：卸载后无残留连接与监听；停机缺口经增量回填补齐 | `scripts/check.mjs#R-01-020/AC-04`、`e2e/specs/session-lifecycle.mjs::R-01-020/AC-05` |
| 异常 | 适用：回填失败 30s 退避不逼近轮询；孤儿/逆序回合跳过 | `scripts/check.mjs#R-01-020/AC-02`、`e2e/specs/session-lifecycle.mjs::R-01-020/AC-06` |
| 边界配置 | 适用：空会话全空落账标记；watermark 幂等 | `scripts/check.mjs#R-01-020/AC-06`、`e2e/specs/session-lifecycle.mjs::R-01-020/AC-06` |
| 副作用 | 适用：acks 通道清理、完成/错误提醒、统计行布局不变 | `e2e/specs/session-lifecycle.mjs::R-01-013/AC-12`、`e2e/specs/completion-sync.mjs::R-01-002/AC-12` |

## 测试计划

- `scripts/check.mjs` 单测（含水位幂等与契约钉子）+ `pnpm verify:fast`。
- `e2e/run.mjs session-lifecycle completion-sync` 验证 SSE 生命周期改动；全量 `pnpm verify`。
- 重建 `.dsh-plugin/client.js` 并随修复提交暂存。
- 由同一审核方复审，通过后在 T-118 与本 task 记录复审结论。

## 终态与证据

状态: completed

- 实现: client.mjs busy SSE 纳入 cleanup（`busySource?.close()` + 移除具名监听 onBusyVisibilityResume/onBusyPageShow + busyById/busyRequestedIds/busyRetryAtById 清空）；ACK_API_BASE 更名 PANE_API_BASE（6 处引用与 check.mjs 契约断言同步）；applyBusyState 归一化接受 object/string 消除序列化往返；提取共享 applyTotalBusy 消除注入块重复；回填失败 30s 退避（busyRetryAtById）。host.mjs 回填演进为 ensureTurnStatsFresh——无记录全量重放、已有记录仅增量应用 `seq > watermarkSeq` 的事件（补停机缺口），写入前重读 current 防回退；实时监听对在途回填排队等待写入完成后再应用事件；空 if 块死代码清理。DESIGN.md 同步独立 domain `dsh_activity_pane_turns`、表名 turn_stats、回填双路径与 30s 退避。`.dsh-plugin/client.js` 随本提交重建。
- 测试: scripts/check.mjs 新增增量重放断言（AC-05 水位缺口补齐、AC-04 幂等）与 fetch/EventSource 契约断言 PANE_API_BASE 同步；e2e session-lifecycle 新增历史卡标题行延续显示锚点（TOTAL_BUSY_RE 共享）。`pnpm verify:fast` 全绿；`pnpm verify` 全量 13 spec 通过（bash-189，exit 0）；收敛残余后复跑 session-lifecycle 通过。
- DESIGN 对照: DESIGN.md 三处同步（关键机制条目独立 domain 与表名、记账不变量结构名 turn_stats、子系统条目「独立 domain dsh_activity_pane_turns 表 turn_stats」+ 回填双路径 + 30s 退避）——消除审核 finding (c)1 的 map-code 不一致，与实现逐句一致。
- commit: 1995f06
- commit: bd1d5c7
- review:
  - 审核方: Standards reviewer `91417982-db55-46e7-bf5c-fbd0f25f603b`；Spec reviewer `41ed45aa-1aa8-4de7-97c7-9b33c09dbd98`（双轴复审，同一审核方）。
  - 目的理解: 兑现 T-118 双轴审核最终报告的三项硬性 finding（busySource 泄漏违反 R-02-003 卸载契约、停机缺口未覆盖 AC-05 原句、DESIGN 表名/domain 滞后）并收敛判断性意见；约束为保持 R-01-020 记账口径与展示契约不变、不引入轮询、不动 acks 契约。
  - 执行方式: `code-review` skill 双轴并行审核 → 修复提交 1995f06 → 双轴各自复审（`git diff 8094b0a...1995f06`）→ 残余收敛本提交。
  - 问题与修复: Standards 3 项硬性（busySource 泄漏、匿名 listener、空 if 块）全部消除；Spec 2 项硬性（停机缺口、DESIGN 未同步）全部消除；判断性意见收敛 5 项（PANE_API_BASE、applyBusyState 归一、applyTotalBusy、30s 退避、TOTAL_BUSY_RE 共享）；复审提出 2 项非阻断残余（cleanup 漏 busyRetryAtById.clear、recentTotal 断言字面量正则）已在本提交顺手收敛。
  - 复审结论: 双轴复审通过——Standards「复审通过，审核循环可终止」（3/3 硬性消除、5/5 收敛）；Spec「1995f06 消除全部 finding，复审通过」（含撤回 (b)1 scope creep 意见）。无新发现，T-119 实现与追溯证据闭合。
