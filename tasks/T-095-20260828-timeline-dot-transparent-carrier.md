---
doc-type: task
id: T-095
mutation: lifecycle
---

# T-095 时间线小圆核与透明同心承载盒

风险等级: standard
状态: active

## 背景与目标

- 背景: T-094 恢复 7px 同心承载盒后，同时把承载盒的 border 与 box-shadow 画成可见轮廓，东家实测时间线节点又与标题前 7px 圆点一样大。
- 根因: 7px 承载盒既承担跨 DPR 对齐，又被直接用于外围绘制；5px 实心核虽存在，但可见外围把整体节点重新放大到 7～9px。
- 目标: 保留透明 7×7px 同心承载盒，仅在盒内显示 5px 实心圆核；半透明光晕基于 5px 圆核的 alpha 轮廓生成，不显露承载盒边界；竖线仍与承载盒/圆核视觉同心，标题点保持 7px。
- 非目标: 不改标题点、时间线行高、文字缩进、状态语义、DOM 或数据层。

## 差距评估

- `src/client.mjs` 当前 7px 承载盒使用可见 1px border，并用 box-shadow 沿 7px 盒外扩，导致视觉轮廓不小于标题点。
- 直接回退为 5px 元素会重现 T-094 的跨 DPR 光栅相位偏移。
- CSS `background-clip: padding-box` 已能在 7px border-box 内形成 5px 圆核；只需让 1px border 透明，并用 `filter: drop-shadow(...)` 从圆核实际 alpha 轮廓生成光晕。
- `DESIGN.md` 与 C-062 需要修订；PRD R-01-009/AC-09 的 5px 视觉圆点、半透明外围、同圆心契约无需改写。

## 收敛方案

1. 以 C-063 修订 C-062：7px 承载盒保持 `left:0; top:3px`，1px border 改透明；实体背景继续 `background-clip: padding-box`，仅显示 5px 圆核。
2. 普通节点使用基于圆核 alpha 的 1px `drop-shadow` 半透明光晕；running 使用 1px 同色 halo + 3px 状态 glow，并保留 `dap-pulse`。
3. 删除时间线节点 box-shadow，避免按 7px 承载盒绘制可见外围。
4. 更新 DESIGN、决策、unit contract、browser E2E 与人工验收，重建 bundle。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-009/AC-09 | 5px 视觉层级与同心光晕修复 | UNIT/E2E/MANUAL | update | 验证透明 7px 盒、5px 可见核、无 box-shadow、基于小圆核的 drop-shadow、绝对同心与脉冲 |
| DESIGN | 承载盒与可见图形职责分离 | UNIT/E2E/MANUAL | update | 更新 C-063、设计、contract、browser evidence 与验收步骤 |

## 测试计划

- 测试先行：改写 contract/E2E，旧实现必须因可见 border/box-shadow 与缺少 drop-shadow 而失败。
- `pnpm verify:fast`。
- focused `PLAYWRIGHT_BROWSERS_PATH=0 node e2e/run.mjs session-lifecycle`。
- `pnpm verify` 完整 12 spec。
- 现有 GUI 刷新后在 DPR 2 截图目验：实心核明显小于标题点、竖线居中、光晕跟随小圆核。
- 独立 `code-review` 双轴审核并复审 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：透明 7px 承载盒内仅显示 5px 圆核，视觉主体小于标题点 | `e2e/specs/session-lifecycle.mjs#R-01-009/AC-09`、`scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::border: 1px solid transparent;` |
| 异常 | 不适用：纯 CSS 呈现修复，无失败路径 | — |
| 边界配置 | 适用：隐藏承载盒、圆核、竖线与标题点绝对同心，跨 DPR 共用 7px 盒相位 | `e2e/specs/session-lifecycle.mjs#R-01-009/AC-09`、`scripts/acceptance.mjs#R-01-009/AC-09`、`src/client.mjs::left: 0; top: 3px;` |
| 副作用 | 适用：状态色、running 光晕/脉冲、行高、子代理裁切与标题点不变 | `e2e/specs/session-lifecycle.mjs#R-01-009/AC-09`、`scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::animation: dap-pulse 1.15s ease-in-out infinite;` |
| 兼容性 | 适用：继续使用原生圆角与 background clipping，不恢复硬停色 radial-gradient | `scripts/check.mjs#R-01-009/AC-09`、`src/client.mjs::background-color: #778394; background-clip: padding-box;` |

## 终态与证据

- 实现: 待填写。
- 测试: 待填写。
- DESIGN 对照: 待填写。
- commit: 待填写。
- review: 待填写。
