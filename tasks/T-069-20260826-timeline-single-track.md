---
doc-type: task
mutation: lifecycle
id: T-069
---

# T-069 时间线竖线改容器级整条绘制，消除分段叠加亮带

状态: active
关联: R-01-009/AC-09 / 窗格渲染器
风险等级: standard

> 编号沿革：本任务在并行 worktree 中以 provisional T-062 开发（与 rate-calibrated-progress
> 的 provisional T-062 撞号）；集成时主干已先行占号至 T-068，本分支 commits 未被任何
> remote-tracking ref 包含，按未发布冲突规则重排为 T-069（纯编号迁移，证据与语义不变）。

## 背景与目标

东家实机观察：活动会话卡片时间线每个圆点上方有一小段竖线亮度偏高，疑似两段半透明线叠加。查证属实——`.dap-trace-item::after` 每项自绘一段 1px 半透明竖线（`rgba(126,147,177,.3)`），`top: 0; bottom: -8px` 向下探出本项 8px；行高 14px + 间距 3px = 17px 步进，上一段终点落入下一项盒内 5px（容器坐标 17–22px，恰跨下一颗圆点顶缘，圆点顶 20px），两段 alpha .3 叠加成亮带。子代理 `.dap-subtrace` 同病（同一批类名）。目标：竖线亮度全程均匀，无分段叠加；呈现语义不变（竖线穿过首点向上引出、终点没入最末圆点、圆点盖线、单项不画线）。缺陷修复走短路：map 不变，附回归断言。

## 差距评估

- `src/client.mjs`：`.dap-trace-item::after`（`left: 3px; top: 0; bottom: -8px`）+ `:last-child::after { content: none; }` + 浅色块 `.dap-trace-item::after` 覆盖，三处均为逐项分段机制。
- 修复参照已有先例：层级连接线 `.dap-conn-track`（T-033）——一条连续竖轨单元素整体绘制、零拼接接缝。时间线几何固定（行恒 14px、gap 3px），无需 JS 测量，容器 `::before` 纯 CSS 即可整条绘制：`.dap-trace` 高 n×14+(n−1)×3，最末圆心距容器底 7.5px，线 `left: 3px; top: 0; bottom: 7px` 终点没入最末圆点实心核内。
- `scripts/check.mjs` 回归锚点钉死旧机制（`.dap-trace-item:last-child::after`、`left: 3px; top: 0; bottom: -8px`），需改写为新契约。
- DESIGN 既有描述（竖线穿过首点向上引出、终点没入最末圆点）修复后仍成立，不动 map。

## 收敛方案

- `src/client.mjs`：删除逐项 `::after` 两条规则与浅色覆盖；`.dap-trace`/`.dap-subtrace` 加 `position: relative`，容器 `::before` 单元素整条竖线（`left: 3px; top: 0; bottom: 7px; width: 1px`，深浅主题各自配色不变）；`:has(> :only-child)` 时 `content: none`（沿用原单项不画线语义，含加载行）；圆点 z-index 1 盖线关系不变；相关注释改写。
- `scripts/check.mjs`：时间线几何锚点改写——断言容器级整条竖线进入 bundle、逐项 `::after` 与 `bottom: -8px` 拼接几何不再存在、单项不画线保留。

## 测试计划

- `scripts/check.mjs`：R-01-009/AC-09 呈现锚点改写（新契约 + 旧拼接几何缺席断言）。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：竖线为容器级单一元素，无分段叠加，亮度全程均匀 | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::CSS` |
| 异常 | 不适用：纯 CSS 呈现修复，无数据/失败路径 | — |
| 边界配置 | 适用：单项时间线（含加载行）不画线；浅色主题线色覆盖同步迁移到容器级规则 | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::CSS` |
| 副作用 | 适用：圆点同盒几何、状态脉冲、用户行下划线、文字轨道 14px 内缩均不变 | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::CSS` |

## 终态与证据

（关闭时填写）
