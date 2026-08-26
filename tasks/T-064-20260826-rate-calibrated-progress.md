---
doc-type: task
mutation: lifecycle
id: T-064
---

# T-064 回合进度半衰期按会话实测输出速率校准

状态: completed
关联: R-01-009/AC-06 → 活动状态模型
风险等级: standard

## 背景与目标

C-014 的 y = t/(t+120) 以 80–100 tok/s 模型为隐含基准（半衰期 120s 对应典型回合约 4 分钟）。任务产出 token 量与模型速度无关，回合墙钟时长与速率成反比；当前常用模型降至 20–60 tok/s 后，固定 120s 半衰期使进度 10 分钟内冲到 83%、30 分钟到 94% 并长期停留高段，与实际节奏严重偏离。东家确认采用自适应校准：k = clamp(120×90÷r, 60, 600) 秒（r 为会话实测累计输出速率 tok/s），锚点期间冻结。需求变更走全链：PRD R-01-009/AC-06、DOMAIN「轮内进度」、DESIGN 回合进度条目与 DECISIONS C-025 经东家当次请求确认演进。

## 差距评估

- `src/core.mjs`：`progressOf({ elapsedMs })` 固定半衰期 120；`progressAnchor` 状态机无速率输入。
- `src/client.mjs`：`rateTokS` 已在进度赋值同一循环内由 `sessionStats` 投影算出，但未参与进度计算。
- `scripts/check.mjs`：R-01-009/AC-06 锚点断言固定 120s 半衰期；progressAnchor deepEqual 不含 halfLifeSec 字段。
- `scripts/acceptance.mjs`：AC-06 人工步骤写死「约 2 分钟到达 50%」。

## 收敛方案

- `src/core.mjs`：新增校准常量与 `progressHalfLifeSec({ rateTokS })`（k = clamp(round(120×90÷r), 60, 600)，非法/缺省速率回退默认 120）；`progressOf` 增加 `halfLifeSec` 参数（非法/缺失回退默认 120）；`progressAnchor` 状态对象增加 `halfLifeSec` 字段——idle 转活动时捕获、活动期（含 turn→delegating）保持、锚点归零重计时按最新输入重捕获、idle 清空。
- `src/client.mjs`：`rateTokS` 计算上移至 progressAnchor 调用之前，每帧传入 `progressHalfLifeSec({ rateTokS })`；进度赋值改用 `progressOf({ elapsedMs, halfLifeSec: anchor.halfLifeSec })`。
- `scripts/check.mjs`：AC-06 锚点补校准断言（基准/夹取/非法回退/显式半衰期），progressAnchor deepEqual 同步 halfLifeSec 字段并新增捕获/冻结/重捕获断言，bundle 断言补校准接线存在性。
- `scripts/acceptance.mjs`：AC-06 人工步骤改写为速率校准口径。
- 不新增依赖；其余契约（固定 k 下单调性、委托周期锚点连续性、条纹动画、统计行）不变。

## 测试计划

- 测试先行：`scripts/check.mjs` 锚点先改写（旧实现下必红），实现后 `pnpm build:client && pnpm check` 转绿。
- `python3 tools/agentmap_lint.py --report`：追溯与锚定完整。
- `git diff --check`。
- GUI 现场验收（慢速模型下进度爬升节奏拉长、同回合不倒退、回合切换归零）由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：进度按 y=t/(t+k) 爬升，k 按实测速率校准且锚点期间冻结 | `scripts/check.mjs#R-01-009/AC-06`、`src/core.mjs::progressHalfLifeSec`、`src/core.mjs::progressAnchor`、GUI 现场验收 |
| 异常 | 适用：非法/缺失 elapsedMs 归一为 0；非法/缺失速率回退默认 120s 半衰期；非法/缺失 halfLifeSec 回退默认 | `scripts/check.mjs#R-01-009/AC-06`、`src/core.mjs::progressOf` |
| 边界配置 | 适用：基准 90 tok/s 行为与现状一致（k=120）；夹取 60/600s 上下界；新会话无统计期用默认值；委托周期内 k 冻结、周期外回合切换重校准 | `scripts/check.mjs#R-01-009/AC-06`、`src/core.mjs::progressAnchor` |
| 副作用 | 适用：token/速率统计行（AC-05）、流式条纹（AC-08）、委托周期锚点连续性语义不变；无 progressFloor 复活 | `scripts/check.mjs#R-01-009/AC-06`、`src/client.mjs::render` |

