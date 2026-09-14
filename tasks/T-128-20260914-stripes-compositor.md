---
doc-type: task
mutation: lifecycle
id: T-128
---

# T-128 运行卡进度条纹动画合成器化：background-position 平移改 transform 载体

状态: active
关联: R-01-009 → 活动状态模型（AC-08 进度条纹呈现）；R-01-014 → 窗格渲染器
风险等级: standard

## 背景与目标

- 背景: T-127 调研确认运行卡进度条纹动画 `dap-stripes` 以 `background-position` 实现滚动——background-position 不是可合成属性，每帧触发重绘（paint）；在移动端抽屉打开时与宿主流式重绘叠加放大 GPU/CPU 开销。T-127 已治理屏外休眠与渲染频率，本 task 处理剩余的逐帧重绘源。
- 目标: 条纹滚动改为合成器驱动的 transform 平移，视觉等价（同周期 20px 双色条纹、同滚动速度、同裁切形态），消除逐帧重绘。
- 非目标: 不改条纹呈现语义（R-01-009/AC-08「持续向右滚动」不变）；不改等待卡脉冲与徽标 brightness 脉冲（filter 为可合成属性，非重绘源）；不动 reduced-motion 行为（保留条纹动画，仅关宽度过渡，现状注释明确）。

## 差距评估

- client.mjs: `.dap-fill` 以 `background: repeating-linear-gradient` + `animation: dap-stripes`（background-position 0 → 40px，0.8s linear infinite）实现；无独立条带载体可供合成。
- 测试: check.mjs:3874 断言 `animation: dap-stripes 0.8s linear infinite;`（动画声明保留即可继续命中）；无 keyframes 内部机制断言。

## 收敛方案

1. `.dap-fill` 保留 width %（进度）+ width 过渡 + box-shadow + border-radius，新增 `overflow: hidden` 裁切载体（自身 box-shadow 不受 overflow 影响，子内容被裁）；移除背景与 animation。
2. 新增 `.dap-fill::after` 伪元素条带：`width: calc(100% + 40px)`（相对 fill 宽度自适应，位移全程覆盖 fill 可视区）、背景 repeating-linear-gradient 原样、`animation: dap-stripes` 改为 `transform: translateX(0) → translateX(-40px)`（40px = 2 个 20px 条纹周期，无缝循环且保持原感知速度）。
3. check.mjs 补 keyframes transform 机制断言。

## 测试计划

- 契约: `scripts/check.mjs`（既有 stripes 动画断言继续命中 + 新增 transform keyframes 断言）。
- E2E: `card-content.mjs`（进度条呈现）、`auto-update.mjs`（运行卡实时更新）、`mobile-thermal.mjs`（功耗回归）。
- 人工: 条纹滚动观感与速度对照由东家验收（acceptance.mjs 既有 AC-08 条目覆盖）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：运行卡进度条条纹持续向右滚动，视觉等价原 background-position 实现 | `e2e/specs/card-content.mjs::cardContent`、`scripts/check.mjs#dap-stripes` |
| 异常 | 适用：进度为 null/零宽度时条纹无可视面积，无渲染开销 | `e2e/specs/card-content.mjs::cardContent`、`scripts/check.mjs#dap-stripes` |
| 边界配置 | 适用：极小进度宽度下位移全程仍覆盖填充区（calc(100%+40px) 载体）；reduced-motion 行为不变 | `e2e/specs/card-content.mjs::cardContent`、`scripts/check.mjs#dap-stripes` |
| 副作用 | 适用：width 过渡动画保留；功耗回归不劣化 | `e2e/specs/mobile-thermal.mjs::mobileThermal` |

## 终态与证据

- 实现:
- 测试:
- DESIGN 对照:
- commit:
- review:
  - 审核方:
  - 目的理解:
  - 执行方式:
  - 问题与修复:
  - 复审结论:
