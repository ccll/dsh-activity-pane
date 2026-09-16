---
doc-type: task
mutation: lifecycle
id: T-141
---

# T-141 阻塞等待会话按进入等待时刻排序：回合结束登记时刻对等待进行中的会话是旧时刻

状态: active
关联: R-01-001/AC-07 → 活动状态模型
风险等级: standard

## 背景与目标

- 背景: 东家报告活动会话进入等待状态后排列位置不正确，docsim 工作区存在一个等待回答问题的会话位置错误。实测（2026-09-16）：docsim `session-0d292a1b` 于 19:22:32 进入 question 等待（第 5 回合，19:19:49 用户指令启动），但排序键 `lastTurnEnd` 停留在 15:07:44（上一回合结束登记时刻）——等待组内被压到末位，晚于 16:52 与 19:16 完成的两个完成提醒会话；正确位置为等待组第 2 位（晚于 url-digger 19:31:32 进入等待的会话）。
- 根因: T-133 的口径「进入状态时刻统一取最近一次回合结束登记时刻（`lastTurnEnd`）」隐含「回合已结束」假设；阻塞等待（提问/审批/计划审查）发生时本回合尚未结束，`lastTurnEnd` 仍是上一回合的旧时刻，对等待进行中的会话该口径失效。
- 定性: 缺陷修复（map 注解同步：PRD AC-07 与 DESIGN 三处把「进入该状态的时刻」窄化为「最近一次回合结束登记时刻」的括号映射在阻塞等待场景错误，意图句不变；东家已确认修复路径）。
- 目标: 阻塞等待中的主会话按进入等待的时刻（宿主回合记账 `openWaitStart`）参与等待组排序；完成提醒/错误提醒口径不变。
- 非目标: 不改宿主侧登记与通道（`turn_stats.openWaitStart` 已存在且经既有 SSE 通道推送）；不处理等待卡呈现与徽标计数（不受排序键影响）。

## 差距评估

- PRD.md R-01-001/AC-07: 括号注解「（最近一次回合结束登记时刻，无该登记时以其宿主列表时间作为进入时刻）」对阻塞等待不成立。
- DESIGN.md: 排序不变量、buildEntries 契约、活动状态模型子系统清单三处同一括号映射；buildEntries 契约签名缺 `archivedIds`。
- src/core.mjs: `buildEntries` 非运行会话排序键统一取 `completions.lastTurnEnd`，无阻塞等待分支。
- src/client.mjs: 已持有 `busyById`（含归一后的 `openWaitStart`），未传入排序。
- scripts/check.mjs: AC-07 混合排序测试把阻塞等待会话排序键锚定为 `lastTurnEnd`（缺陷行为）。

## 收敛方案

1. `buildEntries` 增加末位入参 `waitingStarts`（Map id → 毫秒时刻；非 Map 视为无数据）：pending 会话排序键取该记录，缺失回落宿主列表时间；完成/错误提醒仍取 `lastTurnEnd`，缺失回落宿主列表时间。
2. 不以 `lastTurnEnd` 作为 pending 会话的中间回退——它对等待进行中的会话是语义错误的旧时刻；宿主列表时间（最后用户指令时刻）恒不晚于进入等待时刻，作为回退更接近意图。
3. client 渲染帧由 `busyById` 派生 `waitingStarts` Map 注入；数据在途帧短暂回落宿主列表时间，SSE 广播到达后自愈。
4. PRD/DESIGN 注解同步修正；记一条 DECISIONS（C-078）。

## 测试计划

- `scripts/check.mjs`（UNIT）: 改写 R-01-001/AC-07 混合场景为实测缺陷形态——阻塞等待会话进入等待时刻（9_000）晚于全部完成提醒 `lastTurnEnd`（4_000/3_000）时排等待组前列，其宿主列表时间（3_500）介于两者之间用于区分两条路径；`waitingStarts` 缺失回落宿主列表时间；非 Map 入参视为无数据。
- `pnpm verify:fast` 编辑循环；`pnpm verify` 全量回归。
- `.dsh-plugin/client.js` 随实现重建（`pnpm check` 校验一致）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-001/AC-07 | 修正（阻塞等待进入时刻口径：回合结束登记时刻 → 等待边界开启时刻） | UNIT | update | `scripts/check.mjs` R-01-001/AC-07 混合排序断言改写为实测缺陷形态 |
| DESIGN | 排序不变量 / buildEntries 契约（补 `archivedIds`、新增 `waitingStarts`）/ 活动状态模型子系统清单三处口径修正 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：阻塞等待会话按进入等待时刻正确参与等待组排序 | `scripts/check.mjs#R-01-001/AC-07`、`src/core.mjs::waitingStartTime` |
| 异常 | 适用：waitingStarts 缺失/非法时不抛错并回落宿主列表时间 | `scripts/check.mjs#R-01-001/AC-07`、`src/core.mjs::waitingStartTime` |
| 边界配置 | 适用：非 Map 入参与既有 6 参调用兼容；完成/错误提醒排序不变 | `scripts/check.mjs#waitingStarts 非 Map 视为无数据`、`src/core.mjs::waitingStartTime` |
| 副作用 | 适用：E2E long-list 底卡断言只依赖「存在末卡」与排序键无耦合；等待卡呈现、徽标计数不受影响 | `e2e/specs/long-list.mjs::T-133`、`package.json::verify` |

## 终态与证据

（待填）
