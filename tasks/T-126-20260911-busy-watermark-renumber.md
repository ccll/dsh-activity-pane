---
doc-type: task
mutation: lifecycle
id: T-126
---

# T-126 会话卡耗时矛盾：busy 水位重编实时自愈 + 最近回合耗时统一 busy 口径

状态: active
关联: R-01-020 → 回合统计宿主侧；R-01-009 → 活动状态模型
风险等级: standard

## 背景与目标

- 背景: 东家报告部分会话卡片「总耗时 < 当前轮次耗时」。实证两例：① `(ml-1) ops` 的 `修改pi-web的CORS设置`（`session-7bf82f28`）——记账正确（busyMs 196935 = 墙钟 440519 − 回合内 4 次 `ask_user_question` 等待 243584），矛盾源于等待卡/最近卡的「最近回合耗时」取原生回合起止差值（墙钟口径，PRD R-01-009/AC-12 原文），与标题行总耗时（R-01-020 busy 口径，扣除回合内等待）同卡并排显矛盾；② docsim 的 `排查Docsim样本保存偶发失败`（`session-5985fc77`）——记账永久冻结：持久化 `watermarkSeq=11607`（V3 迁移前旧 seq 空间，实测旧格式日志最大 seq=11607），V3 重编后日志 maxSeq=1003，实时登记水位守卫把后续全部边界事件永久跳过；而自愈路径全部不可达——启动扫描只扫 `openTurnStart` 非空的记录（该记录为 null）、client 懒回填只请求 SSE 全量快照中不存在的 id（该 id 早已在快照里）、重放自愈守卫（水位超前检测）因此永不触发。持久化 busyMs=87717 对比全量重放正确值 2366071，缺记 5 个回合。
- 定性: 复合变更（东家确认）：① 缺陷修复——seq 空间重编后实时登记永久卡死，且「水位超前」自愈仅覆盖重编后日志 seq 未超越旧水位的情形（部分重叠重编不可达）；② 需求变更（东家拍板方向 B）——等待卡/最近卡的最近回合耗时从墙钟口径改为 busy 口径（扣除回合内阻塞等待），与 R-01-020 累计口径统一，消除「总 < 本轮」的同卡矛盾。
- 目标: ① 任意 seq 空间重编下 busy 记账可在实时登记或宿主启动时自愈，存量脏记录无需手工修数据；② 等待卡/最近卡最近回合耗时与总耗时同口径，恒不大于累计值。
- 非目标: 不改变运行卡墙钟 elapsed 与委托周期锚点语义（R-01-009/AC-05、AC-06 进度语义）；不改变 busy 通道契约形态；不引入轮询或写回路径。

## 差距评估

- core.mjs: 记账状态无 `watermarkTime`，水位重编在实时路径不可检测；`lastTurnDuration` 依赖 `turnTimings`（V3 快照已移除）与 history 墙钟起止差值，无 busy 口径派生。
- host.mjs: 实时登记对 `seq ≤ watermarkSeq` 事件无条件跳过，无重编检测；启动扫描只处理 `openTurnStart` 非空的记录，存量脏记录（openTurnStart 为 null）永不复核。
- client.mjs: `memoTurnDuration` 与最近卡耗时取自 `turnTimings`/history 墙钟差值。
- PRD/DESIGN: R-01-009/AC-12 原文「取该回合完整起止时刻的差值」为墙钟口径，与 R-01-020 同卡冲突（需求层缺口，已过东家闸口）；DESIGN 回合统计记账条目缺 `watermarkTime` 与重编检测描述。

## 收敛方案

1. core.mjs: `emptyTurnStats`/`turnStatsFrom`/`turnStatsEqual`/`reconcileTurnStats` 增加 `watermarkTime`（水位推进处已覆盖事件的时刻）；`reconcileTurnStats` 增加 `forceFresh` 选项——丢弃已有记账从空状态全量重放（覆盖部分重叠重编）。
2. host.mjs: 实时登记水位守卫加重编检测——`seq ≤ watermarkSeq` 且（`event.time > watermarkTime` 或记录无 `watermarkTime`）时强制全量重放（重放后本事件仍未覆盖则落回正常增量路径）；在途回填不得吞掉 `forceFresh`（命中时在其完成后补一次强制重放）；`turn_stats` 持久化 `watermarkTime`；启动扫描对无 `watermarkTime` 的存量记录强制全量重放复核一次（无论重编后日志 seq 是否已超越旧水位都能收敛，重写后不再重复扫描）。
3. core.mjs: 新增 `lastTurnBusyFromEvents(events)`（重放回合/等待边界事件，取最近已结束回合的运行段时长），`lastTurnDuration({ history })` 改为 busy 口径；移除 `turnTimings` 耗时来源（V3 快照已不携带）。
4. client.mjs: `memoTurnDuration` 与最近卡耗时改走 busy 口径（仅 history 输入，memo 键去掉快照引用）。
5. PRD/DESIGN: R-01-009/AC-12 改写为 busy 口径；DESIGN 回合统计记账与 `#lastTurnDuration` 条目同步。

## 测试计划

- `scripts/check.mjs`（UNIT）: `reconcileTurnStats` watermarkTime 记录、forceFresh 全量重放（部分重叠重编）断言；`lastTurnBusyFromEvents` busy 口径（无等待/提问等待/审批等待/等待尾部强制结算/逆序/起点缺失/孤立 end 错配）断言。
- `pnpm verify:fast` 编辑循环；`pnpm verify` 全量回归（含 `e2e/specs/auto-update.mjs` 既有 R-01-009/AC-12 等待卡耗时断言）。
- `.dsh-plugin/client.js` 随实现重建（`pnpm check` 校验一致）。
- 实证回归：部署后宿主重启（host.mjs 变更需重启），docsim 脏记录经启动扫描全量重放收敛到全会话口径（busyMs 87717 → 全量重放值）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-009/AC-12 | 修改（墙钟口径 → busy 口径） | UNIT | update | `scripts/check.mjs` lastTurnBusyFromEvents 断言组重写 |
| R-01-009/AC-12 | 不变（等待卡耗时展示形态） | E2E | none | 断言仅校验人性化短格式与统计行位置，口径变化不影响断言成立 |
| R-01-020/AC-04 | 增强（重编检测 + 存量复核） | UNIT | update | `scripts/check.mjs` watermarkTime 记录与 forceFresh 全量重放断言 |
| DESIGN | 记账字段与耗时派生口径 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：等待卡/最近卡显示最近回合 busy 耗时且 ≤ 总耗时 | `scripts/check.mjs#R-01-009/AC-12`、`e2e/specs/auto-update.mjs::R-01-009/AC-12` |
| 异常 | 适用：seq 空间重编（全量/部分重叠）实时与启动双路径自愈 | `scripts/check.mjs#R-01-020/AC-04`、`src/host.mjs::watermarkTime` |
| 边界配置 | 适用：逆序/缺失起止、整段等待回合、孤立 end 错配不生成虚假耗时 | `scripts/check.mjs#R-01-009/AC-12`、`src/core.mjs::lastTurnBusyFromEvents` |
| 副作用 | 适用：busy 通道契约不变、不新增轮询/写回；`turn_stats` 新增可选字段向后兼容 | `scripts/check.mjs#R-01-020/AC-05`、`src/host.mjs::busySnapshot` |

## 终态与证据

- 实现: （待实现完成后填写）
- 测试: （待实现完成后填写）
- DESIGN 对照: （待实现完成后填写）
- commit: （待提交后填写）
- review: （待独立代码审核后填写）
