---
doc-type: task
id: T-093
mutation: lifecycle
---

# T-093 时间线圆点整体缩小

风险等级: standard
状态: completed

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
| R-01-009/AC-09 | 既有 5px 视觉圆点实现纠偏 | UNIT/E2E/MANUAL | update | 更新 CSS contract、浏览器 computed style/几何断言与目视验收，明确时间线点整体小于 7px 标题点、仍同圆心且 running 动效不变 |
| DESIGN | 以实际 5px 盒修订 7px 同盒实现 | UNIT/E2E/MANUAL | update | 更新设计、C-061、CSS contract、浏览器行为断言与验收步骤 |

## 测试计划

- `pnpm verify:fast`：确认 AgentMap、CSS contract 与 bundle 一致。
- `pnpm verify`：运行完整浏览器 E2E。
- 现有 GUI 刷新后目视确认时间线点明显小于标题点，竖线仍穿过圆心，running 点仍闪烁。
- `git diff --check`。
- 独立 `code-review` 双轴审核并复审 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：时间线点整体 5px、标题点 7px，尺寸层级明显 | `e2e/specs/session-lifecycle.mjs#R-01-009/AC-09`、`scripts/check.mjs#R-01-009/AC-09`、`scripts/acceptance.mjs#R-01-009/AC-09`、`src/client.mjs::width: 5px; height: 5px;` |
| 异常 | 不适用：纯 CSS 呈现纠偏，无失败路径 | — |
| 边界配置 | 适用：5px 点与 1px 竖线仍共享 x=3.5 圆心，行高与末端几何不变 | `e2e/specs/session-lifecycle.mjs#R-01-009/AC-09`、`scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::left: 1px; top: 4px;` |
| 副作用 | 适用：标题点、状态颜色、running 光晕/脉冲、子代理裁切行为不变 | `e2e/specs/session-lifecycle.mjs#R-01-009/AC-09`、`scripts/check.mjs#R-01-009/AC-09`、`scripts/acceptance.mjs#R-01-009/AC-09`、`src/client.mjs::animation: dap-pulse 1.15s ease-in-out infinite;` |
| 兼容性 | 适用：继续使用原生 `border-radius`，不恢复硬停色 radial-gradient | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::background: #778394; background-clip: padding-box;` |

## 终态与证据

- 实现: `src/client.mjs` 将时间线节点改为实际 5×5px（`left: 1px; top: 4px`），与 7px 标题点及 `left: 3px` 的 1px 竖线共享 x=3.5 圆心；普通节点删除外扩 box-shadow，running 节点保留蓝色光晕与 `dap-pulse`；`.dsh-plugin/client.js` 已重建。`DESIGN.md` 与 C-061 同步修订 C-036 的 7px 同盒方案。
- 测试: 测试先行将 `scripts/check.mjs` 改为 5px/7px 契约，旧实现下以「时间线圆点为实际 5px」断言失败，实施后转绿；独立审核后在 `e2e/specs/session-lifecycle.mjs` 增加真实 Chromium 证据，断言 5×5px 时间线点、7×7px 标题点、running 光晕/脉冲，并以元素 `getBoundingClientRect()` + 伪元素偏移计算页面绝对圆心、按 0.5px 容差验证时间线点与标题点/竖线竖直对齐。`pnpm verify:fast` 通过；focused `session-lifecycle` 通过（9.989s）；最终 `pnpm verify` 12/12 通过（130.352s）；`git diff --check` 通过。现有 `http://127.0.0.1:3080/` 刷新后实测 8 个时间线节点，computed style 为 5×5px/left 1px/top 4px，标题点 7×7px，running 节点为 `dap-pulse`。
- DESIGN 对照: R-01-009/AC-09 既有 5px 视觉圆点需求保持不变；`DESIGN.md` 已收敛到 C-061 的实际 5px 盒、绝对同圆心、原生圆角与盒内半透明外环，DOM、数据层、行高、文字缩进和状态语义均未改变。
- commit: 1692a31 （最终实现范围另含 d053f37、7049bf0）。
- review:
  - 审核方: Standards reviewer `cdfd4194-2b27-4760-b51a-0b24e442f7cb`；Spec reviewer `aab042f3-c4fc-4867-9331-4498ca1eaa27`。
  - 目的理解: 将活动卡时间线节点整体从与标题点同大的 7～9px 可见轮廓收敛为实际 5px，同时保持标题点 7px、页面绝对圆心对齐、状态色、running 光晕/脉冲及布局不变；同步 AgentMap、测试与生成 bundle。
  - 执行方式: `code-review` skill，固定基线 `9023285df97a23c03c31be14a19752c383dfd53e`，最终范围 `git diff 9023285...1692a31`；Standards/Spec 双轴独立并行审核，findings 由同一审核方复审。
  - 问题与修复: Standards 初审指出仅有 bundle 字符串断言，缺少用户可观察行为证据；以 `7049bf0` 增加真实 Chromium 的尺寸、局部同圆心与 running 动效断言。首次复审继续指出局部 CSS 值未计入容器页面偏移；以 `1692a31` 改为 bounding rect + 伪元素偏移的页面绝对圆心断言并加入 0.5px 容差。同一 Standards reviewer 最终确认两项 hard finding 全部关闭；Spec 各轮均无 finding、无 scope creep。
  - 复审结论: Standards 与 Spec 最终均通过，无遗留 hard violation、smell 或规格偏差。
