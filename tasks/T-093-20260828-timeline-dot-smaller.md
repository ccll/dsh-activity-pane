---
doc-type: task
id: T-093
mutation: lifecycle
---

# T-093 时间线圆点整体缩小

风险等级: standard
状态: active

## 背景与目标

- 背景: 东家实测活动卡时间线圆点与标题前 7px 状态点看起来一样大；当前 CSS 虽声明 5px 实心核，但 7px 可见 border-box 与外半环使整体轮廓仍不小于标题点。
- 目标: 时间线圆点整体改为实际 5×5px，保持与标题点、竖线同圆心；标题点继续为 7×7px，运行态颜色、光晕与脉冲不变。
- 非目标: 不改时间线行高、文字缩进、竖线位置、状态语义、DOM 或数据层。

## 差距评估

- `PRD.md` 的 R-01-009/AC-09 已要求 5px 视觉圆点，需求无需改写。
- `src/client.mjs` 的 `.dap-trace-item::before` 当前为 7×7px，并通过 1px border 与外侧 box-shadow 形成可见 7～9px 轮廓，未达到与 7px 标题点拉开尺寸层级的效果。
- `DESIGN.md` 与 C-036 固化了 7px 同盒方案，需要以东家本次视觉反馈修订。
- `scripts/check.mjs` 当前反向断言时间线圆点与标题圆点同盒，需改为断言 5px 时间线点、7px 标题点与共同圆心。

## 收敛方案

1. 以 C-061 修订 C-036：时间线点使用实际 5px 原生圆角盒，`left: 1px` 保持圆心 x=3.5；竖线继续 `left: 3px`。
2. 时间线点使用 1px 半透明 border 作为盒内外环，不再为普通节点增加 1px 外扩 box-shadow；running 节点保留蓝色光晕和脉冲。
3. 同步更新 DESIGN、CSS 几何注释、unit/contract 断言与人工验收文案，重建 client bundle。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-009/AC-09 | 既有 5px 视觉圆点实现纠偏 | UNIT/MANUAL | update | 更新 CSS contract 与目视验收，明确时间线点整体小于 7px 标题点且仍同圆心 |
| DESIGN | 以实际 5px 盒修订 7px 同盒实现 | UNIT/MANUAL | update | 更新设计、C-061、CSS contract 与验收步骤 |

## 测试计划

- `pnpm verify:fast`：确认 AgentMap、CSS contract 与 bundle 一致。
- `pnpm verify`：运行完整浏览器 E2E。
- 现有 GUI 刷新后目视确认时间线点明显小于标题点，竖线仍穿过圆心，running 点仍闪烁。
- `git diff --check`。
- 独立 `code-review` 双轴审核并复审 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：时间线点整体 5px、标题点 7px，尺寸层级明显 | `scripts/check.mjs#R-01-009/AC-09`、`scripts/acceptance.mjs#R-01-009/AC-09`、`src/client.mjs::width: 5px; height: 5px;` |
| 异常 | 不适用：纯 CSS 呈现纠偏，无失败路径 | — |
| 边界配置 | 适用：5px 点与 1px 竖线仍共享 x=3.5 圆心，行高与末端几何不变 | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::left: 1px; top: 4px;` |
| 副作用 | 适用：标题点、状态颜色、running 光晕/脉冲、子代理裁切行为不变 | `scripts/check.mjs#R-01-009/AC-09`、`scripts/acceptance.mjs#R-01-009/AC-09`、`src/client.mjs::animation: dap-pulse 1.15s ease-in-out infinite;` |
| 兼容性 | 适用：继续使用原生 `border-radius`，不恢复硬停色 radial-gradient | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::background: #778394; background-clip: padding-box;` |

## 终态与证据

- 实现: 待填写。
- 测试: 待填写。
- DESIGN 对照: 待填写。
- commit: 待填写。
- review: 待填写。
