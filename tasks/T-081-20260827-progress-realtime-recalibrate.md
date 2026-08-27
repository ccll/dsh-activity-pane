---
doc-type: task
mutation: lifecycle
id: T-081
---

# T-081 回合进度起步保守、每帧按最新实测速率重校准并允许回退（C-044）

状态: completed
关联: R-01-009/AC-06 → 活动状态模型
风险等级: standard

## 背景与目标

C-025 的速率校准在锚点生命周期内冻结 k，且无速率期回退默认 120s（隐含 90 tok/s 乐观基准）——新会话首回合在实测速率出来之前进度按乐观假设快速爬升，慢速校准因冻结要等回合切换才生效，单向进度条前期虚高无法事后修正。东家裁定（C-044）：无速率期按最慢速度 20 tok/s（k=540s）保守起步；此后每次进度更新用最新累计平均 tps 现算 k，进度作为对完成度的实时估计允许随速率回落而回退（放弃「同回合单调不减」承诺）；`progressAnchor` 状态机不再承载半衰期。需求变更走全链：PRD R-01-009/AC-06、DOMAIN「轮内进度」、DESIGN 回合进度条目与 DECISIONS C-044 经东家确认演进。

## 差距评估

- `src/core.mjs`：`PROGRESS_HALFLIFE_DEFAULT_S = 120`（乐观基准、无速率回退）；`progressOf`/`progressHalfLifeSec` 注释承诺冻结/默认 120；`progressAnchor` 状态对象含 `halfLifeSec` 字段并实现捕获冻结/继承/重捕获（约 10 处分支），与 C-044 语义冲突。
- `src/client.mjs`：锚点记账每帧传 `progressHalfLifeSec({ rateTokS })` 入 `progressAnchor`，进度赋值用 `anchor.halfLifeSec`；注释描述冻结语义。
- `scripts/check.mjs`：progressOf 默认/非法回退断言、progressHalfLifeSec 无速率/非法回退断言、progressAnchor 的 5 处 deepEqual（含 halfLifeSec 字段）与冻结/继承/重捕获断言（1573-1595）、bundle 断言（「halfLifeSec: anchor.halfLifeSec」等）均为旧契约。
- `scripts/acceptance.mjs`：AC-06 人工步骤承诺「同回合内进度不回退」。
- map 已先行演进（东家确认）：PRD AC-06、DOMAIN「轮内进度」、DESIGN 回合进度条目、DECISIONS C-044。

## 收敛方案

- `src/core.mjs`：
  - `PROGRESS_HALFLIFE_DEFAULT_S` 120 → 540（无速率保守起步基准，注释注明 20 tok/s 依据）；`progressHalfLifeSec`/`progressOf` 注释同步 C-044 口径（每帧现算、允许回退、回退默认 540）。
  - `progressAnchor` 删除 `halfLifeSec` 入参与状态字段：idle 分支清空、turn 建立/回合切换、delegating 进入/继承/耗尽等全部分支不再带 k；状态对象收敛为 `{ mode, anchor, turnStart, drainedAt }`；函数注释改述「只管锚点记账，不承载半衰期（C-044）」。
- `src/client.mjs`：锚点记账调用不再传 `halfLifeSec`；进度赋值改为每帧现算 `progressOf({ elapsedMs, halfLifeSec: progressHalfLifeSec({ rateTokS }) })`；记账注释改述 C-044 语义。
- 测试先行：`scripts/check.mjs` R-01-009/AC-06 锚点先改写为 C-044 契约失败态（见测试计划），旧实现下必红，实现后转绿。
- `scripts/acceptance.mjs`：AC-06 人工步骤改写为「保守起步、随最新平均速率动态调整、允许小幅回退」口径。

## 测试计划

- 测试先行：`scripts/check.mjs` 锚点改写——progressOf 默认/非法回退断言改 540 口径（120s→18.2%、360s→40%）；新增「同一已耗时下 k 变化直接反映进度（k=120→71.4%、k=540→35.7%，允许回退）」断言；progressHalfLifeSec 无速率/非法回退断言改 540；progressAnchor 5 处 deepEqual 去 `halfLifeSec` 字段、冻结/继承/重捕获断言块删除并改为「锚点状态不承载半衰期」断言；bundle 断言「halfLifeSec: anchor.halfLifeSec」改「!bundle.includes(...)」+「halfLifeSec: progressHalfLifeSec({ rateTokS })」保留（进度赋值接线）。改锚点后旧实现下必红，实现后转绿。
- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 现场验证：新会话首回合启动期进度慢爬（无速率期保守）；速率实测后进度增速随统计行平均速率动态变化；供应商速率回落时进度可小幅回退且条纹动画不中断；回合切换归零重爬正常；委托周期内锚点连续不受影响。
- 独立 `code-review` skill 双轴审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：无速率保守起步 540s、每帧最新速率现算 k、进度随速率上升加快 | `scripts/check.mjs#R-01-009/AC-06`、`src/core.mjs::progressHalfLifeSec`、`src/client.mjs::apply`（进度赋值现算接线） |
| 异常 | 适用：非法/缺失 elapsedMs 归一 0；非法/非正/缺失速率回退保守 540；非法 halfLifeSec 回退 540 | `scripts/check.mjs#R-01-009/AC-06`、`src/core.mjs::progressOf` |
| 边界配置 | 适用：20 tok/s 校准值恰为保守默认 540（起步值可被实测无缝接续）；夹取 60/600s 上下界；委托周期锚点连续与归零重计不受 k 记账删除影响 | `scripts/check.mjs#R-01-009/AC-06`、`src/core.mjs::progressAnchor` |
| 副作用 | 适用：同回合进度单调承诺撤销（可回退）；累加平均平滑速率波动不造成来回摆钟；token 统计行（AC-05）与条纹动画（AC-08）路径未触碰 | `scripts/check.mjs#R-01-009/AC-06`（回退断言）、`scripts/acceptance.mjs#R-01-009/AC-06`、`src/core.mjs::progressHalfLifeSec` |

