---
doc-type: task
mutation: lifecycle
id: T-064
---

# T-064 回合进度半衰期按会话实测输出速率校准

状态: active
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

（完成后填写）
