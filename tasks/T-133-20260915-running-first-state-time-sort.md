---
doc-type: task
mutation: lifecycle
id: T-133
---

# T-133 活动区运行中置顶、等待/完成按进入状态时刻倒序

状态: active
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
| R-01-001/AC-07 | 改写：活动区分组排序（运行中置顶；等待/完成按进入状态时刻倒序） | UNIT | update | `scripts/check.mjs#R-01-001/AC-07`（混合场景：运行中在等待/完成之前；等待/完成组内 lastTurnEnd 倒序；无登记回落宿主列表时间） |
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

（active 期间留空，关闭时填写）
