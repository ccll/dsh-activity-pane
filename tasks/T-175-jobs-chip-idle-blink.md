---
doc-type: task
mutation: lifecycle
id: T-175
---

# T-175 后台任务数量注回合结束闪烁

状态: active
关联: R-01-023
风险等级: standard

## 背景与目标

东家立项（2026-10-20）：有些活动会话在 LLM 输出完成后会继续等待后台任务，此时会话卡片标题行的「后台 ×N」数量注应闪烁提醒「该会话回合已结束但仍在等后台任务」；若会话仍在等 LLM 输出（自身回合运行中），即使后台任务在跑也不闪烁。属于 UI/UX 改进，走全链：PRD R-01-023 增 AC-11、SOLUTION 同步，均已东家确认（阻塞等待期间裁定为不闪烁）。

范围扩展（2026-10-20 东家补充，实现中裁定）：jobs-only 态同时停止时间线执行中圆点与卡片标题状态点的呼吸闪烁（暂停 R-01-009/AC-09 承诺），使数量注成为卡片唯一运动元素，突出「无 LLM 活动、仅有后台任务活动」；停闪范围与扩展条款均经东家确认。另顺带修复复盘发现的 R-01-020 懒回填竞态缺陷（map 不变，附回归 spec）。

现状与期望差距：数量注（`renderJobsChip`）只承载文本与显隐，无任何回合结束态语义；`selfRunning` 已随条目下发但不入 `cardSignature`，任务在跑期间回合结束/重启不保证触发重绘。

## 差距评估

- PRD：R-01-023 无闪烁门控（缺 AC-11）；范围扩展后缺圆点停闪条款。
- SOLUTION：在跑后台任务活性 bullet、活动卡片集合契约、窗格渲染器内部结构与 R-01-023 追溯行均未承载闪烁门控与圆点停闪。
- 代码：`src/client.mjs` `renderJobsChip` 无闪烁态输出；时间线执行中圆点与标题状态点在 jobs-only 态照常呼吸；`src/core.mjs` `cardSignature` 缺 `selfRunning` 分量。
- 测试：无闪烁判定与浏览器动画断言。

## 收敛方案

1. PRD：R-01-023 增 AC-11，要点：
   - 仅由在跑后台任务支撑运行呈现时，数量注以固定节奏持续闪烁。
   - 自身回合恢复运行、进入阻塞等待或任务全部结束时停止闪烁。
   - 节奏与 AC-09 任务子卡状态点同源同周期。
   - 同状态下暂停 R-01-009/AC-09 圆点闪烁：时间线执行中行圆点与卡片标题状态点静止（东家裁定范围含标题点），状态结束后恢复。
2. SOLUTION：数据流 bullet、活动卡片集合契约（selfRunning 门控闪烁与圆点停闪 + 入渲染签名）、窗格渲染器 jobs-only 门控 bullet、R-01-023 追溯行同步闪烁/停闪语义。
3. `src/core.mjs`：新增纯函数 `jobsChipState(entry)` 单点返回 `{ text, hidden, blinking }`——`blinking` 仅当 `kind === "running"` 且 `selfRunning` 为假且 liveJobs 非空；`cardSignature` 增加 `selfRunning` 签名分量（任务在跑期间回合结束/重启驱动重绘）。
4. `src/client.mjs`：`renderJobsChip` 改用 `jobsChipState`；jobs-only 态写入母卡卡根 `data-jobs-only` 属性（按变化写入，卡根单一门控源）；CSS 以卡根选择器承载数量注 `dap-pulse 1.2s` 闪烁与时间线执行中圆点（`.dap-trace-item[data-status="running"]::before`）、标题状态点（`.dap-dot`）的 `animation: none` 停闪（CSS 动画承载，不引入 JS 周期工作，不触碰 R-01-025/AC-08 低档静默门禁）。
5. 测试：`scripts/check.mjs` 增 `jobsChipState` 判定断言与 bundle 契约断言（含卡根属性与两条停闪 CSS）；`e2e/specs/background-jobs.mjs` 增断言——三态往返（收口闪烁+圆点停闪 / 运行窗停闪+圆点复呼吸 / 再收口复闪+圆点复停）；mock 选路将 runtime 判定提升至 `e2e-job-tick` 守卫之前，使 job 剧本落定后的后续 runtime 消息仍进入确定性慢速运行窗（第二轮运行窗的前提）。

## 测试计划

- unit（scripts/check.mjs）`jobsChipState` 判定，锚 R-01-023/AC-11：
  - job-only 母卡（kind running、selfRunning 假、liveJobs 非空）返回 `blinking: true`。
  - selfRunning 真（自身回合运行）不闪烁；kind awaiting（阻塞等待）不闪烁。
  - liveJobs 空 hidden 且不闪烁；入参形状缺失不抛错。
  - `cardSignature` 含 selfRunning 分量断言。
