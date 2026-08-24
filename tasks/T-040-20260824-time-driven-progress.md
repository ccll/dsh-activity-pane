---
doc-type: task
mutation: lifecycle
id: T-040
---

# T-040 运行卡进度改由本回合已耗时驱动（有理曲线）

状态: completed
关联: R-01-009 → 活动状态模型
风险等级: standard

## 背景与目标

运行卡进度原由「阶段 + 输出 token 累计」估计（C-005），但 `tokenUsage` 投影只在 usage 事件到达时批量落地，流式进行中 token 冻结、step 结束一次性入账，进度呈 10% 级跳变。东家裁定改由当前轮次耗费的时间驱动，曲线选定为有理曲线 y = t/(t+120)（t 为本回合已耗秒数，半衰期 120s）：过原点、先快后慢、渐近 100% 永不到达。PRD R-01-009/AC-06 已经东家确认改写；DESIGN 活动状态模型同步演进；决策记录于 C-014。token 计数与速率显示（R-01-009/AC-05）与流式条纹动画（AC-08）不在本次范围内。

## 差距评估

- `src/core.mjs`：`progressOf({ phase, outputTokens, elapsedMs })` 为阶段权重 + token 饱和曲线（tool 返回 null 冻结）；`PROGRESS_THINK_BASE` 思考基线常量。
- `src/client.mjs`：`progressFloor` Map（行 813 附近）按回合叠加单调下限；渲染层按 `live.turn` 做 token 基线差分（`tokensBase`/`turnTokens`）、tool 冻结沿用下限、首观测 tool 以思考基线兜底（行 2197–2235）；`entry.progress ?? PROGRESS_THINK_BASE` 兜底（行 1698）。
- `scripts/check.mjs`：R-01-009/AC-06 锚点断言旧阶段曲线（流式起始 10%、think 爬升封顶 10、tool 返回 null、token 上界 90）。
- `scripts/acceptance.mjs`：可能含旧进度语义的人工验收步骤，需核查同步。

## 收敛方案

- `src/core.mjs`：`progressOf` 改为 `progressOf({ elapsedMs })`，返回 `100·t/(t+120)`（t 为已耗秒，保留 0.1 精度取整），非法输入归一为 0；删除 `PROGRESS_THINK_BASE` 常量。
- `src/client.mjs`：删除 `progressFloor` Map 及其清理逻辑、按回合 token 基线差分与 tool 冻结/兜底分支；`entry.progress` 直接由 `progressOf({ elapsedMs })` 赋值（`elapsedMs` 已由 `live.startTime` 回合起点算出，回合切换自然归零）；百分比文本兜底改为 0。token 统计（`runtimeStats` 底行）保留不动。
- `scripts/check.mjs`：R-01-009/AC-06 锚点改写为时间曲线断言：t=0→0、t=120s→50、t→∞ 渐近 100 不到达、单调不减、非法输入兜底 0。
- `scripts/acceptance.mjs`：如有旧进度语义步骤则同步为时间曲线口径。
- 不新增依赖；其余契约不变。

## 测试计划

- `pnpm build:client && pnpm check`：纯函数断言 + bundle 契约。
- `python3 tools/agentmap_lint.py --report`：追溯与锚定完整。
- `git diff --check`：空白检查。
- GUI 现场验收（进度条随时间平滑爬升、无 10% 级跳变、回合切换归零）由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：进度随本回合已耗时按 y=t/(t+120) 平滑爬升 | `scripts/check.mjs#R-01-009/AC-06`、`src/core.mjs::progressOf`、GUI 现场验收 |
| 异常 | 适用：非法/缺失 elapsedMs（NaN、负数）归一为 0，不污染显示 | `scripts/check.mjs#R-01-009/AC-06`、`src/core.mjs::progressOf` |
| 边界配置 | 适用：t=0 显示 0%；t=120s 显示 50%；长回合渐近 100% 永不到达；回合切换由 turnTimings 新起点自然归零 | `scripts/check.mjs#R-01-009/AC-06`、`src/client.mjs::livenessFromSnapshot` |
| 副作用 | 适用：token 计数与速率底行（AC-05）、流式条纹动画（AC-08）不受影响；bundle 无 PROGRESS_THINK_BASE / progressFloor 残留 | `scripts/check.mjs#R-01-009/AC-05`、`src/client.mjs::livenessFromSnapshot` |

