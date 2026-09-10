---
doc-type: task
mutation: lifecycle
id: T-119
---

# T-119 T-118 双轴审核修复：SSE 卸载、停机缺口与 map 同步

状态: active
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

状态: active

- 实现: （待填写）
- 测试: （待填写）
- DESIGN 对照: （待填写）
- commit: （待填写）
- review: （待填写）