- E2E（e2e/specs/background-jobs.mjs）：锚定 R-01-023/AC-11——三态往返断言：①回合收口后数量注 `animation-name === "dap-pulse"` 且时间线执行中圆点与标题状态点 `animation-name === "none"`；②追发慢速消息的运行窗内数量注无动画且两类圆点恢复 `dap-pulse`；③回合再次收口后数量注复闪且圆点复停。
- MANUAL：无需（E2E 覆盖真实浏览器黄金路径；阻塞等待分支由 unit 判定承载）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION | 方案层演进：数量注闪烁门控（活性 bullet、活动卡片集合契约、窗格渲染器内部结构、需求追溯索引） | UNIT/E2E | update | `scripts/check.mjs` 新增 jobsChipState 判定与 bundle 契约；`e2e/specs/background-jobs.mjs` 新增 AC-11 三态断言 |
| R-01-023/AC-11 | 新增 | UNIT+E2E | 新增断言 | unit：jobsChipState 五态 + selfRunning 入签名；E2E：收口后闪烁、运行窗停闪、再收口复闪 |
| R-01-023/AC-01 | 不变 | E2E | 保留 | 数量注文本与隐藏语义经 jobsChipState 输出不变 |
| R-01-023/AC-02 | 不变 | E2E | 保留 | 提醒抑制与闪烁门控共用 jobs-only 判定口径，抑制断言复核在前 |
| R-01-023/AC-03、AC-04、AC-05～AC-08 | 不变 | E2E+unit | 保留 | 任务子卡与徽标计数语义不变 |
| R-01-023/AC-09、AC-10 | 不变 | E2E+unit | 保留 | 状态点节奏同源（复用 dap-pulse）与档位门控不变 |
| R-01-025/AC-08 | 不变 | E2E | 保留 | CSS 动画不触发 rAF，低档静默门禁不受影响 |
| R-01-009/AC-09 | 修改（R-01-023/AC-11 态暂停）：jobs-only 态时间线执行中圆点与标题状态点停闪；其余状态承诺不变，运行窗内圆点照常呼吸 | E2E | 保留+新增 | `e2e/specs/background-jobs.mjs#R-01-023/AC-11` 三态往返（运行窗恢复 `dap-pulse` 即 AC-09 正向复核）；`scripts/check.mjs#R-01-023/AC-11` 停闪 CSS 契约；`e2e/specs/session-lifecycle.mjs#R-01-009/AC-09` 运行窗圆点闪烁回归 |
| R-01-020/AC-01、AC-03、AC-05 | 缺陷修复（T-175 E2E 复盘发现，map 不变）：懒回填 GET 响应原经全量应用清除既有 busy 记录——宿主登记滞后于卡片渲染时，陈旧空快照迟到落地使运行卡累计时长在回合中段消失（并诱发下游几何断言 flake） | E2E | 新增回归 | `e2e/specs/busy-backfill-race.mjs` 场景 1 变异验证（旧语义下样本 40 缺席 17）；场景 2 断言 SSE 拒连时 GET 回填仍填充缺失会话；`scripts/check.mjs` bundle 契约断言 applyBusyBackfill + no-store |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：回合已结束仍有在跑后台任务时数量注以 `dap-pulse` 固定节奏持续闪烁，且时间线执行中圆点与标题状态点同门控停闪 | `e2e/specs/background-jobs.mjs#R-01-023/AC-11`、`scripts/check.mjs#R-01-023/AC-11`、`src/client.mjs::renderJobsChip` |
| 异常 | 适用：自身回合运行中、阻塞等待（kind awaiting）与无在跑任务时不得闪烁（门控负向三态） | `scripts/check.mjs#R-01-023/AC-11`、`src/core.mjs::jobsChipState`、`e2e/specs/background-jobs.mjs#R-01-023/AC-11` |
| 边界配置 | 适用：入参形状缺失/非法按无任务处理不抛错；中间/紧凑档数量注承载不受影响 | `scripts/check.mjs#R-01-023/AC-11`、`e2e/specs/background-jobs.mjs#R-01-023/AC-01`、`src/core.mjs::jobsChipState` |
| 副作用 | 适用：闪烁为纯 CSS 动画承载，不引入 JS 周期工作、不破坏低档静默门禁（R-01-025/AC-08） | `e2e/specs/idle-quiescence.mjs#空闲期 rAF`、`e2e/specs/mobile-thermal.mjs#屏外休眠`、`src/client.mjs::data-jobs-only` |
| 兼容性 | 适用：`selfRunning` 入 `cardSignature` 扩大重绘触发面，回归既有签名去重语义 | `scripts/check.mjs#cardSignature`、`src/core.mjs::cardSignature` |

## 自查清单

- 边界：`liveJobs` 为空数组、字段缺失、非数组与非法入参时 `jobsChipState` 全部按无任务处理返回 hidden 且不抛错——`scripts/check.mjs` 五组判定断言覆盖；`kind` 非 `running`（awaiting/recent/骨架卡）不渲染数量注、无闪烁态。
- 异常路径：回合重启（`selfRunning` 翻真）停闪由 check 断言与 e2e 运行窗 calm 相覆盖；任务全部结束（`liveJobs`→0）时 hidden 翻转、卡根 `data-jobs-only` 随渲染同步清除，kind 翻转走骨架整体重建天然丢弃属性；busy 回填竞态的 SSE 拒连降级由 `e2e/specs/busy-backfill-race.mjs` 场景 2 覆盖。
- 回归影响：R-01-009/AC-09 运行窗圆点呼吸由 `e2e/specs/session-lifecycle.mjs` 与三态往返 calm 相双重回归；R-01-025/AC-08 低档静默不受 CSS 动画影响（idle-quiescence、mobile-thermal 回归）；R-01-020 累计时长由 busy-backfill-race 回归；mock 选路提升仅影响 job 历史后接 runtime 消息的测试场景（全量 e2e 复核无他 spec 依赖旧序）。

## 终态与证据

（active 期间留白，关闭时按 standard 档补四行证据与自查清单、轻量 review。）
