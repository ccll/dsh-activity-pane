---
doc-type: task
mutation: lifecycle
id: T-147
---

# T-147 等待卡类型胶囊右侧显示进入状态的相对时间（状态年龄）

状态: active
关联: R-01-002/AC-14（新增）→ 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 东家需求——在已完成与等待中的会话的状态胶囊右侧显示该会话进入这个状态起至今的相对时间，形态类似历史卡末行的「最后活动」相对时间（如「5分钟前」）。
- 现状: 等待三类卡（阻塞等待/完成提醒/错误提醒，五类胶囊：待确认/待审查/提问中/已完成/错误）末行只有类型胶囊；R-01-001/AC-07 排序已定义并落地「进入该状态的时刻」（T-141：阻塞等待取宿主登记的等待边界开启时刻 `openWaitStart`，完成/错误提醒取最近一次回合结束登记时刻 `lastTurnEnd`），该时刻已在客户端就绪，仅未显示。
- 东家拍板（2026-09-17）: ①三类等待卡全量显示；②进入时刻不可得时不显示（沿用「不显示虚假耗时」纪律）；③裸相对时间文案、弱化色调、不参与等待脉冲。
- 目标: 等待卡末行胶囊右侧显示状态年龄——阻塞等待取 `waitingStarts`（`openWaitStart`）、完成/错误提醒取 `completions.lastTurnEnd`，分级沿用 `fmtRelativeAge`，随分钟级时钟更新；时刻不可得时隐藏。
- 非目标: 不改宿主侧登记与通道（`openWaitStart`/`lastTurnEnd` 均经既有通道到达）；不给胶囊/正文脉冲语义加新载体（状态年龄静态）；不处理子代理卡（无胶囊行）与紧凑档（末行整体隐藏）。

## 差距评估

- PRD.md: R-01-002 无状态年龄呈现承诺 → 新增 AC-14。
- DOMAIN.md: 缺「进入状态时刻」术语 → 登记。
- DESIGN.md: 条目契约无 `stateAt`；`buildEntries` 契约、等待卡末行结构、`.dap-await-head` 职责、中间档完成提醒卡收合形态、`fmtRelativeAge`/分钟时钟与稳定签名条目均未覆盖 → 同步。
- src/core.mjs: `buildEntries` 排序键 `sortTime` 已分支计算进入时刻但不落在条目上；`cardSignature` 不含该字段。
- src/client.mjs: awaiting 骨架 `.dap-await-head` 仅含胶囊；更新路径不写年龄文本；`syncRecentTimeClock` 仅按历史卡存在性启停；渲染签名仅含历史卡时间文案。
- scripts/check.mjs: 无 `R-01-002/AC-14` 锚点。

## 收敛方案

1. core `buildEntries`: awaiting 条目新增 `stateAt`（毫秒）——pending 取 `waitingStartTime(id)`、完成/错误提醒取 `completions` 记录 `lastTurnEnd`；仅接受有限数字，缺失/非法为 null（不回落宿主列表时间，排序回退仅作用于 `sortTime`）；JSDoc 同步。
2. core `cardSignature`: 增补 `entry.stateAt ?? null` 分量——数据到达/更替（回填、SSE）驱动重绘。
3. client 骨架: `.dap-await-head` 胶囊后追加 `.dap-await-age` 文本段；`migrateAwaitingFoot` 陈旧骨架迁移对齐同形（胶囊入 `.dap-await-head` + 年龄段）。
4. client 更新路径: 胶囊块内就地补建年龄节点（`insertAdjacentElement` 兼容一切陈旧形态），`fmtRelativeAge(Date.now() - stateAt)` 写 `textContent`；时刻不可得或差值为负时隐藏节点。
5. client 时钟与签名: `syncRecentTimeClock` 触发条件扩为「历史卡存在或存在可显示状态年龄的等待卡」；渲染签名新增等待卡状态年龄文案分量，仅文案变化时重绘。
6. CSS: `.dap-await-age` 弱化色调、不进脉冲选择器（与 `.dap-total-time` 弱化惯例一致）。
7. PRD/DOMAIN/DESIGN 同次演进；测试影响表记录。

## 测试计划

- `scripts/check.mjs`（UNIT，锚定 R-01-002/AC-14）: 阻塞等待条目 `stateAt` 取 `waitingStarts` 值；完成提醒条目取 `lastTurnEnd`；错误提醒条目取 `lastTurnEnd`；`waitingStarts`/`lastTurnEnd` 缺失或非法时 `stateAt` 为 null；running/subagent 条目无 `stateAt`；两份仅 `stateAt` 不同的条目序列签名不同。
- e2e（browser，锚定 R-01-002/AC-14）: 完成提醒卡（completion-sync）与错误提醒卡（error-reminder）的 `.dap-await-head` 内出现非空 `.dap-await-age` 且文案匹配相对时间分级（刚刚/分钟前/小时前/天前）。
- `pnpm verify:fast` 编辑循环；`pnpm verify` 全量回归（unit/contract + 18 spec）。
- `.dsh-plugin/client.js` 随实现重建（`pnpm check` 校验工作树一致，pre-commit 校验 staged 一致）。
- 浏览器实测（黄金路径）：热更环境中核对等待卡胶囊右侧相对时间随分钟级更新与不可得时隐藏。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-002/AC-14 | 新增（状态年龄相对时间呈现） | UNIT + browser E2E | add | `scripts/check.mjs#R-01-002/AC-14`、`e2e/specs/completion-sync.mjs#R-01-002/AC-14`、`e2e/specs/error-reminder.mjs#R-01-002/AC-14` |
| DESIGN | 条目契约/`buildEntries` 契约/末行结构/`.dap-await-head` 职责/中间档收合/`fmtRelativeAge` 时钟/稳定签名七处同步 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：三类等待卡胶囊右侧显示进入状态相对时间，分钟级更新 | `scripts/check.mjs#R-01-002/AC-14`、`e2e/specs/completion-sync.mjs#R-01-002/AC-14`、`src/core.mjs::stateAt` |
| 异常 | 适用：`waitingStarts`/`lastTurnEnd` 缺失或非法时 `stateAt` 为 null、节点隐藏，不显示虚假时刻 | `scripts/check.mjs#R-01-002/AC-14`、`e2e/specs/error-reminder.mjs#R-01-002/AC-14`、`src/core.mjs::stateAt` |
| 边界配置 | 适用：负差值（时钟偏差）回落为空不显示；中间档完成提醒卡收合单行时年龄随胶囊保留、紧凑档随末行隐藏 | `src/client.mjs::dap-await-age`、`e2e/specs/compact-density.mjs#R-01-002/AC-14` |
| 副作用 | 适用：`cardSignature` 新增分量仅影响等待卡重绘判定；脉冲队列签名与对相机制不变；排序行为不变（R-01-001/AC-07 断言回归） | `scripts/check.mjs#R-01-001/AC-07`、`package.json::verify` |

## 终态与证据

- 实现:
- 测试:
- DESIGN 对照:
- commit:
- review:
  - 审核方:
  - 目的理解:
  - 执行方式:
  - 问题与修复:
  - 复审结论:
