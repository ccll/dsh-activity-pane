---
doc-type: task
id: T-094
mutation: lifecycle
---

# T-094 时间线圆点视觉同心与半透明外围恢复

风险等级: standard
状态: completed

## 背景与目标

- 背景: T-093 将时间线节点改为独立 5px 圆盒后，东家实测竖线没有从所有圆点的视觉中心穿过，且此前小圆外围的半透明环消失。
- 根因: 5px 节点盒与 7px 标题点/1px 竖线在不同 DPR 下存在光栅取整相位差；同时普通节点外扩半透明 box-shadow 被删除，5px 盒内的 1px border 又把实心核压缩为 3px，未保留此前「5px 核 + 半透明外围」的结构。
- 目标: 恢复 7×7px 同心承载盒，在盒内呈现 5px 实心核，并恢复 1px 半透明外围；竖线、时间线承载盒与标题点严格共用圆心，running 光晕与脉冲保留。
- 非目标: 不改标题点尺寸、时间线行高、文字缩进、状态语义、DOM 或数据层。

## 差距评估

- `src/client.mjs` 当前 `.dap-trace-item::before` 为 `left:1px; width:5px`，数学圆心虽为 x=3.5，但与 `left:0; width:7px` 标题点存在跨 DPR 光栅相位差。
- 当前普通节点没有 box-shadow，外围半透明环仅挤在 5px border-box 内，视觉上已消失。
- `DESIGN.md` 与 C-061 固化了实际 5px 盒，需要以东家本次现场反馈修订；PRD R-01-009/AC-09 的「5px 视觉圆点 + 半透明外环 + 同圆心」无需改写。
- 现有 browser E2E 只验证页面绝对几何中心，不能裁决不同尺寸圆盒的光栅视觉相位与外围环存在性。

## 收敛方案

1. 以 C-062 修订 C-061：时间线节点恢复 7×7px 同心承载盒（`left:0; top:3px`），盒内用 1px 半透明 border 留出 5px 实心核，普通节点恢复 1px 半透明外扩 ring。
2. running 节点恢复「1px 半透明同色外围 + 6px 光晕 + `dap-pulse`」；竖线继续 `left:3px`。
3. 更新 DESIGN、CSS 几何注释、unit contract、browser E2E 与人工验收，重建 client bundle。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-009/AC-09 | 同心光栅与半透明外围缺陷修复 | UNIT/E2E/MANUAL | update | 浏览器验证同尺寸承载盒绝对同心、5px 核、外围 ring 与 running 动效；DPR 视觉相位继续人工放大验收 |
| DESIGN | 以 7px 同盒恢复跨 DPR 视觉同心和外围 | UNIT/E2E/MANUAL | update | 更新 C-062、设计、contract、browser evidence 与验收步骤 |

## 测试计划

- 测试先行：改写 `scripts/check.mjs` 与 `e2e/specs/session-lifecycle.mjs`，旧实现下必须因 7px 承载盒/5px 核/普通外围缺失而失败。
- `pnpm verify:fast`。
- focused `PLAYWRIGHT_BROWSERS_PATH=0 node e2e/run.mjs session-lifecycle`。
- `pnpm verify` 完整 12 spec。
- 现有 GUI 刷新后检查圆点与竖线视觉同心、普通/运行圆点外围可见。
- 独立 `code-review` 双轴审核并复审 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：7px 同心承载盒内呈现 5px 核与半透明外围 | `e2e/specs/session-lifecycle.mjs#R-01-009/AC-09`、`scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::width: 7px; height: 7px;` |
| 异常 | 不适用：纯 CSS 呈现修复，无失败路径 | — |
| 边界配置 | 适用：承载盒、标题点、竖线页面绝对圆心一致，跨 DPR 视觉相位由同尺寸盒保证 | `e2e/specs/session-lifecycle.mjs#R-01-009/AC-09`、`scripts/acceptance.mjs#R-01-009/AC-09`、`src/client.mjs::left: 0; top: 3px;` |
| 副作用 | 适用：标题点、状态色、running 光晕/脉冲、行高与子代理裁切行为不变 | `e2e/specs/session-lifecycle.mjs#R-01-009/AC-09`、`scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::animation: dap-pulse 1.15s ease-in-out infinite;` |
| 兼容性 | 适用：继续使用原生圆角裁剪，不恢复硬停色 radial-gradient | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::background: #778394; background-clip: padding-box;` |

## 终态与证据

- 实现: `src/client.mjs` 将时间线节点恢复为 `left:0; top:3px; width:7px; height:7px` 的同心承载盒；1px 半透明 border 在盒内留出 5px 实心核，普通节点恢复 `0 0 0 1px` 半透明外围，running 节点恢复同色外围并保留 6px 光晕与 `dap-pulse`；竖线继续 `left:3px`，标题点保持 7px；`.dsh-plugin/client.js` 已重建。`DESIGN.md` 与 C-062 同步修订 C-061。
- 测试: 测试先行改写 `scripts/check.mjs` 与 `e2e/specs/session-lifecycle.mjs`，旧实现分别因 7px 承载盒缺失而红（contract AssertionError；browser 实测 actual 5×5 vs expected 7×7），实施后转绿。browser E2E 在真实 Chromium 中验证 7px 同盒、5px 核、页面绝对同心、普通 1px/alpha 0.14 外围、running 1px/alpha 0.16 外围与 6px/alpha 0.65 光晕，并通过三次间隔 300ms 的 opacity 采样证明脉冲实际变化。`pnpm verify:fast` 通过；focused `session-lifecycle` 通过（10.406s）；最终 `pnpm verify` 12/12 通过（134.113s）；`git diff --check` 通过。现有 `http://127.0.0.1:3080/` 刷新后在 DPR 2 截图目验竖线从全部节点中心穿过、普通外围可见；computed style 实测节点/标题均 7px，三者页面中心均为 x=303.5，节点 border 1px、普通外围为 alpha 0.14 的 1px ring。
- DESIGN 对照: R-01-009/AC-09 的「5px 视觉圆点、半透明外围、竖线同圆心」保持不变；`DESIGN.md` 已收敛到 C-062 的 7px 同相位承载盒、5px 实心核、普通/running 外围与原生圆角方案，标题点、行高、文字缩进、DOM、数据层和状态语义均未改变。
- commit: de0eec5 （实现提交另含 f8cf1aa）。
- review:
  - 审核方: Standards reviewer `7e8e57df-70dd-485e-8db1-058f6589cfeb`；Spec reviewer `5249cd32-925f-4bc3-9880-d779f63a1e3b`。
  - 目的理解: 修复实际 5px 圆盒与 7px 标题盒在不同 DPR 下的视觉相位偏移，恢复「7px 同心承载盒内 5px 实心核 + 1px 半透明外围」，保持标题点 7px、竖线同心及 running 光晕/脉冲不变。
  - 执行方式: `code-review` skill，固定基线 `6d065e49d50139733fd94ec1b4e98998182053e6`，最终范围 `git diff 6d065e49...de0eec5`；Standards/Spec 双轴独立并行审核，finding 由同一审核方复审。
  - 问题与修复: Standards 初审指出 E2E 仅判断 shadow 非空和动画名称，不能证明半透明外围、6px 光晕分层及脉冲实际发生；以 `de0eec5` 精确断言普通/running ring 与 glow 的 computed shadow，并跨时间采样 opacity。原 Standards reviewer 复审确认 finding 关闭；Spec 初审与最终复审均无 finding、无 scope creep。
  - 复审结论: Standards 与 Spec 最终均通过，无遗留 hard violation、smell 或规格偏差。
