---
doc-type: task
mutation: lifecycle
id: T-040
---

# T-040 运行卡进度改由本回合已耗时驱动（有理曲线）

状态: active
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

（完成后填写）
