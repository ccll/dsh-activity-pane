---
doc-type: task
id: T-021
mutation: lifecycle
---

# T-021 历史卡 agent 预览行图标换为机器人

风险等级: standard
状态: active

## 背景与目标

- 背景: 东家验收 T-020 后要求 agent 回复行图标由 sparkle 换为机器人；R-01-013/AC-08 措辞同步演进（东家直接指示，即为 PRD 确认）。
- 目标: 最近卡第四行（最近 agent reply 首行）文本前常驻机器人图标；其余行为（常驻、双段结构、加载语义）不变。
- 非目标: 不改变工作项时间线的 assistant 兜底图标（仍为 sparkle）；不改变用户行人物图标。

## 差距评估

- 现状基线: agent 行图标取 `createSparkleIcon()`；DSH 主网页图标集无现成机器人图标（canonical 图标表已核对）。
- 目标差距: 新增手绘 `createRobotIcon()`（沿用 `createInlineIcon` 16×16 currentColor 风格），agent 行换用；测试与验收文案同步。

## 收敛方案

1. `src/client.mjs`: 新增 `createRobotIcon()`（圆角矩形头 + 天线 + 双眼，stroke/fill 混合 currentColor）；`cardChildren("recent")` agent 行改用之。
2. `scripts/check.mjs`: R-01-013/AC-08 增补 bundle 断言 `createRobotIcon`。
3. `scripts/acceptance.mjs`: 最近卡步骤「sparkle 图标」改「机器人图标」。
4. `pnpm build:client` 同步 `.dsh-plugin/client.js`。

## 测试计划

- `scripts/check.mjs` 增补：R-01-013/AC-08 bundle 断言 agent 行使用 `createRobotIcon`。
- `scripts/acceptance.mjs` 人工步骤：agent 回复行前为机器人图标。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`；`git diff --check`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：agent 行显示机器人图标，其余行不变 | `scripts/check.mjs#R-01-013/AC-08`、`src/client.mjs::cardChildren` |
| 异常 | 适用：图标为内联 SVG，无加载失败路径（与现状一致） | `src/client.mjs::createRobotIcon` |
| 边界配置 | 适用：10px 缩放、深/浅主题 currentColor 继承 | `scripts/acceptance.mjs#R-01-013/AC-08`、`src/client.mjs::createRobotIcon` |
| 副作用 | 适用：时间线 assistant 兜底仍为 sparkle，不受影响 | `scripts/check.mjs#R-01-013/AC-08`、`src/client.mjs::fallbackTraceIcon` |

## 终态与证据

（待填写）