## 终态与证据

- 实现: `src/core.mjs`——新增校准常量（PROGRESS_HALFLIFE_REF_RATE=90、DEFAULT_S=120、MIN_S=60、MAX_S=600）与 `progressHalfLifeSec({ rateTokS })`（k=clamp(round(120×90÷r),60,600)，非法/缺省/非正速率回退默认 120）；`progressOf` 增加 `halfLifeSec` 参数（非法/缺失回退默认 120，默认口径下输出与校准前逐值一致）；`progressAnchor` 状态对象增加 `halfLifeSec` 字段——idle 转活动捕获、活动期（含 turn→delegating、耗尽宽限内 settle 回合）冻结、归零重计时按最新输入重捕获、idle 清空。`src/client.mjs`——`rateTokS` 计算上移至锚点记账之前，每帧传入 `progressHalfLifeSec({ rateTokS })`；进度赋值改用 `progressOf({ elapsedMs, halfLifeSec: anchor.halfLifeSec })`。token 统计行（AC-05）与流式条纹（AC-08）路径未触碰。
- 测试: 测试先行——`scripts/check.mjs` R-01-009/AC-06 锚点先改写（校准函数基准/夹取/非法回退、显式半衰期、progressAnchor 捕获/冻结/继承/重捕获/非法回退、deepEqual 同步 halfLifeSec 字段），改锚点后旧实现下必红（SyntaxError: 无 progressHalfLifeSec 导出）、实现后转绿；bundle 断言补 progressHalfLifeSec 与两处接线字符串存在性；`scripts/acceptance.mjs` AC-06 人工步骤改写为速率校准口径。`pnpm build:client && pnpm check` 全绿；`python3 tools/agentmap_lint.py --report` 通过（21 需求 / 112 AC 全追溯、全锚定）；`git diff --check` 干净；集成前按未发布冲突规则 rebase 至 canonical ea11dfb9ea27492499ced195cfd144d026604da4 并由 T-062 重排为 T-064、C-024 重排为 C-025，重建 bundle 无漂移。GUI 现场验收（基准速率约 2 分钟 50%、慢速模型按比例推迟、同回合不倒退、回合切换归零）由东家按 `scripts/acceptance.mjs` 清单执行。
- DESIGN 对照: 与 DESIGN「回合进度」条目（progressOf 签名、progressHalfLifeSec 校准公式与默认回退、progressAnchor 捕获冻结/重校准、锚点状态机语义）、「富卡辅助」条目及需求追溯索引（R-01-009 → 活动状态模型）逐条一致；PRD R-01-009/AC-06 与 DOMAIN「轮内进度」同口径；决策记录于 C-025，无差异。
- commit: 916daea0c760cea602acf5d95ab84b6c91fe8adb
- review:
  - 审核方: 独立 reviewer 双轴（Standards 子代理 aefeff48、Spec 子代理 970bdaff，code-review skill 流程）
  - 目的理解: 回合进度 y=t/(t+k) 半衰期由固定 120s（80–100 tok/s 隐含基准）改为按会话实测累计输出速率校准 k=clamp(120×90÷r,60,600)s，并随 progressAnchor 生命周期捕获冻结（锚点期间不变保证进度单调、归零重计时重校准），基准 90 tok/s 行为不变；关联 PRD R-01-009/AC-06 新口径、DESIGN 回合进度条目、DECISIONS C-025、C-014 曲线性质与委托周期连续性约束（两轴均在审核前记录目的理解）。
  - 执行方式: `code-review` skill，评审基线 `git diff main...HEAD`（评审时提交 f12f3a2，集成重排后为 916daea0c760cea602acf5d95ab84b6c91fe8adb，内容仅 T-ID/C-ID 与 commit 证据同步），范围含 src/core.mjs、src/client.mjs、scripts/check.mjs、scripts/acceptance.mjs、PRD/DESIGN/DOMAIN/DECISIONS、tasks/T-064 与 .dsh-plugin/client.js 构建产物一致性。
  - 问题与修复: Standards 轴无硬违规，2 项判断性建议——「正有限否则回退默认」归一模式三处轻微重复（形状略异、抽取收益低，经取舍保留）、DESIGN 回合进度条目超长（属原形状就地扩写，保留）；Spec 轴无发现（逐项核对锚点状态机全部转移的冻结语义、bundle 断言逐字一致、非 running 条目接线安全）。无修复项。
  - 复审结论: 双轴均通过、无遗留 finding；无修复故无需复审循环。