## 终态与证据

- 实现: `src/core.mjs`——`PROGRESS_HALFLIFE_DEFAULT_S` 120→540（无速率保守起步，注释注明东家实测最低速率 20 tok/s 依据），公式分子解耦为 `PROGRESS_HALFLIFE_BASE_S = 120`（90 tok/s→120s 校准行为不变）；`progressHalfLifeSec`/`progressOf` 注释改 C-044 口径（每帧现算、允许回退、回退 540）；`progressAnchor` 删除 `halfLifeSec` 入参与状态字段，三态转移/委托宽限/归零语义不变，状态收敛为 `{ mode, anchor, turnStart, drainedAt }`。`src/client.mjs`——锚点记账不再传 `halfLifeSec`；进度赋值每帧现算 `progressOf({ elapsedMs, halfLifeSec: progressHalfLifeSec({ rateTokS }) })`（`rateTokS` 保持 decodeTokens/decodeMs 累计口径）；记账注释改述 C-044。`scripts/acceptance.mjs`——AC-06 人工步骤改写（540 起步约 2 分钟 18%/6 分钟 40%、随平均速率动态调整、允许小幅回退、条纹不中断）。map 同批演进：PRD R-01-009/AC-06、DOMAIN「轮内进度」、DESIGN「回合进度」条目、DECISIONS C-044。
- 测试: 测试先行——`scripts/check.mjs` R-01-009/AC-06 锚点先改写为 C-044 契约（无速率默认 540 口径：120s→18.2%、360s→40%；新增允许回退断言：300s k120→71.4% > k540→35.7%；progressHalfLifeSec 无速率/非法回退 540；progressAnchor 5 处 deepEqual 去 halfLifeSec 字段、冻结/继承/重捕获断言块删除、语义并入 anchorTurnA 全形状 deepEqual；bundle 断言改「halfLifeSec: progressHalfLifeSec({ rateTokS })」存在 +「halfLifeSec: anchor.halfLifeSec」不存在），旧实现下必红（50 !== 18.2），实现后转绿。`pnpm build:client && pnpm check` 全绿（128 AC 全锚定）；`python3 tools/agentmap_lint.py --report` 通过（22 需求 / 128 AC 全追溯、全锚定）；`git diff --check` 干净。GUI 现场验收（保守起步、速率跟随、允许小幅回退、回合切换归零、委托周期连续）由东家按 `scripts/acceptance.mjs` 清单执行。
- DESIGN 对照: 与 DESIGN「回合进度」条目（progressOf 签名、progressHalfLifeSec 公式与保守默认、progressAnchor 只记账锚点不承载半衰期、锚点状态机语义）、需求追溯索引（R-01-009 → 活动状态模型）逐条一致；PRD R-01-009/AC-06 与 DOMAIN「轮内进度」同口径；决策记录于 C-044，无差异。
- commit: b1ff457
- review:
  - 审核方: 独立 code-review 双轴 sub-agent（Standards 轴 / Spec 轴）
  - 目的理解: 回合进度从「锚点期间 k 冻结 + 无速率乐观默认 120s」改为「无速率保守起步 540s（20 tok/s）+ 每帧按最新累计平均速率现算 k、允许随速率回落而回退」——单向进度条前期虚高无法事后修正，而实时重估（含向下修正）是更诚实的估计语义；关联 PRD R-01-009/AC-06 演进文本、DOMAIN「轮内进度」、DESIGN 回合进度条目、DECISIONS C-044，以及不动 AC-05 统计行 / AC-08 条纹 / 委托周期锚点语义的边界（两轴审核前均记录目的理解）。
  - 执行方式: `code-review` skill 双轴并行，评审基线与范围 = 工作区相对 HEAD（4c6b554）的 diff + 新增 task 文件
  - 问题与修复: Standards 轴——①DECISIONS C-044「夹取下界 600 对应 15 tok/s」硬性小错：600 是夹取上界且对应 18 tok/s → 修复为「夹取上限 600 对应 18 tok/s 及更低速率」，两轴独立验算（10800÷600=18）确认；②check.mjs 两处 deepEqual 字面重复（启发式 Duplicated Code）→ 删除重复块，语义并入 anchorTurnA 全形状 deepEqual（覆盖等价）。Spec 轴——唯一 finding 即①的同源文档措辞/数值问题，随①修复闭环；实现正确性逐项核对（公式分子 120 保持、回退 540、无 halfLifeSec 残留、每帧现算接线、断言逐值一致、无范围蔓延）无其余发现。
  - 复审结论: Standards 轴与 Spec 轴均复审通过，无遗留问题。