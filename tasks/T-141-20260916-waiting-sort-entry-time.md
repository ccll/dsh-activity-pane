---
doc-type: task
mutation: lifecycle
id: T-141
---

# T-141 阻塞等待会话按进入等待时刻排序：回合结束登记时刻对等待进行中的会话是旧时刻

状态: completed
关联: R-01-001/AC-07 → 活动状态模型
风险等级: standard

## 背景与目标

- 背景: 东家报告活动会话进入等待状态后排列位置不正确，docsim 工作区存在一个等待回答问题的会话位置错误。实测（2026-09-16）：docsim `session-0d292a1b` 于 19:22:32 进入 question 等待（第 5 回合，19:19:49 用户指令启动），但排序键 `lastTurnEnd` 停留在 15:07:44（上一回合结束登记时刻）——等待组内被压到末位，晚于 16:52 与 19:16 完成的两个完成提醒会话；正确位置为等待组第 2 位（晚于 url-digger 19:31:32 进入等待的会话）。
- 根因: T-133 的口径「进入状态时刻统一取最近一次回合结束登记时刻（`lastTurnEnd`）」隐含「回合已结束」假设；阻塞等待（提问/审批/计划审查）发生时本回合尚未结束，`lastTurnEnd` 仍是上一回合的旧时刻，对等待进行中的会话该口径失效。
- 定性: 缺陷修复为主、map 注解经东家确认同次修正——东家在缺陷调查报告后指示「修复」，R-01-001 需求语义不变，仅把 PRD AC-07 与 DESIGN 三处将「进入该状态的时刻」错误窄化为「最近一次回合结束登记时刻」的括号映射向意图句收敛，并记 DECISIONS C-078。
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

- 实现: `buildEntries` 新增末位入参 `waitingStarts`（Map id → 毫秒时刻；非 Map、缺失记录或值非有限数字均视为无数据）：阻塞等待会话排序键取宿主回合记账 `openWaitStart`，缺失回落宿主列表时间，不以 `lastTurnEnd` 作中间回退；完成/错误提醒维持 `lastTurnEnd`；`src/client.mjs` 渲染帧由既有 `busyById`（R-01-020 通道，零新增持久化）派生 Map 注入；PRD `R-01-001/AC-07` 与 DESIGN（排序不变量 / buildEntries 契约含补记 `archivedIds` / 活动状态模型子系统清单）注解同步，记 DECISIONS C-078。
- 测试: `pnpm verify` 全量通过（unit/contract + 18 个 e2e spec 全绿，实现提交与收口提交各跑一轮）；`scripts/check.mjs` 改写 R-01-001/AC-07 混合排序断言为实测缺陷形态（阻塞等待进入时刻 9_000 晚于完成提醒 4_000/3_000 时排前，宿主列表时间 3_500 介于两者之间区分两条路径），新增 waitingStarts 缺失回落、非 Map 兼容、非法值（null/空串不误判为最旧时刻 0）三条断言。机制验证（一次性，真实数据）：以 HEAD 版与工作区版 `buildEntries` 分别对等待组四会话（acks 表 + 日志实测时刻）排序——修复前 docsim 会话按 15:07:44 排末位，修复后按 19:22:32 排第 2 位，与实测缺陷及预期一致。
- DESIGN 对照: 排序不变量、buildEntries 契约、活动状态模型子系统清单三处口径与实现一致（阻塞等待=openWaitStart、完成/错误提醒=回合结束登记时刻、缺失回落宿主列表时间、两组与平局规则未动）；`e2e/specs/long-list.mjs` 注释同步口径括注；代码位置引用与实现一致。
- commit: 4e2ded9 实现与 map 注解同步
- commit: 1bb0884 双轴审核收口（非法值回落 + 注解收敛）
- review:
  - 审核方: code-review skill（Standards/Spec 双轴并行独立 reviewer 子代理，fixed point = a298a11 对 4e2ded9；复审由同一双轴审核方各自行复核修复 hunks）
  - 目的理解: 修复阻塞等待会话排序键——等待进行中的会话本回合未结束、`lastTurnEnd` 是上一回合旧时刻（docsim 实测 19:22:32 进入提问等待按 15:07:44 排序被压到等待组末位），改取宿主回合记账 `openWaitStart`；PRD AC-07/DESIGN 括号映射同次向意图句收敛；预期行为=阻塞等待按进入等待时刻参与等待组排序、完成/错误提醒口径不变、缺失回落宿主列表时间；验证方式=check.mjs 混合排序断言 + 全量 E2E。
  - 执行方式: code-review skill 双轴评审（Standards 轴对照 AGENTS.md 工程原则 + CONVENTIONS.md + Fowler 基线；Spec 轴对照 T-141 背景与目标/收敛方案/测试计划 + PRD AC-07 修订正文），两轴独立并行后聚合；复审仅复核修复 hunks 与文档收敛。
  - 问题与修复: ①【Spec·低危】`waitingStartTime` 对 Map 值 null/空串经 `Number()` 归一为 0、误判为最旧时刻而非回落（验证矩阵「非法」分支只做一半）→ 收紧为 `typeof === "number" && Number.isFinite`，补非法值回归断言；②【Standards·流程】T-141 定性「缺陷修复（map 注解同步）」与入口甄别「map 本身错转需求变更」标签不清 → 定性改写为「缺陷修复为主、map 注解经东家确认同次修正」并记录东家指示；③【Standards】PRD AC-07 机制词「宿主回合记账」→「宿主登记的」；④【Standards·轻】根因注解三处重复 → core JSDoc 权威、函数内注释精简、client 缩为一行；⑤【Spec·残余】long-list E2E 注释口径漂移 → 补 T-141 括注。全部修复后 `pnpm verify:fast` 复跑通过并由双轴复审通过。
  - 复审结论: 双轴复审通过，无未关闭阻断项。documented waiver：buildEntries 七参数不收拢 options 对象、每帧重建 waitingStarts Map、sortTime 分支不表驱动、DESIGN 长句维持现状密集条目风格（未来重写条目时按规范拆嵌套列表，维护想法级）。残余风险与测试缺口（不阻断）：同回合多次等待边界时 `openWaitStart` 取哪次由宿主既有语义决定（task 非目标，未验证假设）；「数据在途帧回落、SSE 到达自愈」的端到端时序 UNIT 无法覆盖；`client.mjs` busyById→waitingStarts 派生循环无直接单测（两端各有单测、E2E 间接覆盖）。
