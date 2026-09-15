---
doc-type: task
mutation: lifecycle
id: T-133
---

# T-133 活动区运行中置顶、等待/完成按进入状态时刻倒序

状态: completed
关联: R-01-001/AC-07 → 活动状态模型
风险等级: standard

## 背景与目标

东家在 T-132（按最后用户指令时间倒序）基础上提出二次演进：运行中会话始终置顶；从运行中进入已完成（完成提醒、错误提醒）或等待中（阻塞等待）的会话排在全部运行中会话之后；等待/完成组内按**进入该状态的时刻**倒序，不再按最后一条用户消息时间。东家已确认 PRD/DESIGN 演进与两项口径决策：运行中组内保持最后用户指令时间倒序；进入状态时刻统一取最近一次回合结束登记时刻（`lastTurnEnd`，阻塞等待回合以 blocked 结束亦登记），无登记回落宿主列表时间。

## 差距评估

- `src/core.mjs#buildEntries`：现行单一排序键（`instructionTime`）不区分运行/等待组，与 AC-07 两段式口径不符。
- `scripts/check.mjs`：现 AC-07 用例只覆盖全运行中场景，缺「等待/完成排在运行中之后」与「组内按进入状态时刻倒序」断言。
- `e2e/specs/long-list.mjs`：底卡锚定为 LONG_TITLE（旧口径下最早创建、排最后）；新口径下慢速会话最后完成、排等待/完成组最前，底卡改按 DOM 末卡位置断言（mock 回复同文、卡片标题会撞车，不能用标题解析）。
- 其余 e2e：卡片选择全部按标题文本（`filter({ hasText })`），不依赖位置，无需改动。

## 收敛方案

- `buildEntries` rootIds 排序改为两段式：分组键 = 条目 kind 的组别（`pending` 或非 running 非委托 → 等待/完成组，其余 → 运行中组），运行中组在前；组内时间键——运行中组取 `instructionTime`（宿主列表时间），等待/完成组取 `completionFor(id, completions).lastTurnEnd`（缺失回落 `instructionTime`）——从新到旧；两组相同时间均回落 `ids.indexOf` lineage 稳定序。
- 子代理仍嵌套跟随母会话，不参与排序；`instructionTime` 哨兵（-1 视为最旧）沿用。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 改写：排序不变量与 buildEntries 契约改为运行中置顶 + 等待/完成按进入状态时刻倒序两段式 | UNIT | update | `scripts/check.mjs#R-01-001/AC-07` 断言运行中置顶、等待/完成组内按回合结束登记时刻倒序与回落 |
| R-01-001/AC-07 | 改写：活动区分组排序（运行中置顶；等待/完成按进入状态时刻倒序，无登记以其宿主列表时间作为进入时刻） | UNIT | update | `scripts/check.mjs#R-01-001/AC-07`（混合场景：运行中在等待/完成之前；等待/完成组内 lastTurnEnd 倒序；无登记回落宿主列表时间且可新于他卡登记时刻，区分「回落」与「视为最旧」） |
| R-01-004/AC-01 | 排序口径变化的长列表回归适配：底卡可见性断言由固定标题改为 DOM 末卡位置 | E2E | update | `e2e/specs/long-list.mjs#R-01-004/AC-01`（底卡初始不可见 + 滚动后可见，语义不变） |

## 测试计划

- `pnpm verify:fast` 编辑循环（agentmap lint + test-impact + core 单测与 bundle 契约）。
- `pnpm verify` 全量门禁（含全部浏览器 E2E）。
- 独立 `code-review` skill 双轴审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：运行中会话排在全部等待/完成会话之前；等待/完成组内按进入状态时刻倒序 | `scripts/check.mjs#R-01-001/AC-07`、`src/core.mjs::buildEntries` |
| 异常 | 适用：等待/完成会话无回合结束登记时回落宿主列表时间，不抛错 | `scripts/check.mjs#R-01-001/AC-07`、`src/core.mjs::instructionTime` |
| 边界配置 | 适用：两组相同时间回落宿主列表出现顺序；全运行中场景维持指令时间倒序；子代理仍跟随母会话缩进 | `scripts/check.mjs#R-01-003/AC-01`、`src/core.mjs::buildEntries` |
| 副作用 | 适用：排序变化经既有移动动画平滑过渡，渲染签名与订阅纪律不变 | `e2e/specs/session-lifecycle.mjs#R-01-010/AC-02`、`src/core.mjs::cardSignature` |
| 兼容性 | 适用：历史区排序口径（C-020）、卡片工作区徽标与等待呈现不变 | `e2e/specs/recent-infinite-scroll.mjs#R-01-010/AC-03`、`src/core.mjs::buildRecent` |

## 终态与证据

- 实现: `src/core.mjs#buildEntries` rootIds 排序改两段式——分组键 `isRunningEntry`（`pending` 或非 running 非委托 → 等待/完成组排后，其余运行中组置顶）；组内时间键 `sortTime`：运行中组取 `instructionTime`（宿主列表时间），等待/完成组取 `completionFor(id, completions).lastTurnEnd`（缺失回落宿主列表时间）；两组相同时间均回落 `ids.indexOf` 宿主列表出现顺序。子代理仍嵌套跟随母会话、不参与排序。
- 测试: `pnpm verify` 全量通过——agentmap lint（156 AC 全锚定）+ test-impact（~R-01-001/AC-07）+ core 单测与 client bundle 契约 + 17 个浏览器 E2E spec（含适配后的 long-list）；审核修复后单元检查复跑全绿。
- DESIGN 对照: 排序不变量、产品契约 `buildEntries` 条目、子系统内部结构三处均与实现一致（两段式分组、`lastTurnEnd` 口径、回落语义、lineage 稳定序）；追溯索引 R-01-001 主责子系统不变。
- commit: b85ca95
- commit: dcd43e6
- review:
  - 审核方: Standards reviewer 与 Spec reviewer（code-review skill 并行双轴，基线 `cd05eaa...HEAD`）
  - 目的理解: AC-07 演进后，活动区两段式排序——运行中主会话置顶且组内按最后用户指令时间（宿主列表时间）倒序；等待/完成组（阻塞等待、完成提醒、错误提醒）排其后且组内按进入该状态的时刻（最近一次回合结束登记时刻 `lastTurnEnd`，缺失回落宿主列表时间）倒序；两组平局回落宿主列表出现顺序；子代理不参与排序、始终跟随母会话；历史区口径（C-020）不变。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行审核，基线 `cd05eaa`→`b85ca95`；修复后同审核方基于 `git diff b85ca95...HEAD` 复审。
  - 问题与修复: Spec 轴——PRD AC-07「时刻缺失时视为最旧」与已确认决策/DESIGN「缺失回落宿主列表时间」语义冲突，且用例回落时间恰为最旧无法区分两种语义 → PRD 措辞收敛为「无该登记时以其宿主列表时间作为进入时刻」，sWaitNoRec 回落时间改为全场景最新（10_000）使断言具唯一裁决力（dcd43e6）；Standards 轴两条 judgement call（long-list 底卡可见性与 helpers 判定形状相近、比较器内重复求值）经评估维持现状，处置留痕于 commit 取舍。
  - 复审结论: Spec 轴复审通过——PRD 措辞与决策/DESIGN/实现一致、断言对两种语义具唯一裁决力、无漂移；Standards 轴无硬性违规、判断项均有依据，不阻断关闭。
