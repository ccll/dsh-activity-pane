---
doc-type: task
id: T-021
mutation: lifecycle
---

# T-021 历史卡 agent 预览行图标换为机器人

风险等级: standard
状态: completed

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

- 实现: `src/client.mjs`：新增手绘 `createRobotIcon()`（`createInlineIcon` 16×16，圆角矩形头 stroke + 天线 + 双眼 fill，均 currentColor）；`cardChildren("recent")` agent 行由 `createSparkleIcon()` 改用 `createRobotIcon()`；timeline assistant 兜底与用户行人物图标不变。
- 测试: `pnpm build:client && pnpm check` 通过（AC-08 断言经审核强化为调用点级 `agentIcon.append(createRobotIcon())`；新增 R-01-012/AC-03 锚定的 sparkle 兜底副作用守卫断言）；`scripts/acceptance.mjs` 最近卡步骤改为「机器人图标」；`python3 tools/agentmap_lint.py --report` 通过（18 需求 / 63 AC / 锚定 63）；`git diff --check` 通过。
- DESIGN 对照: PRD AC-08 措辞「sparkle 图标」演进为「机器人图标作为 agent 角色标识」；DESIGN 产品契约与窗格渲染器双段结构条目同步（用户行图标保留与时间线用户语义一致的限定，agent 行不再引用 assistant 语义），与实现一致。
- commit: 3ab9920
- commit: 6d72d21
- review:
  - 审核方: 独立 `code-review` Standards 子代理；独立 `code-review` Spec 子代理。
  - 目的理解: T-021 为 R-01-013/AC-08 的需求变更：最近卡 agent 回复行角色图标由 sparkle 换为机器人（东家直接指示）；timeline assistant 兜底仍为 sparkle、用户行人物图标与 T-020 双段/常驻/加载语义均不变。
  - 执行方式: `code-review` skill；评审基线 `c0dd210`，范围 `git diff c0dd210...HEAD`（3ab9920 实现、6d72d21 断言强化），Standards/Spec 两轴独立并行审核，修复后由同一审核方复审一轮关闭。
  - 问题与修复: Spec 轴 2 项 (a) 类 finding（AC-08 断言只查函数名存在 → 强化为调用点级断言；「副作用」行 sparkle 兜底无测试锚点 → 新增 R-01-012/AC-03 守卫断言），均修复并经复审关闭；Standards 轴无硬违例，2 项判断题（实现名断言、图标坐标字面量）落仓库既有惯例不修复（其中实现名断言已被调用点级强化正面消除）。
  - 复审结论: Spec 复审两项 finding 关闭、无新偏差；Standards 补充复核无违例、维持无阻塞；两轴最终通过。
