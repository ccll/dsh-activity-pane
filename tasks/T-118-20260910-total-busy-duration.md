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

状态: active

- 实现: （待填写）
- 测试: （待填写）
- DESIGN 对照: （待填写）
- commit: （待填写）
- review: （待填写）