## 终态与证据

- 实现: `src/core.mjs`——`progressOf` 改为 `progressOf({ elapsedMs })`，纯时间映射 `100·t/(t+120)`（0.1 精度取整，非法输入归一为 0），删除 `PROGRESS_THINK_BASE`；`src/client.mjs`——删除 `progressFloor` Map 及其清理、按回合 token 基线差分、tool 冻结与思考基线兜底（净删约 30 行），`entry.progress = progressOf({ elapsedMs })` 单点赋值，百分比文本兜底改 0；复审修复追加删除 `livenessFromSnapshot` 死字段 `turn`（遍历改 `timings.values()`）。token 统计底行（AC-05）与流式条纹（AC-08）路径未触碰。
- 测试: 测试先行——`scripts/check.mjs` R-01-009/AC-06 锚点先改写（过原点 0、120s→50、360s→75、86400s<100、单调递增、NaN/负数/缺省归 0），改锚点后旧实现下必红、实现后转绿；复审后新增 bundle 残留反向断言（无 `PROGRESS_THINK_BASE`/`progressFloor`）；`scripts/acceptance.mjs` AC-06 人工步骤同步为时间曲线口径。`pnpm build:client && pnpm check` 全绿；`python3 tools/agentmap_lint.py --report` 通过（19 需求 / 84 AC 全追溯、全锚定）；`git diff --check` 干净。GUI 现场验收（进度随时间平滑爬升、约 2 分钟到 50%、回合切换归零）由东家按 `scripts/acceptance.mjs` 清单执行。
- DESIGN 对照: 与 DESIGN「活动状态模型 → 回合进度」条目（`progressOf({ elapsedMs })` 按 y = t/(t+120) 映射、不区分阶段、无单调下限、turnTimings 新起点归零、条纹动画不变）及需求追溯索引（R-01-009 → 活动状态模型 → src/core.mjs、src/client.mjs）逐条一致，无差异。
- commit: 82f1b18
- commit: a18d244
- review:
  - 审核方: 独立 reviewer 双轴（Standards 子代理 2d595d03、Spec 子代理 e51f693b，code-review skill 流程）
  - 目的理解: 运行卡进度由「阶段 + token 累计饱和曲线」改为本回合已耗时按 y=t/(t+120) 驱动，消除 tokenUsage 投影批量落地的 10% 级跳变；关联 PRD R-01-009/AC-06 新口径、DESIGN 回合进度条目、DECISIONS C-014；AC-05/AC-08 不在范围且不得波及；预期验证为 `pnpm build:client && pnpm check` 与 agentmap lint（两轴均在审核前记录目的理解）。
  - 执行方式: `code-review` skill，评审基线 `git diff dfa46ac...HEAD`（提交 82f1b18），范围含 src/core.mjs、src/client.mjs、scripts/check.mjs、scripts/acceptance.mjs、PRD/DESIGN/DECISIONS、tasks/T-040 与 .dsh-plugin/client.js 构建产物一致性。
  - 问题与修复: Standards 轴 1 项判断性建议——`livenessFromSnapshot` 返回的 `turn` 字段随 progressFloor 删除后成死字段（已修：删除字段及计算，遍历改 `timings.values()`；另 1 项 PRD 内嵌公式提示，可辩护保留）；Spec 轴 1 项轻微证据缺口——「bundle 无残留」缺可执行断言（已修：check.mjs 新增 `PROGRESS_THINK_BASE`/`progressFloor` 残留反向断言）；另有 1 条非阻断边界注记（0.1 精度取整使 t≥约 66.6 小时显示 100.0，取舍已被 spec 覆盖，不处理）。
  - 复审结论: 修复提交 a18d244 经同一双轴 reviewer 复审，Standards 轴与 Spec 轴均通过、无遗留 finding。
